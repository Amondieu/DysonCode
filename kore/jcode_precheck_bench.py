"""Schnelltest-Protokoll — jcode Pre-Check vs Per-Stage Benchmark.

Simulates 1000 synthetic jcode objects with both approaches:
  1. Pre-Check Gate (compile-time, once before execution)
  2. Per-Stage Enforcement (runtime, checked at each of 5 stages)

Hypothesis: Pre-Check achieves ≥40% latency reduction over Per-Stage.
Falsification threshold: < 30% reduction → per-stage enforcement needed.

Usage:
    python -m kore.jcode_precheck_bench [--count 1000] [--output results.json]
"""

from __future__ import annotations

import json
import random
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from jcode_models import (
    JcodeMetrics,
    JcodeRequest,
    JcodeResponse,
    PipelineResult,
    PreCheckResult,
    RatchetScore,
    StageName,
    StageResult,
)
from jcode_metrics import benchmark_summary
from jcode_precheck import run_precheck, run_static_invariants
from jcode_pipeline import run_jcode_pipeline
from ratchet_scorer import score_ratchet
from omega_router import resolve_omega_route


# ── Synthetic Object Generator ───────────────────────────────────────────────

# Valid roles, edge types, and capabilities for synthetic objects
ROLES = ["architect", "builder", "critic", "tester", "memory_keeper"]
EDGE_TYPES = ["data", "challenge", "synthesis", "memory", "trigger",
              "dependency", "reference"]
CAPABILITIES = [
    "blueprint", "compression", "architecture", "falsification",
    "constraint-injection", "file-write", "minimum-change", "reversible",
    "validation", "testing", "shell", "execution", "compression",
    "memory", "session-seed", "monitoring", "quality-tracking",
]
SPEC_TEMPLATES = [
    "Build a {component} for the {system}.",
    "Refactor {module} to improve {quality}.",
    "Add {feature} capability to the {system}.",
    "Fix the {bug} in {module}.",
    "Implement {pattern} across {count} modules.",
]
COMPONENTS = ["router", "cache", "validator", "serializer", "gateway", "auth"]
SYSTEMS = ["DysonCode", "KORE", "jcode pipeline", "Mission Control"]
MODULES = ["orchestrator", "harness", "constraint_store", "role_engine"]
QUALITIES = ["latency", "throughput", "type safety", "compression ratio"]
FEATURES = ["streaming", "batch processing", "parallel execution"]
BUGS = ["race condition", "memory leak", "type error", "off-by-one"]
PATTERNS = ["observer", "strategy", "factory", "adapter"]


def generate_synthetic_jcode(n: int = 1000, seed: int = 42) -> List[dict]:
    """Generate n synthetic jcode objects with varying complexity.

    Objects range from trivial (1 node, 0 edges) to complex (10+ nodes,
    20+ edges) with varying spec quality.
    """
    rng = random.Random(seed)
    objects: List[dict] = []

    for i in range(n):
        complexity = rng.random()  # 0.0 = trivial, 1.0 = complex

        # Node count: 1–15, weighted by complexity
        node_count = max(1, int(complexity * 15) + rng.randint(0, 3))

        nodes = []
        for j in range(node_count):
            role = rng.choice(ROLES)
            node = {
                "id": f"node-{i}-{j}",
                "role": role,
                "title": f"{role.capitalize()} Task {j}",
                "capabilities": rng.sample(
                    CAPABILITIES, min(3, len(CAPABILITIES))
                ),
                "risk_score": round(rng.random(), 2),
            }
            nodes.append(node)

        # Edge count: proportional to node count
        max_edges = node_count * (node_count - 1)
        edge_count = min(max_edges, int(complexity * max_edges * 0.5) + rng.randint(0, 2))

        edges = []
        node_ids = [n["id"] for n in nodes]
        for _ in range(edge_count):
            source = rng.choice(node_ids)
            target = rng.choice(node_ids)
            if source != target:
                edges.append({
                    "source": source,
                    "target": target,
                    "type": rng.choice(EDGE_TYPES),
                })

        # Spec: sometimes well-formed, sometimes vague
        if complexity > 0.7:
            # High-quality spec
            template = rng.choice(SPEC_TEMPLATES)
            spec = template.format(
                component=rng.choice(COMPONENTS),
                system=rng.choice(SYSTEMS),
                module=rng.choice(MODULES),
                quality=rng.choice(QUALITIES),
                feature=rng.choice(FEATURES),
                bug=rng.choice(BUGS),
                pattern=rng.choice(PATTERNS),
                count=rng.randint(2, 5),
            )
        elif complexity > 0.3:
            # Medium spec — might have vague terms
            spec = f"Maybe we should {rng.choice(['create', 'build', 'implement'])} something for the system."
        else:
            # Poor or empty spec
            spec = "" if rng.random() < 0.3 else "todo"

        jcode_obj = {
            "spec": spec,
            "nodes": nodes,
            "edges": edges,
            "complexity": round(complexity, 2),
            "index": i,
        }
        objects.append(jcode_obj)

    return objects


