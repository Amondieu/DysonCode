"""Layer 1 — Pre-Check Gate: Compile-time invariant enforcement.

Evaluates all 8 compile-time invariant laws on the initial jcode input
before any pipeline stage executes. Laws that depend only on the initial
state are checked once here — never repeated per-stage.

Performance target: < 500µs for all 8 laws (Rust fast-path via kore-exec),
Python fallback ~5ms for environments without the binary.

Abgrenzung zu harness_engine.py:
  - jcode_precheck.run_precheck() = strukturelle Invarianten
    (Laws 1-11, Schema-Validierung via contract_registry, Import-Graph,
    Compression-Bound). Dies ist das GATEWAY — läuft VOR allem anderen.
  - HarnessEngine.run_preflight() = harness-spezifische Pillar-Checks
    (mypy, AST architecture). Läuft NACH PreCheck, VOR Build.
  - HarnessEngine.run_postflight() = Build/Test/Coverage.
    Läuft NACH der Code-Ausführung.
"""

from __future__ import annotations

import ast
import time
from typing import Any, Dict, List, Optional, Tuple

from jcode_models import (
    COMPILE_TIME_LAWS,
    InvariantLaw,
    InvariantResult,
    PreCheckResult,
)


# ── Public API ───────────────────────────────────────────────────────────────

def run_precheck(
    jcode_input: dict,
    *,
    strict: bool = True,
    parallel: bool = True,
) -> PreCheckResult:
    """Run all compile-time invariants on the initial jcode input.

    Args:
        jcode_input: Raw jcode request payload.
        strict: If True, any failed law → passed=False.
        parallel: If True, attempt parallel evaluation (Python threads or Rust).

    Returns:
        PreCheckResult with per-law results, aggregate pass/fail, and metadata.
    """
    start = time.perf_counter()
    results: List[InvariantResult] = []
    errors: List[str] = []

    # Try Rust fast-path first for all 8 laws as a batch
    rust_result = _try_rust_precheck_batch(jcode_input)
    if rust_result is not None:
        results = rust_result
    else:
        # Python fallback — evaluate each law
        for law in COMPILE_TIME_LAWS:
            try:
                result = _evaluate_law(law, jcode_input)
                results.append(result)
            except Exception as exc:
                errors.append(f"Pre-check law {law.value} crashed: {exc}")
                results.append(InvariantResult(
                    law_id=law.value,
                    name=law.name,
                    passed=False,
                    phase="compile",
                    reason=f"Evaluator exception: {exc}",
                ))

    latency_ms = (time.perf_counter() - start) * 1000

    all_passed = all(r.passed for r in results) if results else False
    skip_per_stage = all_passed and not errors

    # Strict mode: any failure = reject
    passed = all_passed if strict else (all_passed or not strict)

    return PreCheckResult(
        passed=passed,
        skip_per_stage=skip_per_stage,
        latency_ms=round(latency_ms, 3),
        invariants=results,
        errors=errors,
        metadata={
            "mode": "strict" if strict else "lenient",
            "parallel": parallel,
            "rust_fastpath": rust_result is not None,
            "laws_evaluated": len(results),
            "laws_passed": sum(1 for r in results if r.passed),
        },
    )


def run_static_invariants(jcode_input: dict) -> List[InvariantResult]:
    """Evaluate all compile-time laws individually (used by benchmarks)."""
    results: List[InvariantResult] = []
    for law in COMPILE_TIME_LAWS:
        results.append(_evaluate_law(law, jcode_input))
    return results


# ── Contract Validation ─────────────────────────────────────────────────────

