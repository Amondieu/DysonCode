"""jcode Metrics — Aggregation, latency tracking, and score reporting.

Provides observability across all jcode pipeline layers. Metrics are
collected per-request and aggregated into rolling statistics.

Used by: orchestrator, benchmarks, Mission Control UI.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from jcode_models import JcodeMetrics, JcodeResponse


# ── Global Metrics Store ─────────────────────────────────────────────────────

_global_metrics = JcodeMetrics()


def record_response(response: JcodeResponse) -> None:
    """Record a jcode response in the global metrics store."""
    _global_metrics.record(response)


def get_metrics() -> JcodeMetrics:
    """Get the current global metrics snapshot."""
    return _global_metrics


def get_snapshot() -> Dict[str, Any]:
    """Get a JSON-serializable metrics snapshot."""
    return _global_metrics.snapshot()


def reset_metrics() -> None:
    """Reset the global metrics store (for testing)."""
    global _global_metrics
    _global_metrics = JcodeMetrics()


# ── Latency Tracking ─────────────────────────────────────────────────────────

class LatencyTracker:
    """High-resolution latency tracker for pipeline stages."""

    def __init__(self) -> None:
        self._marks: Dict[str, float] = {}

    def mark(self, name: str) -> None:
        """Record a timestamp mark."""
        self._marks[name] = time.perf_counter()

    def elapsed(self, start: str, end: str) -> float:
        """Get elapsed milliseconds between two marks."""
        if start not in self._marks or end not in self._marks:
            return 0.0
        return (self._marks[end] - self._marks[start]) * 1000

    def elapsed_from(self, start: str) -> float:
        """Get elapsed milliseconds from a mark to now."""
        if start not in self._marks:
            return 0.0
        return (time.perf_counter() - self._marks[start]) * 1000

    def all_marks(self) -> Dict[str, float]:
        return dict(self._marks)


# ── Score Reporting ──────────────────────────────────────────────────────────

def format_metrics_report(metrics: Optional[JcodeMetrics] = None) -> str:
    """Format a human-readable metrics report."""
    m = metrics or _global_metrics

    if m.total_requests == 0:
        return "jcode Metrics: No requests recorded yet."

    lines = [
        f"jcode Metrics Report — {m.total_requests} requests",
        f"  PreCheck Pass Rate:    {m.precheck_pass_rate:.1%}",
        f"  Fixpoint Pass Rate:    {m.fixpoint_pass_rate:.1%}",
        f"  Avg Ratchet Score:     {m.avg_ratchet_score:.1f}/7",
        f"  Avg Total Latency:     {m.avg_total_latency_ms:.1f}ms",
        f"  Avg PreCheck Latency:  {m.avg_precheck_latency_ms:.1f}ms",
        f"  Avg Pipeline Latency:  {m.avg_pipeline_latency_ms:.1f}ms",
    ]

    if m.omega_route_frequency:
        lines.append("  Ω Route Frequency:")
        for route, count in sorted(
            m.omega_route_frequency.items(), key=lambda x: -x[1]
        ):
            lines.append(f"    {route}: {count}")

    if m.top_failed_laws:
        lines.append("  Top Failed Laws:")
        for law, count in m.top_failed_laws[:3]:
            lines.append(f"    {law}: {count}")

    if m.top_failed_stages:
        lines.append("  Top Failed Stages:")
        for stage, count in m.top_failed_stages[:3]:
            lines.append(f"    {stage}: {count}")

    return "\n".join(lines)


def export_metrics_json(path: Optional[str] = None) -> str:
    """Export current metrics as JSON.

    Args:
        path: Optional file path to write to. If None, returns JSON string.

    Returns:
        JSON string of current metrics snapshot.
    """
    data = {
        "snapshot": _global_metrics.snapshot(),
        "history": [
            {
                "verdict": r.verdict,
                "total_latency_ms": r.total_latency_ms,
                "precheck_passed": r.precheck.passed if r.precheck else None,
                "fixpoint_passed": r.pipeline.fixpoint_passed if r.pipeline else None,
                "ratchet_total": r.ratchet.total if r.ratchet else None,
                "omega_routes": [o.omega_id for o in r.omega_routes],
            }
            for r in _global_metrics.history[-50:]  # last 50
        ],
    }

    json_str = json.dumps(data, indent=2)

    if path:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(json_str, encoding="utf-8")

    return json_str


# ── Benchmark Helpers ────────────────────────────────────────────────────────

def benchmark_summary(
    label: str,
    responses: List[JcodeResponse],
) -> Dict[str, Any]:
    """Compute summary statistics for a batch of benchmark responses.

    Args:
        label: Benchmark run label (e.g., "pre_check", "per_stage").
        responses: List of JcodeResponse from the benchmark.

    Returns:
        Dict with avg/min/max latency, pass rates, and RC distribution.
    """
    if not responses:
        return {"label": label, "count": 0, "error": "No responses"}

    latencies = [r.total_latency_ms for r in responses]
    precheck_pass = sum(
        1 for r in responses if r.precheck and r.precheck.passed
    )
    fixpoint_pass = sum(
        1 for r in responses if r.pipeline and r.pipeline.fixpoint_passed
    )
    rc_scores = [
        r.ratchet.total for r in responses if r.ratchet
    ]
    omega_count = sum(len(r.omega_routes) for r in responses)

    return {
        "label": label,
        "count": len(responses),
        "latency_ms": {
            "avg": round(sum(latencies) / len(latencies), 3),
            "min": round(min(latencies), 3),
            "max": round(max(latencies), 3),
            "p50": round(_percentile(latencies, 50), 3),
            "p95": round(_percentile(latencies, 95), 3),
            "p99": round(_percentile(latencies, 99), 3),
        },
        "precheck_pass_rate": round(precheck_pass / len(responses), 4),
        "fixpoint_pass_rate": round(fixpoint_pass / len(responses), 4),
        "avg_ratchet_score": (
            round(sum(rc_scores) / len(rc_scores), 2) if rc_scores else 0
        ),
        "omega_routes_triggered": omega_count,
        "rc_distribution": {
            str(i): sum(1 for s in rc_scores if s == i)
            for i in range(8)
        },
    }


def _percentile(data: List[float], p: float) -> float:
    """Compute the p-th percentile of a list."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * p / 100.0
    f = int(k)
    c = k - f
    if f + 1 < len(sorted_data):
        return sorted_data[f] + c * (sorted_data[f + 1] - sorted_data[f])
    return sorted_data[f]