# ── Benchmark Runners ────────────────────────────────────────────────────────

def run_precheck_benchmark(objects: List[dict]) -> List[JcodeResponse]:
    """Benchmark: Pre-Check Gate (compile-time only).

    Each object gets:
    1. Pre-check (8 compile-time laws, once)
    2. Pipeline (5 stages, parallel when safe)
    3. Ratchet scoring
    """
    responses: List[JcodeResponse] = []

    for obj in objects:
        total_start = time.perf_counter()

        # Phase 1: Pre-Check (compile-time)
        precheck = run_precheck(obj, strict=False, parallel=True)

        # Phase 2: Pipeline (compile-safe stages may skip re-checks)
        pipeline = run_jcode_pipeline(obj, precheck, parallel=True)

        # Phase 3: Ratchet
        ratchet = score_ratchet(pipeline)

        # Phase 4: Ω routing
        omega = resolve_omega_route(pipeline, ratchet, precheck_passed=precheck.passed)

        total_latency = (time.perf_counter() - total_start) * 1000

        response = JcodeResponse(
            request_id=f"precheck-{obj.get('index', 0)}",
            precheck=precheck,
            pipeline=pipeline,
            ratchet=ratchet,
            omega_routes=omega,
            verdict="accepted" if precheck.passed else "rejected",
            total_latency_ms=round(total_latency, 3),
        )
        responses.append(response)

    return responses


def run_per_stage_benchmark(objects: List[dict]) -> List[JcodeResponse]:
    """Benchmark: Per-Stage Enforcement (runtime checks at each stage).

    Each object gets:
    1. Pipeline with all 5 stages checked individually
    2. Per-stage invariant re-checking (simulated)
    3. Ratchet scoring
    """
    responses: List[JcodeResponse] = []

    for obj in objects:
        total_start = time.perf_counter()

        # Simulate per-stage enforcement: run invariants at each stage
        precheck_results = []
        for stage in StageName:
            # Re-run compile-time laws at each stage (simulated overhead)
            invariants = run_static_invariants(obj)
            passed = all(i.passed for i in invariants)
            precheck_results.append(PreCheckResult(
                passed=passed,
                skip_per_stage=False,  # Never skip in per-stage mode
                latency_ms=sum(i.latency_us for i in invariants) / 1000,
                invariants=invariants,
            ))

        # Aggregate precheck from all stages (use worst-case)
        precheck = PreCheckResult(
            passed=all(p.passed for p in precheck_results),
            skip_per_stage=False,
            latency_ms=sum(p.latency_ms for p in precheck_results),
            invariants=precheck_results[0].invariants if precheck_results else [],
        )

        # Pipeline runs sequentially (no skip, no parallelization)
        pipeline = run_jcode_pipeline(obj, precheck, parallel=False)

        # Ratchet
        ratchet = score_ratchet(pipeline)

        # Ω routing
        omega = resolve_omega_route(pipeline, ratchet, precheck_passed=precheck.passed)

        total_latency = (time.perf_counter() - total_start) * 1000

        response = JcodeResponse(
            request_id=f"perstage-{obj.get('index', 0)}",
            precheck=precheck,
            pipeline=pipeline,
            ratchet=ratchet,
            omega_routes=omega,
            verdict="accepted" if precheck.passed else "rejected",
            total_latency_ms=round(total_latency, 3),
        )
        responses.append(response)

    return responses


# ── Main Benchmark Entrypoint ────────────────────────────────────────────────

