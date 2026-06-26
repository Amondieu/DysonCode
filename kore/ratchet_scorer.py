"""Layer 3 — Ratchet Condition Scorer (ΦΩΡGΕ Organ).

Scores every jcode output across the 7 Ratchet Conditions.
RC < 4 → "useful_artifact" (tagged, not ratcheted)
RC ≥ 5 → "permanent_ratchet" (irreversible knowledge gain)
RC = 7 → Substrate-independent, self-teaching, maximally compressed

The scorer emits improvement hints for re-optimization loops, not just
classification. This enables the replanner to target specific RC gaps.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from jcode_models import (
    PipelineResult,
    RatchetCondition,
    RatchetScore,
    RC_DESCRIPTIONS,
)


# ── Public API ───────────────────────────────────────────────────────────────

def score_ratchet(pipeline_result: PipelineResult) -> RatchetScore:
    """Score a pipeline result against all 7 ratchet conditions.

    Args:
        pipeline_result: Result from jcode_pipeline.run_jcode_pipeline().

    Returns:
        RatchetScore with total 0–7, verdict, per-condition reasoning.
    """
    conditions: Dict[str, bool] = {}
    reasoning: Dict[str, str] = {}

    for rc in RatchetCondition:
        evaluator = _RC_EVALUATORS.get(rc)
        if evaluator:
            passed, reason = evaluator(pipeline_result)
            conditions[rc.value] = passed
            reasoning[rc.value] = reason
        else:
            conditions[rc.value] = False
            reasoning[rc.value] = "No evaluator implemented"

    total = sum(1 for v in conditions.values() if v)
    verdict = "permanent_ratchet" if total >= 5 else "useful_artifact"

    improvement_hints = suggest_ratchet_improvements(
        RatchetScore(total=total, verdict=verdict, conditions=conditions, reasoning=reasoning),
        pipeline_result,
    )

    return RatchetScore(
        total=total,
        verdict=verdict,
        conditions=conditions,
        reasoning=reasoning,
        improvement_hints=improvement_hints,
        metadata={
            "rc_threshold_permanent": 5,
            "rc_max": 7,
            "pipeline_passed": pipeline_result.passed,
            "fixpoint_passed": pipeline_result.fixpoint_passed,
        },
    )


def suggest_ratchet_improvements(
    score: RatchetScore,
    pipeline_result: PipelineResult,
) -> List[str]:
    """Generate concrete improvement hints for failed RC conditions.

    These hints feed back into the replanning loop — each hint targets
    a specific RC gap that can be addressed by an Ω multiplicator.
    """
    hints: List[str] = []

    if not score.conditions.get(RatchetCondition.RC1_ACTIVE_TENSION.value, False):
        hints.append(
            "RC1: Inject productive tension — add a critic node with opposing "
            "constraints before the next execution pass."
        )

    if not score.conditions.get(RatchetCondition.RC2_ZERO_REPRODUCTION_COST.value, False):
        hints.append(
            "RC2: Compress output via Ω1 Kolmogorov minimizer — strip non-essential "
            "fields and deduplicate redundant structures."
        )

    if not score.conditions.get(RatchetCondition.RC3_EXPANDS_SOLUTION_SPACE.value, False):
        hints.append(
            "RC3: Add a divergent exploration stage — generate 3 variant outputs "
            "and select the one with highest solution-space cardinality."
        )

    if not score.conditions.get(RatchetCondition.RC4_TEACHING_MECHANISM.value, False):
        hints.append(
            "RC4: Embed teaching mechanism — ensure the output contains its own "
            "explanation (inline comments, rationale, or self-describing structure)."
        )

    if not score.conditions.get(RatchetCondition.RC5_PRODUCTIVE_CONTRADICTIONS.value, False):
        hints.append(
            "RC5: Surface contradictions explicitly — tag unresolved tensions as "
            "'productive_contradiction' metadata rather than resolving them prematurely."
        )

    if not score.conditions.get(RatchetCondition.RC6_EMBEDS_COMPRESSION.value, False):
        hints.append(
            "RC6: Add compression operator — include a 'compressed_view' or "
            "'essence' field that captures the minimal representation."
        )

    if not score.conditions.get(RatchetCondition.RC7_SUBSTRATE_INDEPENDENT.value, False):
        hints.append(
            "RC7: Translate to alternative representation — verify that the "
            "principle survives JSON→YAML, Python→Rust, or English→German translation."
        )

    return hints


# ── Per-Condition Evaluators ─────────────────────────────────────────────────

def _eval_rc1_active_tension(result: PipelineResult) -> tuple[bool, str]:
    """RC1: Output maintains productive internal tension.

    Tension = gap between manifold dimension and collapsed field.
    A productive output has unresolved but structured tension.
    """
    manifold = result.stage_by_name("manifold_detection")
    field = result.stage_by_name("field_collapse")

    if not manifold or not field:
        return False, "Missing manifold or field collapse stage output"

    dof = manifold.output.get("effective_dof", 0)
    collapsed = field.output.get("compression_ratio", 1.0)

    # Tension exists when DOF > collapsed representation
    tension = dof > 1 and collapsed < 1.0
    if tension:
        return True, f"Active tension: {dof} DOF vs {collapsed:.1%} compression"
    return False, f"No active tension: {dof} DOF, {collapsed:.1%} compressed"


def _eval_rc2_zero_reproduction_cost(result: PipelineResult) -> tuple[bool, str]:
    """RC2: Output is maximally compressed — near-zero reproduction cost.

    Measured by the compression ratio from field collapse.
    Ratio < 0.3 = highly compressed (pass), > 0.7 = expensive (fail).
    """
    field = result.stage_by_name("field_collapse")
    if not field:
        return False, "Missing field collapse stage output"

    ratio = field.output.get("compression_ratio", 1.0)
    if ratio <= 0.3:
        return True, f"Low reproduction cost: {ratio:.1%} compression ratio"
    if ratio <= 0.6:
        return True, f"Moderate reproduction cost: {ratio:.1%} compression ratio"
    return False, f"High reproduction cost: {ratio:.1%} compression ratio"


def _eval_rc3_expands_solution_space(result: PipelineResult) -> tuple[bool, str]:
    """RC3: Output opens new solution paths.

    Measured by gap geometry: the more gaps identified (and structured),
    the more expansion potential exists.
    """
    gap = result.stage_by_name("gap_geometry")
    manifold = result.stage_by_name("manifold_detection")

    if not gap or not manifold:
        return False, "Missing gap or manifold stage output"

    gap_count = gap.output.get("gap_count", 0)
    dof = manifold.output.get("effective_dof", 0)
    connectivity = gap.output.get("connectivity_ratio", 0)

    # Expansion: gaps exist AND there are degrees of freedom to fill them
    if gap_count > 0 and dof > 0:
        return True, f"Solution space expandable: {gap_count} gaps, {dof} DOF"
    if connectivity > 0.5:
        return True, f"Dense connectivity ({connectivity:.1%}) enables expansion"
    return False, f"No expansion potential: {gap_count} gaps, {dof} DOF, {connectivity:.1%} connected"


def _eval_rc4_teaching_mechanism(result: PipelineResult) -> tuple[bool, str]:
    """RC4: Output contains its own teaching mechanism.

    Detected by: fixpoint convergence (self-describing), manifold clarity,
    and the presence of explicit rationale in stage outputs.
    """
    fixpoint = result.fixpoint
    if not fixpoint:
        return False, "Missing fixpoint result"

    # Self-describing = high fixpoint score (the output is its own description)
    if fixpoint.score >= 0.99:
        return True, f"Output is self-describing (fixpoint score={fixpoint.score:.4f})"

    # Check for explicit rationale in stage metadata
    has_rationale = False
    for stage in result.stages:
        if "rationale" in stage.metadata or "explanation" in stage.output:
            has_rationale = True
            break

    if has_rationale:
        return True, "Output contains explicit teaching metadata"

    return False, (
        f"Teaching mechanism not detected: fixpoint={fixpoint.score:.4f}, "
        f"no explicit rationale"
    )


def _eval_rc5_productive_contradictions(result: PipelineResult) -> tuple[bool, str]:
    """RC5: Contradictions are productive, not noise.

    Productive contradictions = fixpoint markers that reveal structure,
    not arbitrary failures. Detected via fixpoint contradiction markers.
    """
    fixpoint = result.fixpoint
    if not fixpoint:
        return False, "Missing fixpoint result"

    markers = fixpoint.contradiction_markers
    if not markers:
        # No contradictions = nothing to be productive about
        # This is actually a pass — no unproductive noise
        return True, "No contradictions detected — output is clean"

    # Productive if: contradictions exist AND fixpoint is still high
    # (contradictions are structured, not chaotic)
    if fixpoint.score >= 0.95 and len(markers) > 0:
        return True, (
            f"Productive contradictions: {len(markers)} markers, "
            f"fixpoint still {fixpoint.score:.4f}"
        )

    if fixpoint.score < 0.80:
        return False, (
            f"Unproductive contradictions: {len(markers)} markers, "
            f"fixpoint degraded to {fixpoint.score:.4f}"
        )

    return True, f"Contradiction level acceptable: {len(markers)} markers, fixpoint={fixpoint.score:.4f}"


def _eval_rc6_embeds_compression(result: PipelineResult) -> tuple[bool, str]:
    """RC6: Output embeds its own compression operator.

    Detected by: the harvest audit identifying unused capacity AND the
    field collapse successfully reducing it. The output "knows" what's
    essential.
    """
    harvest = result.stage_by_name("harvest_audit")
    field = result.stage_by_name("field_collapse")

    if not harvest or not field:
        return False, "Missing harvest or field collapse stage output"

    utilization = harvest.output.get("utilization_ratio", 1.0)
    compression = field.output.get("compression_ratio", 1.0)
    unused = len(harvest.output.get("unused_capabilities", []))

    # Compression operator embedded = harvest identified waste AND field collapsed it
    if unused > 0 and compression < 0.8:
        return True, (
            f"Compression operator active: {unused} unused capabilities, "
            f"collapsed to {compression:.1%}"
        )
    if utilization >= 0.8:
        return True, f"High utilization ({utilization:.1%}) — compression implicit"
    return False, f"No embedded compression: utilization={utilization:.1%}, compression={compression:.1%}"


def _eval_rc7_substrate_independent(result: PipelineResult) -> tuple[bool, str]:
    """RC7: Output principle survives translation across substrates.

    Detected by: fixpoint convergence (structure is independent of
    representation), manifold dimension stability, and absence of
    substrate-specific markers.
    """
    fixpoint = result.fixpoint
    if not fixpoint:
        return False, "Missing fixpoint result"

    # High fixpoint = structure is representation-stable
    if fixpoint.score >= 0.999:
        return True, "Fixpoint-convergent — principle is substrate-independent"

    # Check stages for substrate lock-in
    substrate_markers = 0
    for stage in result.stages:
        output_str = str(stage.output).lower()
        for marker in ["python", "typescript", "json", "react", "node", "electron"]:
            if marker in output_str:
                substrate_markers += 1

    if substrate_markers > 5 and fixpoint.score < 0.95:
        return False, (
            f"Substrate-locked: {substrate_markers} language-specific markers, "
            f"fixpoint={fixpoint.score:.4f}"
        )

    if fixpoint.score >= 0.95:
        return True, f"Near substrate-independent (fixpoint={fixpoint.score:.4f})"

    return True, "Substrate-independence not disproven"


# ── Evaluator Registry ───────────────────────────────────────────────────────

_RC_EVALUATORS: Dict[RatchetCondition, callable] = {
    RatchetCondition.RC1_ACTIVE_TENSION: _eval_rc1_active_tension,
    RatchetCondition.RC2_ZERO_REPRODUCTION_COST: _eval_rc2_zero_reproduction_cost,
    RatchetCondition.RC3_EXPANDS_SOLUTION_SPACE: _eval_rc3_expands_solution_space,
    RatchetCondition.RC4_TEACHING_MECHANISM: _eval_rc4_teaching_mechanism,
    RatchetCondition.RC5_PRODUCTIVE_CONTRADICTIONS: _eval_rc5_productive_contradictions,
    RatchetCondition.RC6_EMBEDS_COMPRESSION: _eval_rc6_embeds_compression,
    RatchetCondition.RC7_SUBSTRATE_INDEPENDENT: _eval_rc7_substrate_independent,
}
