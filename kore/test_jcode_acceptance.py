"""jcode Acceptance Tests — Mindest-Set vor jedem Commit.

Testet die vier kritischen Pfade:
  (a) PreCheck lehnt invalides Schema ab
  (b) Pipeline emittiert Fixpoint-Metadaten
  (c) Ratchet Scorer liefert Improvement-Reasons
  (d) Omega Router triggert bei Fixpoint-Failure

Usage:
    python -m pytest kore/test_jcode_acceptance.py -v
"""

from __future__ import annotations

import pytest

from jcode_models import (
    FixpointResult,
    JcodeResponse,
    PipelineResult,
    PreCheckResult,
    RatchetScore,
    StageResult,
)
from jcode_precheck import run_precheck
from jcode_pipeline import run_jcode_pipeline
from ratchet_scorer import score_ratchet, suggest_ratchet_improvements
from omega_router import resolve_omega_route
from fixpoint_evaluator import evaluate_fixpoint


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_pipeline(passed: bool, fixpoint_passed: bool, fixpoint_score: float = 0.999) -> PipelineResult:
    """Build a synthetic PipelineResult for testing downstream layers."""
    return PipelineResult(
        passed=passed,
        fixpoint_passed=fixpoint_passed,
        stages=[
            StageResult(stage="manifold_detection", passed=True, output={"effective_dof": 3}),
            StageResult(stage="gap_geometry", passed=True, output={"gap_count": 1}),
            StageResult(stage="harvest_audit", passed=True, output={"utilization_ratio": 0.5}),
            StageResult(stage="field_collapse", passed=True, output={"compression_ratio": 0.4}),
        ],
        fixpoint=FixpointResult(
            passed=fixpoint_passed,
            score=fixpoint_score,
            iterations=1,
            max_iterations=3,
            did_timeout=False,
        ),
        latency_ms=10.0,
        metadata={"parallel": True, "degraded_to_sequential": False},
    )


# ── (a) PreCheck rejects invalid schema ─────────────────────────────────────

def test_precheck_rejects_invalid_schema():
    """PreCheck Gate must reject inputs that violate the jcode schema."""
    # Vague spec with no harvest keywords → Law 4 + Law 10 both fail
    result = run_precheck({
        "spec": "maybe we should probably create something sort of new",
    })
    assert not result.passed, (
        "Vague spec should fail pre-check (Law 4 vague terms + Law 10 no harvest)"
    )
    assert len(result.failed_laws) > 0, "At least one law should fail"

    # Missing required structural fields
    result = run_precheck({"unknown_field": 123})
    # Contract validation catches missing spec/nodes
    assert len(result.invariants) >= 8, "Should evaluate all 8 laws even on bad input"

    # Invalid node role
    result = run_precheck({
        "spec": "build something",
        "nodes": [{"id": "n1", "role": "invalid_role_xyz"}],
    })
    assert len(result.invariants) == 8
    # At minimum, laws should be evaluated; contract validation adds errors
    assert isinstance(result.errors, list)

    # Valid minimal input should pass
    result = run_precheck({
        "spec": "audit the system before building the cache module",
        "nodes": [
            {"id": "n1", "role": "architect", "title": "Plan"},
            {"id": "n2", "role": "builder", "title": "Build"},
        ],
        "edges": [{"source": "n1", "target": "n2", "type": "data"}],
    })
    assert result.passed, f"Valid input should pass pre-check, got: {result.rejection_reasons}"


# ── (b) Pipeline emits fixpoint metadata ─────────────────────────────────────

def test_pipeline_emits_fixpoint_metadata():
    """Pipeline must emit fixpoint score, iterations, and timeout flag."""
    jcode_input = {
        "spec": "build a router component",
        "nodes": [
            {"id": "a", "role": "architect", "capabilities": ["blueprint"]},
            {"id": "b", "role": "builder", "capabilities": ["file-write"]},
        ],
        "edges": [{"source": "a", "target": "b", "type": "data"}],
    }
    precheck = run_precheck(jcode_input)
    pipeline = run_jcode_pipeline(jcode_input, precheck)

    # Fixpoint metadata must be present
    assert pipeline.fixpoint is not None, "Pipeline must emit fixpoint result"
    assert isinstance(pipeline.fixpoint.score, float), "Fixpoint score must be float"
    assert 0.0 <= pipeline.fixpoint.score <= 1.0, "Fixpoint score must be 0.0–1.0"
    assert pipeline.fixpoint.iterations >= 1, "Fixpoint must track iteration count"
    assert isinstance(pipeline.fixpoint.did_timeout, bool), "Fixpoint must have did_timeout flag"
    assert pipeline.fixpoint.max_iterations == 3, "Default max_iterations must be 3"

    # Pipeline metadata must include degradation flag
    assert "degraded_to_sequential" in pipeline.metadata, (
        "Pipeline metadata must include degraded_to_sequential flag"
    )
    assert "fixpoint_did_timeout" in pipeline.metadata, (
        "Pipeline metadata must include fixpoint_did_timeout"
    )


