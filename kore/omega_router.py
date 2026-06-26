"""Layer 4 — Omega Multiplicator Router (ΩMEGA Routing).

Converts failure signatures (fixpoint failure, RC gaps, stage instability,
pipeline errors) into the correct Ω multiplicator route.

Routes are fed to both constraint_injector.py (runtime adaptation) and
replanner.py (structural replanning).

Mandatory route mapping:
  high_latency / wasted_structure        → Ω1 (Kolmogorov compress)
  landscape_trap / repeated_stagnation   → Ω2 (landscape escape)
  no_zoom_stability                      → Ω3 (renormalize)
  interface_reconstruction_failure       → Ω4 (autopoietic rebuild)
  high_prediction_error / empty_output   → Ω5 (prediction error track)
  contradiction_accumulation / invariant_fail → Ω6 (tension topology)
  unstable_self_improvement              → Ω7 (unstable self-improvement)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from jcode_models import (
    OmegaRoute,
    OmegaRouteResult,
    OMEGA_SYMPTOM_MAP,
    PipelineResult,
    RatchetScore,
    StageName,
)


# ── Public API ───────────────────────────────────────────────────────────────

def resolve_omega_route(
    pipeline_result: PipelineResult,
    ratchet: RatchetScore,
    *,
    precheck_passed: bool = True,
    max_routes: int = 3,
) -> List[OmegaRouteResult]:
    """Resolve Ω routes from pipeline and ratchet failure signatures.

    Args:
        pipeline_result: Full pipeline result from Layer 2.
        ratchet: Ratchet score from Layer 3.
        precheck_passed: Whether pre-check passed (for invariant fail detection).
        max_routes: Maximum number of routes to return (sorted by severity).

    Returns:
        Sorted list of OmegaRouteResult, highest severity first.
    """
    symptoms = _detect_symptoms(pipeline_result, ratchet, precheck_passed)
    routes = _symptoms_to_routes(symptoms)
    routes.sort(key=lambda r: -r.severity)
    return routes[:max_routes]


def resolve_omega_from_error(
    error_type: str,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[OmegaRouteResult]:
    """Resolve a single Ω route from a known error type.

    Args:
        error_type: One of the known symptom keys (e.g., 'fixpoint_failed').
        context: Optional additional context for route payload.

    Returns:
        OmegaRouteResult or None if error_type is unrecognized.
    """
    omega = OMEGA_SYMPTOM_MAP.get(error_type)
    if omega is None:
        return None

    return OmegaRouteResult(
        omega_id=omega.value,
        trigger=error_type,
        rationale=_route_rationale(omega),
        payload=context or {},
        severity=_route_severity(omega),
        metadata={"source": "direct_error", "error_type": error_type},
    )


# ── Symptom Detection ───────────────────────────────────────────────────────

def _detect_symptoms(
    pipeline: PipelineResult,
    ratchet: RatchetScore,
    precheck_passed: bool,
) -> Dict[str, float]:
    """Detect all active symptoms with severity scores.

    Returns:
        Dict mapping symptom_key → severity (0.0–1.0).
    """
    symptoms: Dict[str, float] = {}

    # ── Fixpoint failures ──
    if not pipeline.fixpoint_passed and pipeline.fixpoint:
        score = pipeline.fixpoint.score
        if score < 0.80:
            symptoms["fixpoint_failed"] = 0.9
        elif score < 0.95:
            symptoms["fixpoint_failed"] = 0.6
        else:
            symptoms["fixpoint_failed"] = 0.3

    # ── Stage failures ──
    for stage in pipeline.stages:
        if not stage.passed:
            if stage.stage == StageName.MANIFOLD_DETECTION.value:
                symptoms["wasted_structure"] = 0.7
            elif stage.stage == StageName.GAP_GEOMETRY.value:
                symptoms["landscape_trap"] = 0.6
            elif stage.stage == StageName.HARVEST_AUDIT.value:
                symptoms["wasted_structure"] = 0.5
            elif stage.stage == StageName.FIELD_COLLAPSE.value:
                symptoms["high_latency"] = 0.5

    # ── Latency issues ──
    if pipeline.latency_ms > 500:
        symptoms["high_latency"] = max(symptoms.get("high_latency", 0), 0.8)
    elif pipeline.latency_ms > 200:
        symptoms["high_latency"] = max(symptoms.get("high_latency", 0), 0.5)
    elif pipeline.latency_ms > 100:
        symptoms["high_latency"] = max(symptoms.get("high_latency", 0), 0.2)

    # ── Empty output ──
    total_stage_output = sum(
        len(str(s.output)) for s in pipeline.stages if s.output
    )
    if total_stage_output < 10:
        symptoms["empty_output"] = 0.9
    elif total_stage_output < 50:
        symptoms["empty_output"] = 0.5

    # ── RC gaps ──
    if ratchet.total < 4:
        symptoms["rc_below_4"] = 0.8
    elif ratchet.total < 7:
        symptoms["rc_below_7"] = 0.4

    # ── Invariant failures ──
    if not precheck_passed:
        symptoms["invariant_check_failed"] = 0.7

    # ── Stage interface incompatibility ──
    passed_stages = sum(1 for s in pipeline.stages if s.passed)
    if passed_stages < 3 and len(pipeline.stages) >= 4:
        symptoms["stage_interface_incompatible"] = 0.6

    # ── Contradiction accumulation ──
    if pipeline.fixpoint and len(pipeline.fixpoint.contradiction_markers) > 3:
        symptoms["contradiction_accumulation"] = min(
            0.3 + 0.1 * len(pipeline.fixpoint.contradiction_markers), 1.0
        )

    # ── Repeated stagnation (low compression + low utilization) ──
    field = pipeline.stage_by_name("field_collapse")
    harvest = pipeline.stage_by_name("harvest_audit")
    if field and harvest:
        compression = field.output.get("compression_ratio", 1.0)
        utilization = harvest.output.get("utilization_ratio", 1.0)
        if compression > 0.8 and utilization < 0.3:
            symptoms["repeated_stagnation"] = 0.7

    # ── No zoom stability (manifold dimension unstable) ──
    manifold = pipeline.stage_by_name("manifold_detection")
    if manifold and manifold.output.get("manifold_dimension", 0) <= 0:
        symptoms["no_zoom_stability"] = 0.6

    # ── Ω7: Unstable self-improvement loop ──
    # Combination rule: any(trigger) → Ω7 fires.
    # Severity = max(all matching conditions) — they stack, not overwrite.
    # Override point: change `_combine_omega7()` to use weighted average if needed.
    omega7_score = 0.0

    if pipeline.fixpoint:
        # Condition 1: Fixpoint timeout (strongest signal — 0.9)
        if pipeline.fixpoint.did_timeout:
            omega7_score = max(omega7_score, 0.9)

        # Condition 2: Fixpoint score critically low (0.7)
        if pipeline.fixpoint.score < 0.5:
            omega7_score = max(omega7_score, 0.7)

        # Condition 3: Iteration budget exhausted without convergence (0.6)
        if pipeline.fixpoint.iterations >= pipeline.fixpoint.max_iterations and not pipeline.fixpoint.passed:
            omega7_score = max(omega7_score, 0.6)

    # Condition 4: Ratchet regression (RC < 3 + low fixpoint) — 0.5
    if ratchet.total < 3 and pipeline.fixpoint and pipeline.fixpoint.score < 0.7:
        omega7_score = max(omega7_score, 0.5)

    # Condition 5: Pipeline degradation (parallel→sequential fallback) — 0.6
    if pipeline.metadata.get("degraded_to_sequential", False):
        omega7_score = max(omega7_score, 0.6)

    if omega7_score > 0:
        symptoms["unstable_self_improvement"] = omega7_score

    return symptoms


def _symptoms_to_routes(symptoms: Dict[str, float]) -> List[OmegaRouteResult]:
    """Convert detected symptoms to Ω route results.

    Multiple symptoms may map to the same route — duplicates are deduplicated
    by keeping the highest severity.
    """
    route_map: Dict[str, OmegaRouteResult] = {}

    for symptom, severity in symptoms.items():
        omega = OMEGA_SYMPTOM_MAP.get(symptom)
        if omega is None:
            continue

        key = omega.value
        if key in route_map:
            # Merge: keep higher severity, combine payloads
            existing = route_map[key]
            if severity > existing.severity:
                existing.severity = severity
            existing.payload["symptoms"] = existing.payload.get("symptoms", []) + [symptom]
            existing.metadata["symptom_count"] = existing.metadata.get("symptom_count", 1) + 1
        else:
            route_map[key] = OmegaRouteResult(
                omega_id=omega.value,
                trigger=symptom,
                rationale=_route_rationale(omega),
                payload={"symptoms": [symptom], "severity": severity},
                severity=severity,
                metadata={"symptom_count": 1},
            )

    return list(route_map.values())


# ── Route Metadata ───────────────────────────────────────────────────────────

def _route_rationale(omega: OmegaRoute) -> str:
    """Human-readable rationale for a given Ω route."""
    rationales = {
        OmegaRoute.O1_KOLMOGOROV_COMPRESS: (
            "Compress the output to its Kolmogorov minimum — strip redundant "
            "structure, deduplicate, and extract the essential signature."
        ),
        OmegaRoute.O2_LANDSCAPE_ESCAPE: (
            "Inject random perturbations or explore alternative topologies to "
            "escape the current local minimum in solution space."
        ),
        OmegaRoute.O3_RENORMALIZE: (
            "Identify what survives across zoom levels — strip scale-dependent "
            "features and keep only renormalization-group invariants."
        ),
        OmegaRoute.O4_AUTOPOIETIC_REBUILD: (
            "The pipeline interface has self-destructed. Rebuild the kernel "
            "from first principles using the surviving contract definitions."
        ),
        OmegaRoute.O5_PREDICTION_ERROR_TRACK: (
            "Track prediction errors explicitly — measure the gap between "
            "expected and actual output, then feed the error signal back."
        ),
        OmegaRoute.O6_TENSION_TOPOLOGY: (
            "Map the contradiction topology — identify thesis/antithesis pairs "
            "and force a synthesis through dialectic tension."
        ),
        OmegaRoute.O7_UNSTABLE_SELF_IMPROVEMENT: (
            "The self-improvement loop has become unstable. Apply dampening, "
            "reduce learning rate, or freeze a stable checkpoint."
        ),
    }
    return rationales.get(omega, "Unknown Ω route")


def _route_severity(omega: OmegaRoute) -> float:
    """Default severity for a given Ω route type."""
    severities = {
        OmegaRoute.O1_KOLMOGOROV_COMPRESS: 0.4,
        OmegaRoute.O2_LANDSCAPE_ESCAPE: 0.6,
        OmegaRoute.O3_RENORMALIZE: 0.5,
        OmegaRoute.O4_AUTOPOIETIC_REBUILD: 0.9,
        OmegaRoute.O5_PREDICTION_ERROR_TRACK: 0.7,
        OmegaRoute.O6_TENSION_TOPOLOGY: 0.6,
        OmegaRoute.O7_UNSTABLE_SELF_IMPROVEMENT: 0.8,
    }
    return severities.get(omega, 0.5)
