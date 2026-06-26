"""Layer 2 — jcode Unified Processing Filter Pipeline.

Runs the five IDEVA Ω operations as explicit pipeline stages:
  ① Manifold Detection — real degrees of freedom
  ② Gap Geometry — missing dimensions
  ③ Harvest Audit — unused capacity space
  ④ Field Collapse — minimal constraint set
  ⑤ Fixpoint Check — Φ(jcode) = jcode?

If the pre-check skip_per_stage flag is True, compile-safe stages may run
in parallel. Otherwise, runtime-sensitive stages run guarded.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from fixpoint_evaluator import evaluate_fixpoint, evaluate_fixpoint_from_stages
from jcode_models import (
    FixpointResult,
    PipelineResult,
    PreCheckResult,
    StageName,
    StageResult,
)


# ── Public API ───────────────────────────────────────────────────────────────

def run_jcode_pipeline(
    jcode_input: dict,
    precheck: PreCheckResult,
    *,
    parallel: bool = True,
) -> PipelineResult:
    """Run all 5 unified filter stages on jcode input.

    Args:
        jcode_input: Raw jcode request payload.
        precheck: PreCheckResult from Layer 1 (controls parallelism).
        parallel: If True and precheck.skip_per_stage, stages run in parallel.

    Returns:
        PipelineResult with per-stage results, fixpoint status, and metadata.
    """
    start = time.perf_counter()
    stages: List[StageResult] = []

    can_parallel = parallel and precheck.skip_per_stage

    # Stage execution order (parallel or sequential)
    stage_funcs = [
        (StageName.MANIFOLD_DETECTION, run_manifold_detection),
        (StageName.GAP_GEOMETRY, run_gap_geometry),
        (StageName.HARVEST_AUDIT, run_harvest_audit),
        (StageName.FIELD_COLLAPSE, run_field_collapse),
    ]

    stage_outputs: Dict[str, Dict[str, Any]] = {}

    if can_parallel:
        # Parallel execution via threads (Python GIL limits true parallelism,
        # but I/O-bound stages benefit; real parallelism via Rust subprocess)
        from concurrent.futures import ThreadPoolExecutor, as_completed

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(_run_stage, name, func, jcode_input): name
                for name, func in stage_funcs
            }
            for future in as_completed(futures):
                result = future.result()
                stages.append(result)
                if result.passed:
                    stage_outputs[result.stage] = result.output
    else:
        # Sequential execution with early-exit on critical failure
        for name, func in stage_funcs:
            result = _run_stage(name, func, jcode_input)
            stages.append(result)
            if result.passed:
                stage_outputs[result.stage] = result.output

    # Sort stages back to canonical order for consistent output
    stage_order = {s.value: i for i, s in enumerate(StageName)}
    stages.sort(key=lambda s: stage_order.get(s.stage, 99))

    # Stage ⑤: Fixpoint Check (always runs last, depends on all stage outputs)
    fixpoint = evaluate_fixpoint_from_stages(stage_outputs)

    all_stages_passed = all(s.passed for s in stages)
    pipeline_passed = all_stages_passed and fixpoint.passed

    latency_ms = (time.perf_counter() - start) * 1000

    # Explicitly track whether we degraded from parallel to sequential
    degraded_to_sequential = (precheck.skip_per_stage and not can_parallel)

    return PipelineResult(
        passed=pipeline_passed,
        fixpoint_passed=fixpoint.passed,
        stages=stages,
        fixpoint=fixpoint,
        latency_ms=round(latency_ms, 3),
        metadata={
            "parallel": can_parallel,
            "parallel_requested": parallel,
            "precheck_skip_per_stage": precheck.skip_per_stage,
            "degraded_to_sequential": degraded_to_sequential,
            "degradation_reason": (
                "precheck.skip_per_stage=False — runtime-sensitive stages require guarded execution"
                if not can_parallel and precheck.skip_per_stage is False
                else "parallel=False override"
                if not can_parallel and precheck.skip_per_stage
                else None
            ),
            "stage_count": len(stages),
            "stages_passed": sum(1 for s in stages if s.passed),
            "fixpoint_score": fixpoint.score,
            "fixpoint_iterations": fixpoint.iterations,
            "fixpoint_did_timeout": fixpoint.did_timeout if fixpoint else None,
        },
    )


# ── Stage Implementations ────────────────────────────────────────────────────

def run_manifold_detection(jcode_input: dict) -> Dict[str, Any]:
    """① Manifold Detection — identify real degrees of freedom in the input.

    A jcode input with N nodes and E edges has at most N + E degrees of
    freedom, but only the independent ones are "real." This stage identifies
    the effective manifold dimension.
    """
    nodes = jcode_input.get("nodes", [])
    edges = jcode_input.get("edges", [])

    n_nodes = len(nodes) if isinstance(nodes, list) else 0
    n_edges = len(edges) if isinstance(edges, list) else 0

    # Degrees of freedom heuristic
    # Each node contributes 1 dof (its role), each edge contributes 1 dof (its type)
    # Independent dof ≈ nodes + edges - (redundant edges)
    raw_dof = n_nodes + n_edges

    # Identify redundant edges (multiple edges between same source/target)
    edge_pairs = set()
    redundant = 0
    if isinstance(edges, list):
        for e in edges:
            if isinstance(e, dict):
                pair = (e.get("source"), e.get("target"))
                if pair in edge_pairs:
                    redundant += 1
                else:
                    edge_pairs.add(pair)

    effective_dof = raw_dof - redundant

    # Identify node roles as independent dimensions
    roles = set()
    if isinstance(nodes, list):
        for n in nodes:
            if isinstance(n, dict) and "role" in n:
                roles.add(n["role"])

    return {
        "raw_dof": raw_dof,
        "effective_dof": max(effective_dof, 0),
        "redundant_edges": redundant,
        "node_count": n_nodes,
        "edge_count": n_edges,
        "unique_roles": sorted(roles),
        "role_count": len(roles),
        "manifold_dimension": effective_dof - redundant,
    }


def run_gap_geometry(jcode_input: dict) -> Dict[str, Any]:
    """② Gap Geometry — identify missing dimensions in the code.

    A well-formed jcode graph should have certain structural properties.
    Missing edges, isolated nodes, or unserved roles indicate gaps.
    """
    nodes = jcode_input.get("nodes", []) if isinstance(jcode_input.get("nodes"), list) else []
    edges = jcode_input.get("edges", []) if isinstance(jcode_input.get("edges"), list) else []

    # Build adjacency
    sources = set()
    targets = set()
    for e in edges:
        if isinstance(e, dict):
            if "source" in e:
                sources.add(e["source"])
            if "target" in e:
                targets.add(e["target"])

    # Identify isolated nodes (no incoming or outgoing edges)
    node_ids = set()
    for n in nodes:
        if isinstance(n, dict) and "id" in n:
            node_ids.add(n["id"])

    isolated = node_ids - sources - targets
    source_only = sources - targets - isolated
    target_only = targets - sources - isolated

    # Expected edges for full connectivity (complete graph heuristic)
    n = len(node_ids)
    expected_max_edges = n * (n - 1)  # directed complete graph
    connectivity_ratio = len(edges) / expected_max_edges if expected_max_edges > 0 else 1.0

    gaps = []
    if isolated:
        gaps.append(f"{len(isolated)} isolated node(s)")
    if source_only:
        gaps.append(f"{len(source_only)} source-only node(s)")
    if target_only:
        gaps.append(f"{len(target_only)} target-only node(s)")
    if connectivity_ratio < 0.1 and n > 3:
        gaps.append(f"Low connectivity: {connectivity_ratio:.1%}")

    return {
        "isolated_nodes": sorted(isolated),
        "source_only_nodes": sorted(source_only),
        "target_only_nodes": sorted(target_only),
        "connectivity_ratio": round(connectivity_ratio, 4),
        "gap_count": len(gaps),
        "gaps": gaps,
        "total_nodes": n,
        "total_edges": len(edges),
    }


def run_harvest_audit(jcode_input: dict) -> Dict[str, Any]:
    """③ Harvest Audit — detect unused capacity space.

    Before building new structures, audit what already exists:
    - Referenced but unused modules
    - Redundant specifications
    - Unused node capabilities
    """
    nodes = jcode_input.get("nodes", []) if isinstance(jcode_input.get("nodes"), list) else []
    spec = jcode_input.get("spec", "")

    # Count referenced capabilities
    capabilities_found: Dict[str, int] = {}
    for n in nodes:
        if isinstance(n, dict):
            caps = n.get("capabilities", n.get("capability", []))
            if isinstance(caps, list):
                for c in caps:
                    capabilities_found[str(c)] = capabilities_found.get(str(c), 0) + 1
            elif isinstance(caps, str):
                capabilities_found[caps] = capabilities_found.get(caps, 0) + 1

    # Count spec references to capabilities
    spec_refs: Dict[str, int] = {}
    if isinstance(spec, str):
        for cap in capabilities_found:
            count = spec.lower().count(cap.lower())
            if count > 0:
                spec_refs[cap] = count

    unused_capabilities = [
        cap for cap in capabilities_found
        if cap not in spec_refs
    ]

    # Count capacity utilization
    total_caps = len(capabilities_found)
    used_caps = len(spec_refs)
    utilization = used_caps / total_caps if total_caps > 0 else 1.0

    return {
        "total_capabilities": total_caps,
        "used_capabilities": used_caps,
        "unused_capabilities": unused_capabilities,
        "utilization_ratio": round(utilization, 4),
        "harvestable": len(unused_capabilities) > 0,
        "capability_counts": capabilities_found,
        "spec_reference_counts": spec_refs,
    }


def run_field_collapse(jcode_input: dict) -> Dict[str, Any]:
    """④ Field Collapse — find the minimal constraint set.

    Reduces the jcode input to its minimal essential representation:
    - Remove redundant constraints
    - Identify the minimum set of nodes needed to satisfy the spec
    - Compute the compression ratio
    """
    nodes = jcode_input.get("nodes", []) if isinstance(jcode_input.get("nodes"), list) else []
    edges = jcode_input.get("edges", []) if isinstance(jcode_input.get("edges"), list) else []

    # Essential nodes: those with non-trivial roles or referenced in edges
    referenced_in_edges: set = set()
    for e in edges:
        if isinstance(e, dict):
            if "source" in e:
                referenced_in_edges.add(str(e["source"]))
            if "target" in e:
                referenced_in_edges.add(str(e["target"]))

    essential_nodes = []
    redundant_nodes = []
    for n in nodes:
        if isinstance(n, dict):
            nid = str(n.get("id", ""))
            if nid in referenced_in_edges or n.get("role") in ("architect", "builder"):
                essential_nodes.append(nid)
            else:
                redundant_nodes.append(nid)

    # Compression ratio: essential / total
    total = len(nodes)
    essential_count = len(essential_nodes)
    compression_ratio = essential_count / total if total > 0 else 1.0

    # Minimal edge set: remove redundant edges
    seen_pairs: set = set()
    minimal_edges = 0
    redundant_edges = 0
    for e in edges:
        if isinstance(e, dict):
            pair = (e.get("source"), e.get("target"), e.get("type", ""))
            if pair in seen_pairs:
                redundant_edges += 1
            else:
                seen_pairs.add(pair)
                minimal_edges += 1

    return {
        "total_nodes": total,
        "essential_nodes": essential_nodes,
        "redundant_nodes": redundant_nodes,
        "essential_count": essential_count,
        "compression_ratio": round(compression_ratio, 4),
        "total_edges": len(edges),
        "minimal_edges": minimal_edges,
        "redundant_edges": redundant_edges,
        "collapsed": compression_ratio < 1.0,
    }


# ── Internal Helpers ─────────────────────────────────────────────────────────

def _run_stage(
    name: StageName,
    func: callable,
    jcode_input: dict,
) -> StageResult:
    """Execute a single pipeline stage with timing and error handling."""
    start = time.perf_counter()
    warnings: List[str] = []
    errors: List[str] = []

    try:
        output = func(jcode_input)
        passed = True
    except Exception as exc:
        output = {}
        passed = False
        errors.append(f"{name.value} failed: {exc}")

    latency_ms = (time.perf_counter() - start) * 1000

    # Stage-specific pass/fail heuristics
    if passed:
        if name == StageName.MANIFOLD_DETECTION:
            if output.get("effective_dof", 0) <= 0:
                warnings.append("Zero effective degrees of freedom detected")
        elif name == StageName.GAP_GEOMETRY:
            if output.get("gap_count", 0) > 0:
                warnings.append(f"Found {output['gap_count']} structural gap(s)")
        elif name == StageName.HARVEST_AUDIT:
            if output.get("utilization_ratio", 1.0) < 0.3:
                warnings.append("Very low capacity utilization — harvest recommended")
        elif name == StageName.FIELD_COLLAPSE:
            if output.get("compression_ratio", 1.0) < 0.5:
                warnings.append("High redundancy — strong field collapse possible")

    return StageResult(
        stage=name.value,
        passed=passed and not errors,
        output=output,
        latency_ms=round(latency_ms, 3),
        warnings=warnings,
        errors=errors,
        metadata={"stage_name": name.value},
    )
