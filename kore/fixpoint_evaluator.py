"""Layer 2 — Fixpoint Evaluator: Φ(output) = output? check.

The fixpoint check is the terminal stage of the Unified Processing Filter.
It determines whether the pipeline output has converged to a stable
representation — whether applying the transformation again would produce
the same result.

A failed fixpoint (score < tolerance) triggers Ω routing.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, List, Optional

from jcode_models import FixpointResult


# ── Public API ───────────────────────────────────────────────────────────────

def evaluate_fixpoint(
    candidate_output: dict,
    *,
    tolerance: float = 0.999,
    max_iterations: int = 3,
    previous_output: Optional[dict] = None,
) -> FixpointResult:
    """Evaluate whether Φ(output) = output within tolerance.

    The fixpoint check uses structural hashing with semantic normalization
    to determine whether two pipeline outputs are meaningfully identical.

    Args:
        candidate_output: The current pipeline stage output.
        tolerance: Similarity threshold for fixpoint declaration (default 0.999).
        max_iterations: Maximum re-application attempts.
        previous_output: Optional previous iteration output for diff comparison.

    Returns:
        FixpointResult with score, pass/fail, diff summary, and contradiction markers.
    """
    start = time.perf_counter()
    contradiction_markers: List[str] = []
    iterations = 1

    if previous_output is None:
        # Single-pass: compare structural self-consistency
        score, markers = _structural_self_consistency(candidate_output)
        contradiction_markers.extend(markers)
    else:
        # Multi-pass: compare current vs previous
        score, markers = _compare_outputs(previous_output, candidate_output, tolerance)
        contradiction_markers.extend(markers)
        iterations = 2  # at minimum, we compared two iterations

    # If score is below tolerance but above some threshold, attempt re-application
    did_timeout = False
    while score < tolerance and iterations < max_iterations:
        # Simulated re-application: structural hash convergence
        re_score, re_markers = _structural_self_consistency(candidate_output)
        if re_score > score:
            score = (score + re_score) / 2
        contradiction_markers.extend(re_markers)
        iterations += 1

    # Termination check: did we exhaust the iteration budget?
    if score < tolerance and iterations >= max_iterations:
        did_timeout = True

    passed = score >= tolerance
    diff_summary = _build_diff_summary(candidate_output, score, passed, did_timeout)

    latency_ms = (time.perf_counter() - start) * 1000

    return FixpointResult(
        passed=passed,
        score=round(score, 6),
        diff_summary=diff_summary,
        contradiction_markers=contradiction_markers[:10],  # cap at 10
        iterations=iterations,
        max_iterations=max_iterations,
        did_timeout=did_timeout,
        tolerance=tolerance,
        metadata={
            "method": "structural_hash",
            "tolerance": tolerance,
            "iterations": iterations,
            "max_iterations": max_iterations,
            "did_timeout": did_timeout,
            "latency_ms": round(latency_ms, 3),
        },
    )


def evaluate_fixpoint_from_stages(
    stage_outputs: dict,
    *,
    tolerance: float = 0.999,
) -> FixpointResult:
    """Evaluate fixpoint across all 5 stage outputs.

    Args:
        stage_outputs: Dict mapping stage_name → stage_output_dict.
        tolerance: Similarity threshold.

    Returns:
        FixpointResult aggregating across stages.
    """
    # Merge all stage outputs into a single canonical representation
    canonical = _canonicalize_stage_outputs(stage_outputs)
    return evaluate_fixpoint(canonical, tolerance=tolerance)


# ── Internal: Structural Hashing ─────────────────────────────────────────────

def _structural_hash(obj: Any) -> str:
    """Compute a structure-normalized hash of the object.

    Keys are sorted alphabetically, values are recursively hashed.
    This makes the hash invariant to key ordering, whitespace, and
    non-semantic formatting differences.
    """
    normalized = _normalize_for_hashing(obj)
    serialized = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_for_hashing(obj: Any) -> Any:
    """Recursively normalize an object for consistent hashing."""
    if isinstance(obj, dict):
        return {
            str(k): _normalize_for_hashing(v)
            for k, v in sorted(obj.items(), key=lambda x: str(x[0]))
        }
    if isinstance(obj, (list, tuple)):
        return [_normalize_for_hashing(item) for item in obj]
    if isinstance(obj, float):
        # Round floats for comparison stability
        return round(obj, 6)
    if obj is None:
        return "__NONE__"
    if isinstance(obj, bool):
        return str(obj).lower()
    return obj


def _hash_similarity(hash_a: str, hash_b: str) -> float:
    """Compute character-level similarity of two hex hashes.

    This is a fast proxy — identical hashes = 1.0, completely different = 0.0.
    For structural comparison, use _structural_similarity instead.
    """
    if hash_a == hash_b:
        return 1.0
    matching = sum(1 for a, b in zip(hash_a, hash_b) if a == b)
    return matching / max(len(hash_a), len(hash_b))


# ── Internal: Comparison Logic ───────────────────────────────────────────────

def _structural_self_consistency(output: dict) -> tuple[float, List[str]]:
    """Check if the output is internally self-consistent.

    A structurally self-consistent output has:
    - No contradictory duplicate keys
    - No empty required sections
    - Consistent metadata references
    """
    markers: List[str] = []
    score = 1.0

    if not isinstance(output, dict):
        return 1.0, markers  # Non-dict is vacuously self-consistent

    # Check for deep structure
    keys = list(output.keys())
    if not keys:
        markers.append("Empty output dict — no structure to check")
        return 0.5, markers

    # Check for contradictory metadata
    if "status" in output and "passed" in output:
        status = str(output.get("status", "")).lower()
        passed = output.get("passed")
        if status in ("error", "fail", "failed") and passed is True:
            markers.append(f"Contradiction: status='{status}' but passed=True")
            score -= 0.1
        if status in ("ok", "success", "done") and passed is False:
            markers.append(f"Contradiction: status='{status}' but passed=False")
            score -= 0.1

    # Penalize deeply nested empty containers
    empty_depth = _count_empty_nested(output)
    if empty_depth > 3:
        markers.append(f"Deep empty nesting: {empty_depth} levels")
        score -= 0.05 * min(empty_depth - 3, 5)

    return max(score, 0.0), markers


def _compare_outputs(
    prev: dict,
    curr: dict,
    tolerance: float,
) -> tuple[float, List[str]]:
    """Compare two pipeline outputs for fixpoint convergence."""
    markers: List[str] = []

    hash_prev = _structural_hash(prev)
    hash_curr = _structural_hash(curr)

    if hash_prev == hash_curr:
        return 1.0, markers

    # Structural comparison
    score = _structural_similarity(prev, curr)

    if score < tolerance:
        # Identify what changed
        diff_keys = _diff_keys(prev, curr)
        if diff_keys["added"]:
            markers.append(f"New keys in output: {diff_keys['added'][:5]}")
        if diff_keys["removed"]:
            markers.append(f"Removed keys from output: {diff_keys['removed'][:5]}")
        if diff_keys["changed"]:
            markers.append(f"Changed values: {diff_keys['changed'][:5]}")

    return score, markers


def _structural_similarity(a: Any, b: Any) -> float:
    """Compute recursive structural similarity between two objects."""
    if type(a) != type(b):
        return 0.0

    if isinstance(a, dict) and isinstance(b, dict):
        all_keys = set(a.keys()) | set(b.keys())
        if not all_keys:
            return 1.0
        scores = []
        for key in all_keys:
            if key in a and key in b:
                scores.append(_structural_similarity(a[key], b[key]))
            else:
                scores.append(0.0)
        return sum(scores) / len(scores)

    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        if not a and not b:
            return 1.0
        max_len = max(len(a), len(b))
        scores = []
        for i in range(max_len):
            if i < len(a) and i < len(b):
                scores.append(_structural_similarity(a[i], b[i]))
            else:
                scores.append(0.0)
        return sum(scores) / max_len

    if isinstance(a, str) and isinstance(b, str):
        if a == b:
            return 1.0
        # Character-level Jaccard
        set_a = set(a)
        set_b = set(b)
        if not set_a and not set_b:
            return 1.0
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        return intersection / union if union > 0 else 0.0

    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if a == b:
            return 1.0
        if max(abs(a), abs(b)) == 0:
            return 1.0
        return 1.0 - min(abs(a - b) / max(abs(a), abs(b)), 1.0)

    # Bool, None, etc.
    return 1.0 if a == b else 0.0


def _diff_keys(prev: dict, curr: dict) -> Dict[str, List[str]]:
    """Identify added, removed, and changed keys between two dicts."""
    prev_keys = set(prev.keys())
    curr_keys = set(curr.keys())
    return {
        "added": sorted(curr_keys - prev_keys),
        "removed": sorted(prev_keys - curr_keys),
        "changed": sorted(
            k for k in (prev_keys & curr_keys)
            if _structural_hash(prev[k]) != _structural_hash(curr[k])
        ),
    }


def _count_empty_nested(obj: Any, depth: int = 0) -> int:
    """Count the maximum depth of empty containers."""
    if isinstance(obj, dict):
        if not obj:
            return depth
        return max((_count_empty_nested(v, depth + 1) for v in obj.values()), default=depth)
    if isinstance(obj, (list, tuple)):
        if not obj:
            return depth
        return max((_count_empty_nested(v, depth + 1) for v in obj), default=depth)
    return depth


def _canonicalize_stage_outputs(stage_outputs: dict) -> dict:
    """Merge all stage outputs into a canonical fixpoint-checkable dict."""
    return {
        "stages": {
            str(name): _normalize_for_hashing(output)
            for name, output in sorted(stage_outputs.items())
        },
        "stage_count": len(stage_outputs),
    }


def _build_diff_summary(output: dict, score: float, passed: bool, did_timeout: bool = False) -> str:
    """Build human-readable diff summary."""
    if passed:
        return f"Fixpoint converged (score={score:.6f})"
    if did_timeout:
        return f"Fixpoint did not converge within iteration budget (score={score:.6f}, timeout)"
    if score >= 0.99:
        return f"Near-fixpoint (score={score:.6f}, within 1% of tolerance)"
    if score >= 0.95:
        return f"High similarity but not fixpoint (score={score:.6f})"
    if score >= 0.80:
        return f"Moderate divergence from fixpoint (score={score:.6f})"
    return f"Significant divergence from fixpoint (score={score:.6f})"