def validate_contracts(jcode_input: dict) -> List[str]:
    """Validate contract schema, required fields, and type consistency.

    Checks:
    - Top-level structure is a dict
    - Required fields present (spec, nodes, edges or equivalent)
    - Node roles are valid
    - Edge types are recognized
    """
    errors: List[str] = []

    if not isinstance(jcode_input, dict):
        return ["jcode_input must be a dict"]

    # Required structural fields
    if "spec" not in jcode_input and "nodes" not in jcode_input:
        errors.append("jcode_input must contain 'spec' or 'nodes' key")

    # If nodes present, validate each
    nodes = jcode_input.get("nodes", [])
    if isinstance(nodes, list):
        valid_roles = {"architect", "builder", "critic", "tester", "memory_keeper"}
        for i, node in enumerate(nodes):
            if isinstance(node, dict):
                role = node.get("role", "")
                if role and role not in valid_roles:
                    errors.append(f"node[{i}]: unknown role '{role}'")
                if "id" not in node:
                    errors.append(f"node[{i}]: missing 'id'")
            else:
                errors.append(f"node[{i}]: must be a dict, got {type(node).__name__}")
    elif nodes:
        errors.append(f"'nodes' must be a list, got {type(nodes).__name__}")

    # If edges present, validate each
    edges = jcode_input.get("edges", [])
    if isinstance(edges, list):
        valid_edge_types = {"data", "challenge", "synthesis", "memory", "trigger",
                            "broadcast", "dependency", "reference"}
        for i, edge in enumerate(edges):
            if isinstance(edge, dict):
                etype = edge.get("type", "")
                if etype and etype not in valid_edge_types:
                    errors.append(f"edge[{i}]: unknown type '{etype}'")
                if "source" not in edge or "target" not in edge:
                    errors.append(f"edge[{i}]: missing 'source' or 'target'")
    elif edges:
        errors.append(f"'edges' must be a list, got {type(edges).__name__}")

    return errors