def run_benchmark(
    count: int = 1000,
    seed: int = 42,
    output_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Run the full Pre-Check vs Per-Stage benchmark.

    Args:
        count: Number of synthetic objects (default 1000).
        seed: Random seed for reproducibility.
        output_path: Optional path to write JSON results.

    Returns:
        Dict with both benchmark summaries and the comparison verdict.
    """
    print(f"Generating {count} synthetic jcode objects (seed={seed})...")
    objects = generate_synthetic_jcode(count, seed=seed)
    print(f"Generated {len(objects)} objects "
          f"(avg nodes={statistics.mean(len(o['nodes']) for o in objects):.1f}, "
          f"avg edges={statistics.mean(len(o['edges']) for o in objects):.1f})")

    # Warmup: run 10 objects through both paths to prime caches
    print("Warming up (10 objects)...")
    run_precheck_benchmark(objects[:10])
    run_per_stage_benchmark(objects[:10])

    # Benchmark: Pre-Check
    print(f"Benchmarking Pre-Check approach ({count} objects)...")
    t0 = time.perf_counter()
    precheck_responses = run_precheck_benchmark(objects)
    precheck_time = time.perf_counter() - t0

    # Benchmark: Per-Stage
    print(f"Benchmarking Per-Stage approach ({count} objects)...")
    t0 = time.perf_counter()
    perstage_responses = run_per_stage_benchmark(objects)
    perstage_time = time.perf_counter() - t0

    # Summaries
    precheck_summary = benchmark_summary("pre_check", precheck_responses)
    perstage_summary = benchmark_summary("per_stage", perstage_responses)

    # Comparison
    precheck_avg = precheck_summary["latency_ms"]["avg"]
    perstage_avg = perstage_summary["latency_ms"]["avg"]

    if perstage_avg > 0:
        reduction_pct = (perstage_avg - precheck_avg) / perstage_avg * 100
    else:
        reduction_pct = 0.0

    hypothesis_valid = reduction_pct >= 30.0
    verdict = (
        "HYPOTHESIS CONFIRMED" if reduction_pct >= 40.0
        else "HYPOTHESIS FALSIFIED" if reduction_pct < 30.0
        else "INCONCLUSIVE"
    )

    result = {
        "benchmark": {
            "object_count": count,
            "seed": seed,
            "precheck_wall_time_s": round(precheck_time, 3),
            "perstage_wall_time_s": round(perstage_time, 3),
        },
        "pre_check": precheck_summary,
        "per_stage": perstage_summary,
        "comparison": {
            "precheck_avg_ms": precheck_avg,
            "perstage_avg_ms": perstage_avg,
            "latency_reduction_pct": round(reduction_pct, 2),
            "hypothesis_threshold_30pct": reduction_pct >= 30.0,
            "hypothesis_threshold_40pct": reduction_pct >= 40.0,
            "verdict": verdict,
            "recommendation": (
                "Pre-Check approach validated — proceed with compile-time gate."
                if hypothesis_valid
                else "Pre-Check hypothesis falsified — fall back to per-stage enforcement."
            ),
        },
    }

    # Print summary
    print()
    print("=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)
    print(f"Objects:            {count}")
    print(f"Pre-Check avg:      {precheck_avg:.2f} ms")
    print(f"Per-Stage avg:      {perstage_avg:.2f} ms")
    print(f"Latency reduction:  {reduction_pct:.1f}%")
    print(f"Verdict:            {verdict}")
    print(f"Recommendation:     {result['comparison']['recommendation']}")
    print()
    print(f"Pre-Check pass rate:   {precheck_summary['precheck_pass_rate']:.1%}")
    print(f"Fixpoint pass rate:    {precheck_summary['fixpoint_pass_rate']:.1%}")
    print(f"Avg ratchet score:     {precheck_summary['avg_ratchet_score']:.1f}/7")
    print("=" * 60)

    if output_path:
        import datetime as dt

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"\nResults written to: {output_path}")

        # Also write JSON-Lines snapshot for regression tracking
        snapshots_dir = Path(output_path).parent / "bench_results"
        snapshots_dir.mkdir(parents=True, exist_ok=True)
        snapshot_path = snapshots_dir / f"snapshot-{count}obj-seed{seed}.jsonl"

        snapshot_line = json.dumps({
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "n_objects": count,
            "seed": seed,
            "model": __import__("os").environ.get("KORE_AGENT_MODEL", "flash-k2"),
            "precheck_mean_ms": precheck_summary["latency_ms"]["avg"],
            "precheck_p50_ms": precheck_summary["latency_ms"]["p50"],
            "precheck_p95_ms": precheck_summary["latency_ms"]["p95"],
            "precheck_p99_ms": precheck_summary["latency_ms"]["p99"],
            "perstage_mean_ms": perstage_summary["latency_ms"]["avg"],
            "perstage_p50_ms": perstage_summary["latency_ms"]["p50"],
            "perstage_p95_ms": perstage_summary["latency_ms"]["p95"],
            "perstage_p99_ms": perstage_summary["latency_ms"]["p99"],
            "latency_reduction_pct": reduction_pct,
            "verdict": verdict,
        })
        with open(snapshot_path, "a", encoding="utf-8") as sf:
            sf.write(snapshot_line + "\n")
        print(f"Snapshot appended to: {snapshot_path}")

    return result


# ── CLI Entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="jcode Pre-Check vs Per-Stage Benchmark"
    )
    parser.add_argument(
        "--count", type=int, default=1000,
        help="Number of synthetic objects (default: 1000)"
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed (default: 42)"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="JSON output path for results"
    )
    parser.add_argument(
        "--quick", action="store_true",
        help="Quick mode: only 100 objects"
    )

    args = parser.parse_args()
    count = 100 if args.quick else args.count

    result = run_benchmark(count=count, seed=args.seed, output_path=args.output)

    # Exit code: 0 if hypothesis confirmed, 1 if falsified
    if not result["comparison"]["hypothesis_threshold_30pct"]:
        print("\n[!] Hypothesis falsified -- exit code 1")
        sys.exit(1)