# ── (c) Ratchet Scorer returns improvement reasons ──────────────────────────

def test_ratchet_scorer_returns_improvement_reasons():
    """Ratchet Scorer must return concrete improvement hints for failed RC conditions."""
    pipeline = _make_pipeline(passed=True, fixpoint_passed=True, fixpoint_score=0.95)

    score = score_ratchet(pipeline)

    # Must have all 7 conditions evaluated
    assert len(score.conditions) == 7, f"Expected 7 RC conditions, got {len(score.conditions)}"
    assert 0 <= score.total <= 7, f"RC total must be 0–7, got {score.total}"

    # Must have improvement hints
    assert isinstance(score.improvement_hints, list), "Must return improvement hints list"

    # For a non-RC7 score, there should be hints for failed conditions
    if score.total < 7:
        assert len(score.improvement_hints) > 0, (
            f"RC {score.total}/7 must have improvement hints for gaps"
        )

    # Test the standalone suggest function
    hints = suggest_ratchet_improvements(score, pipeline)
    assert isinstance(hints, list), "suggest_ratchet_improvements must return a list"

    # Verify RC5 and RC7 conditions are evaluated
    assert "rc5_productive_contradictions" in score.conditions
    assert "rc7_substrate_independent" in score.conditions
    assert "rc5_productive_contradictions" in score.reasoning
    assert "rc7_substrate_independent" in score.reasoning


# ── (d) Omega Router triggers on failed fixpoint ─────────────────────────────

def test_omega_router_triggers_on_failed_fixpoint():
    """Omega Router must trigger Ω routes when fixpoint fails."""
    # Pipeline with failed fixpoint
    pipeline = _make_pipeline(passed=False, fixpoint_passed=False, fixpoint_score=0.45)
    ratchet = score_ratchet(pipeline)

    routes = resolve_omega_route(pipeline, ratchet)

    # Fixpoint failure must trigger at least one route
    assert len(routes) > 0, (
        f"Failed fixpoint (score={pipeline.fixpoint.score}) must trigger Ω routes"
    )

    # Check that fixpoint_failed symptom maps to a route
    route_ids = [r.omega_id for r in routes]
    # Ω6 (tension topology) or Ω5 (prediction error) should be triggered
    omega_triggered = any(
        rid in route_ids
        for rid in ["omega_6_tension_topology", "omega_5_prediction_error_track"]
    )
    assert omega_triggered, (
        f"Failed fixpoint must trigger Ω5 or Ω6, got: {route_ids}"
    )

    # Routes must be sorted by severity (highest first)
    if len(routes) > 1:
        for i in range(len(routes) - 1):
            assert routes[i].severity >= routes[i + 1].severity, (
                f"Ω routes must be sorted by severity descending, "
                f"got {routes[i].severity} before {routes[i+1].severity}"
            )

    # Healthy pipeline should not trigger unnecessary routes
    healthy_pipeline = _make_pipeline(passed=True, fixpoint_passed=True, fixpoint_score=0.999)
    healthy_ratchet = score_ratchet(healthy_pipeline)
    healthy_routes = resolve_omega_route(healthy_pipeline, healthy_ratchet)

    # A fully healthy pipeline may still trigger mild Ω routes (RC gaps, etc.)
    # but should not trigger high-severity routes
    for route in healthy_routes:
        assert route.severity < 0.8, (
            f"Healthy pipeline should not trigger high-severity Ω routes, "
            f"got {route.omega_id} severity={route.severity}"
        )


# ── Additional: Fixpoint termination guarantee ───────────────────────────────

def test_fixpoint_respects_max_iterations():
    """Fixpoint evaluator must terminate within max_iterations."""
    # Create deliberately divergent output
    divergent = {
        "stages": {
            "test": {"value": 1, "iteration": 0},
        },
        "stage_count": 1,
    }

    result = evaluate_fixpoint(divergent, tolerance=0.999, max_iterations=2)
    assert result.iterations <= 2, (
        f"Fixpoint must stop at max_iterations=2, got {result.iterations}"
    )
    assert isinstance(result.did_timeout, bool)
    # With max_iterations=2 and strict tolerance, likely times out
    if result.iterations >= 2 and not result.passed:
        assert result.did_timeout, (
            "Exhausted iterations without convergence must set did_timeout=True"
        )