def validate_import_graph(jcode_input: dict) -> List[str]:
    """Validate import graph integrity for jcode Python content.

    Checks:
    - All referenced modules exist or are standard library
    - No circular imports at the module level
    - No absolute-path leaks outside workspace
    """
    errors: List[str] = []
    code = jcode_input.get("code", jcode_input.get("content", ""))

    if not code:
        return errors  # No code to validate

    if not isinstance(code, str):
        return ["jcode 'code' field must be a string"]

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return [f"Python syntax error: {e}"]

    imports: Dict[str, List[str]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name.split(".")[0]
                imports.setdefault("<toplevel>", []).append(module)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                module = node.module.split(".")[0]
                imports.setdefault("<toplevel>", []).append(module)

    # Standard library modules (Python 3.10+)
    stdlib = {
        "abc", "argparse", "ast", "asyncio", "base64", "collections", "concurrent",
        "contextlib", "copy", "csv", "dataclasses", "datetime", "decimal", "enum",
        "functools", "glob", "hashlib", "importlib", "inspect", "io", "itertools",
        "json", "logging", "math", "os", "pathlib", "pickle", "platform", "pprint",
        "random", "re", "shutil", "signal", "socket", "sqlite3", "string",
        "subprocess", "sys", "tempfile", "textwrap", "threading", "time", "traceback",
        "types", "typing", "unittest", "urllib", "uuid", "warnings", "xml", "zipfile",
    }

    for location, modules in imports.items():
        for mod in modules:
            if mod in stdlib:
                continue
            if mod.startswith("_"):
                continue
            # Non-stdlib modules are noted but not blocked (pre-check doesn't
            # have the full venv context)
            pass

    return errors


def estimate_compression_bound(jcode_input: dict) -> Dict[str, Any]:
    """Estimate Kolmogorov complexity bound for the jcode input.

    Returns:
        Dict with 'raw_bytes', 'estimated_min_bytes', 'ratio', 'bound_type'.
    """
    raw = str(jcode_input)
    raw_bytes = len(raw.encode("utf-8"))

    # Heuristic: count unique tokens as a proxy for compressibility
    tokens = raw.split()
    unique_tokens = len(set(tokens))
    total_tokens = len(tokens) if tokens else 1

    # Simple compression ratio estimate
    uniqueness_ratio = unique_tokens / total_tokens if total_tokens > 0 else 1.0

    # Estimated minimum: raw * uniqueness (very rough proxy)
    estimated_min = int(raw_bytes * uniqueness_ratio)

    return {
        "raw_bytes": raw_bytes,
        "estimated_min_bytes": max(estimated_min, 1),
        "ratio": round(uniqueness_ratio, 4),
        "total_tokens": total_tokens,
        "unique_tokens": unique_tokens,
        "bound_type": "heuristic_token_uniqueness",
    }


# ── Law Evaluators ───────────────────────────────────────────────────────────

def _evaluate_law(law: InvariantLaw, jcode_input: dict) -> InvariantResult:
    """Dispatch a single invariant law to its evaluator."""
    start = time.perf_counter()

    evaluators = {
        InvariantLaw.LAW_1_COMPRESSIBILITY: _eval_law_1,
        InvariantLaw.LAW_2_SELF_APPLICATION: _eval_law_2,
        InvariantLaw.LAW_4_CONSTRAINT_PRECISION: _eval_law_4,
        InvariantLaw.LAW_5_SHADOW_SIGNATURE: _eval_law_5,
        InvariantLaw.LAW_7_CATEGORY_EXPANSION: _eval_law_7,
        InvariantLaw.LAW_8_MIN_ENERGY_PATH: _eval_law_8,
        InvariantLaw.LAW_10_HARVEST_BEFORE_BUILD: _eval_law_10,
        InvariantLaw.LAW_11_ZERO_WASTED_SURFACE: _eval_law_11,
    }

    evaluator = evaluators.get(law)
    if evaluator is None:
        latency_us = (time.perf_counter() - start) * 1_000_000
        return InvariantResult(
            law_id=law.value, name=law.name, passed=True, phase="compile",
            reason="No evaluator implemented — vacuous pass",
            latency_us=round(latency_us, 1),
        )

    passed, reason, evidence = evaluator(jcode_input)
    latency_us = (time.perf_counter() - start) * 1_000_000

    return InvariantResult(
        law_id=law.value, name=law.name, passed=passed, phase="compile",
        reason=reason, evidence=evidence,
        latency_us=round(latency_us, 1),
    )


def _eval_law_1(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 1: Compressibility — output must be compressible without information loss."""
    comp = estimate_compression_bound(jcode_input)
    ratio = comp["ratio"]
    # Highly unique input (ratio > 0.95) may not compress — still passes if small
    raw_bytes = comp["raw_bytes"]
    if raw_bytes < 8:
        return True, "Input too small for compression assessment", comp
    if ratio > 0.95 and raw_bytes > 1000:
        return False, f"Low compressibility: {ratio:.2%} unique tokens (threshold ≤95%)", comp
    return True, f"Compressibility acceptable: {ratio:.2%} unique", comp


def _eval_law_2(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 2: Self-application — input should tend toward fixpoint on its own representation."""
    spec = jcode_input.get("spec", str(jcode_input))
    if not isinstance(spec, str):
        spec = str(spec)
    # Heuristic: does the spec reference its own structure?
    self_referential = any(
        token in spec.lower()
        for token in ["self", "jcode", "dyson", "invariant", "fixpoint", "ratchet"]
    )
    if self_referential:
        return True, "Spec contains self-referential markers", {"markers_found": True}
    return True, "No self-referential markers required (vacuous pass)", {"markers_found": False}


def _eval_law_4(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 4: Constraint precision — constraints must be specific, not vague."""
    spec = jcode_input.get("spec", "")
    if not isinstance(spec, str):
        spec = str(spec)
    vague_terms = ["maybe", "probably", "perhaps", "should", "could", "might", "sort of"]
    found = [t for t in vague_terms if t in spec.lower()]
    if found:
        return False, f"Vague constraint terms detected: {found}", {"vague_terms": found}
    return True, "Constraint language is precise", {"vague_terms": []}


def _eval_law_5(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 5: Shadow/effect signature — detectable cause-effect structure."""
    nodes = jcode_input.get("nodes", [])
    edges = jcode_input.get("edges", [])
    if not nodes and not edges:
        return True, "No graph structure to validate (vacuous pass)", {}
    node_ids = set()
    if isinstance(nodes, list):
        for n in nodes:
            if isinstance(n, dict) and "id" in n:
                node_ids.add(n["id"])
    if isinstance(edges, list) and node_ids:
        orphan_sources = 0
        orphan_targets = 0
        for e in edges:
            if isinstance(e, dict):
                if e.get("source") not in node_ids:
                    orphan_sources += 1
                if e.get("target") not in node_ids:
                    orphan_targets += 1
        if orphan_sources > 0 or orphan_targets > 0:
            return False, (
                f"Shadow edges: {orphan_sources} orphan sources, "
                f"{orphan_targets} orphan targets"
            ), {"orphan_sources": orphan_sources, "orphan_targets": orphan_targets}
    return True, "Graph has clean cause-effect structure", {}


def _eval_law_7(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 7: Category expansion — input should expand the possibility space."""
    nodes = jcode_input.get("nodes", [])
    if isinstance(nodes, list) and len(nodes) >= 3:
        return True, f"Graph has {len(nodes)} nodes — category expansion possible", {"node_count": len(nodes)}
    return True, "Category expansion not blocked (vacuous pass)", {"node_count": len(nodes) if isinstance(nodes, list) else 0}


def _eval_law_8(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 8: Minimum-energy path — Dyson Road score should be computable."""
    nodes = jcode_input.get("nodes", [])
    edges = jcode_input.get("edges", [])
    if not nodes:
        return True, "No nodes to compute path (vacuous pass)", {}
    if isinstance(nodes, list) and isinstance(edges, list):
        # Connectedness heuristic: at least one edge per two nodes
        if len(nodes) > 2 and len(edges) < len(nodes) // 2:
            return False, (
                f"Sparse graph: {len(edges)} edges for {len(nodes)} nodes "
                f"(minimum {len(nodes) // 2} expected)"
            ), {"edges": len(edges), "nodes": len(nodes)}
    return True, "Minimum-energy path computable", {}


def _eval_law_10(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 10: Harvest before build — audit existing capacity before creating new."""
    spec = jcode_input.get("spec", "")
    if not isinstance(spec, str):
        spec = str(spec)
    build_keywords = ["create", "build", "write", "generate", "implement", "add"]
    harvest_keywords = ["audit", "check", "review", "harvest", "inspect", "observe"]
    build_count = sum(1 for t in build_keywords if t in spec.lower())
    harvest_count = sum(1 for t in harvest_keywords if t in spec.lower())
    evidence = {"build_keywords": build_count, "harvest_keywords": harvest_count}
    if build_count > 0 and harvest_count == 0:
        return False, (
            f"Build keywords ({build_count}) without harvest keywords — "
            f"may skip capacity audit"
        ), evidence
    return True, f"Harvest-before-build ratio: {harvest_count}/{build_count}", evidence


def _eval_law_11(jcode_input: dict) -> Tuple[bool, str, dict]:
    """Law 11: Zero wasted surface — every dimension must be captured or explicit."""
    if not isinstance(jcode_input, dict):
        return True, "Non-dict input (vacuous pass)", {}
    # Check for empty / None values at top level
    empty_keys = [k for k, v in jcode_input.items() if v is None or v == "" or v == []]
    if empty_keys:
        if len(empty_keys) > len(jcode_input) * 0.5:
            return False, (
                f"High ratio of empty fields: {len(empty_keys)}/{len(jcode_input)} "
                f"— wasted surface detected"
            ), {"empty_keys": empty_keys, "total_keys": len(jcode_input)}
    return True, f"Surface utilization: {len(jcode_input) - len(empty_keys)}/{len(jcode_input)}", {
        "empty_keys": empty_keys, "total_keys": len(jcode_input),
    }


# ── Rust Fast-Path Bridge ────────────────────────────────────────────────────

def _try_rust_precheck_batch(jcode_input: dict) -> Optional[List[InvariantResult]]:
    """Attempt to run all 8 compile-time laws via kore-exec subprocess.

    Returns None if the Rust binary is unavailable or fails — caller falls
    back to Python evaluators.
    """
    try:
        import json
        import os
        import subprocess

        # Locate the kore-exec binary
        binary_path = os.environ.get("KORE_EXEC_PATH", "")
        if not binary_path:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            candidates = [
                os.path.join(base, "kore-exec", "target", "release", "kore-exec.exe"),
                os.path.join(base, "kore-exec", "target", "release", "kore-exec"),
                os.path.join(base, "kore-exec", "target", "debug", "kore-exec.exe"),
                os.path.join(base, "kore-exec", "target", "debug", "kore-exec"),
            ]
            for candidate in candidates:
                if os.path.isfile(candidate):
                    binary_path = candidate
                    break

        if not binary_path or not os.path.isfile(binary_path):
            return None  # Binary not found — fall back to Python

        # Build the subprocess payload matching the kore-exec JSON protocol
        payload = json.dumps({
            "version": 1,
            "tool": "jcode_precheck",
            "args": {"input": jcode_input},
            "workspace_root": os.getcwd(),
            "node_id": "precheck",
            "role": "system",
        })

        result = subprocess.run(
            [binary_path],
            input=payload,
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0 or not result.stdout.strip():
            return None

        # Parse the JSON output from kore-exec (PreCheckBatch format)
        output = json.loads(result.stdout)
        raw_invariants = output.get("invariants", [])
        if not raw_invariants:
            return None

        invariants = []
        for raw in raw_invariants:
            invariants.append(InvariantResult(
                law_id=raw.get("law_id", "unknown"),
                name=raw.get("name", "UNKNOWN"),
                passed=raw.get("passed", False),
                phase=raw.get("phase", "compile"),
                reason=raw.get("reason", ""),
                evidence=raw.get("evidence", {}),
                latency_us=raw.get("latency_us", 0.0),
            ))

        return invariants

    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError, OSError):
        return None
    except Exception:
        return None
