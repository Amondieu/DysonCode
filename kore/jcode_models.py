"""jcode-in-Dyson-Sphere — Shared typed models.

All jcode pipeline stages communicate exclusively through these structured
artefacts. No free-form dicts across stage boundaries.

Layers:
  1. Pre-Check Gate (compile-time invariants)
  2. Unified Processing Filter (5 parallel stages)
  3. Ratchet Condition Scorer (RC 1–7)
  4. Omega Multiplicator Router (Ω1–Ω7)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ── Invariant Law Identifiers ───────────────────────────────────────────────

class InvariantLaw(str, Enum):
    """The 12 Dyson Invariant Laws, split by enforcement phase."""
    # Compile-time (initial-state only)
    LAW_1_COMPRESSIBILITY = "law_1_compressibility"
    LAW_2_SELF_APPLICATION = "law_2_self_application"
    LAW_4_CONSTRAINT_PRECISION = "law_4_constraint_precision"
    LAW_5_SHADOW_SIGNATURE = "law_5_shadow_signature"
    LAW_7_CATEGORY_EXPANSION = "law_7_category_expansion"
    LAW_8_MIN_ENERGY_PATH = "law_8_min_energy_path"
    LAW_10_HARVEST_BEFORE_BUILD = "law_10_harvest_before_build"
    LAW_11_ZERO_WASTED_SURFACE = "law_11_zero_wasted_surface"
    # Runtime (state-dependent)
    LAW_3_UNRESOLVED_CONTRADICTION = "law_3_unresolved_contradiction"
    LAW_6_TENSION_PRODUCTIVITY = "law_6_tension_productivity"
    LAW_9_RATCHET_NON_REGRESSION = "law_9_ratchet_non_regression"
    LAW_12_FIXPOINT_CONVERGENCE = "law_12_fixpoint_convergence"


COMPILE_TIME_LAWS: set[InvariantLaw] = {
    InvariantLaw.LAW_1_COMPRESSIBILITY,
    InvariantLaw.LAW_2_SELF_APPLICATION,
    InvariantLaw.LAW_4_CONSTRAINT_PRECISION,
    InvariantLaw.LAW_5_SHADOW_SIGNATURE,
    InvariantLaw.LAW_7_CATEGORY_EXPANSION,
    InvariantLaw.LAW_8_MIN_ENERGY_PATH,
    InvariantLaw.LAW_10_HARVEST_BEFORE_BUILD,
    InvariantLaw.LAW_11_ZERO_WASTED_SURFACE,
}

RUNTIME_LAWS: set[InvariantLaw] = {
    InvariantLaw.LAW_3_UNRESOLVED_CONTRADICTION,
    InvariantLaw.LAW_6_TENSION_PRODUCTIVITY,
    InvariantLaw.LAW_9_RATCHET_NON_REGRESSION,
    InvariantLaw.LAW_12_FIXPOINT_CONVERGENCE,
}


# ── Layer 1: Pre-Check Gate ─────────────────────────────────────────────────

@dataclass
class InvariantResult:
    """Single invariant law evaluation result."""
    law_id: str
    name: str
    passed: bool
    phase: str  # "compile" | "runtime"
    reason: str = ""
    evidence: Dict[str, Any] = field(default_factory=dict)
    latency_us: float = 0.0


@dataclass
class PreCheckResult:
    """Aggregate result of the compile-time pre-check gate."""
    passed: bool
    skip_per_stage: bool
    latency_ms: float
    invariants: List[InvariantResult] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def failed_laws(self) -> List[str]:
        return [i.law_id for i in self.invariants if not i.passed]

    @property
    def passed_laws(self) -> List[str]:
        return [i.law_id for i in self.invariants if i.passed]

    @property
    def compile_latency_us(self) -> float:
        return sum(i.latency_us for i in self.invariants if i.phase == "compile")

    @property
    def rejection_reasons(self) -> str:
        if self.passed:
            return ""
        parts = []
        for inv in self.invariants:
            if not inv.passed:
                parts.append(f"[{inv.law_id}] {inv.name}: {inv.reason}")
        for err in self.errors:
            parts.append(f"[error] {err}")
        return "\n".join(parts)


# ── Layer 2: Unified Processing Filter ──────────────────────────────────────

class StageName(str, Enum):
    MANIFOLD_DETECTION = "manifold_detection"
    GAP_GEOMETRY = "gap_geometry"
    HARVEST_AUDIT = "harvest_audit"
    FIELD_COLLAPSE = "field_collapse"
    FIXPOINT_CHECK = "fixpoint_check"


@dataclass
class StageResult:
    """Output of a single unified filter stage."""
    stage: str
    passed: bool
    output: Dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0.0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FixpointResult:
    """Result of Φ(output) = output? check.

    Termination guarantee: max_iterations is enforced by the evaluator.
    If iterations == max_iterations and not passed, did_timeout is True.
    """
    passed: bool
    score: float  # similarity 0.0–1.0, ≥0.999 = fixpoint
    diff_summary: str = ""
    contradiction_markers: List[str] = field(default_factory=list)
    iterations: int = 1
    max_iterations: int = 3
    did_timeout: bool = False
    tolerance: float = 0.999
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_fixpoint(self) -> bool:
        return self.score >= self.tolerance

    @property
    def converged(self) -> bool:
        """True if fixpoint reached within iteration budget."""
        return self.passed and not self.did_timeout


@dataclass
class PipelineResult:
    """Aggregate result of all 5 unified filter stages."""
    passed: bool
    fixpoint_passed: bool
    stages: List[StageResult] = field(default_factory=list)
    fixpoint: Optional[FixpointResult] = None
    latency_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def stage_by_name(self, name: str) -> Optional[StageResult]:
        for s in self.stages:
            if s.stage == name:
                return s
        return None

    @property
    def failed_stages(self) -> List[str]:
        return [s.stage for s in self.stages if not s.passed]

    @property
    def total_warnings(self) -> int:
        return sum(len(s.warnings) for s in self.stages)

    @property
    def total_errors(self) -> int:
        return sum(len(s.errors) for s in self.stages)


# ── Layer 3: Ratchet Condition Scorer ───────────────────────────────────────

class RatchetCondition(str, Enum):
    RC1_ACTIVE_TENSION = "rc1_active_tension"
    RC2_ZERO_REPRODUCTION_COST = "rc2_zero_reproduction_cost"
    RC3_EXPANDS_SOLUTION_SPACE = "rc3_expands_solution_space"
    RC4_TEACHING_MECHANISM = "rc4_teaching_mechanism"
    RC5_PRODUCTIVE_CONTRADICTIONS = "rc5_productive_contradictions"
    RC6_EMBEDS_COMPRESSION = "rc6_embeds_compression"
    RC7_SUBSTRATE_INDEPENDENT = "rc7_substrate_independent"


RC_DESCRIPTIONS: Dict[RatchetCondition, str] = {
    RatchetCondition.RC1_ACTIVE_TENSION: (
        "The output maintains productive internal tension — it does not "
        "collapse into trivial consensus or safe averaging."
    ),
    RatchetCondition.RC2_ZERO_REPRODUCTION_COST: (
        "The output is maximally compressed — reproducing it from its "
        "Kolmogorov description costs near zero."
    ),
    RatchetCondition.RC3_EXPANDS_SOLUTION_SPACE: (
        "The output opens new paths rather than closing them — solution "
        "space cardinality increases."
    ),
    RatchetCondition.RC4_TEACHING_MECHANISM: (
        "The output contains its own teaching mechanism — a human or agent "
        "can learn the principle from the output alone."
    ),
    RatchetCondition.RC5_PRODUCTIVE_CONTRADICTIONS: (
        "Contradictions in the output are productive — they generate new "
        "information, not noise."
    ),
    RatchetCondition.RC6_EMBEDS_COMPRESSION: (
        "The output embeds its own compression operator — it knows what "
        "is essential and what is not."
    ),
    RatchetCondition.RC7_SUBSTRATE_INDEPENDENT: (
        "The output is substrate-independent — the principle survives "
        "translation across languages, models, and representations."
    ),
}


@dataclass
class RatchetScore:
    """Score across all 7 ratchet conditions."""
    total: int  # 0–7
    verdict: str  # "permanent_ratchet" (≥5) | "useful_artifact" (<5)
    conditions: Dict[str, bool] = field(default_factory=dict)
    reasoning: Dict[str, str] = field(default_factory=dict)
    improvement_hints: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_permanent_ratchet(self) -> bool:
        return self.total >= 5

    @property
    def passed_conditions(self) -> List[str]:
        return [k for k, v in self.conditions.items() if v]

    @property
    def failed_conditions(self) -> List[str]:
        return [k for k, v in self.conditions.items() if not v]


# ── Layer 4: Omega Multiplicator Router ─────────────────────────────────────

class OmegaRoute(str, Enum):
    O1_KOLMOGOROV_COMPRESS = "omega_1_kolmogorov_compress"
    O2_LANDSCAPE_ESCAPE = "omega_2_landscape_escape"
    O3_RENORMALIZE = "omega_3_renormalize"
    O4_AUTOPOIETIC_REBUILD = "omega_4_autopoietic_rebuild"
    O5_PREDICTION_ERROR_TRACK = "omega_5_prediction_error_track"
    O6_TENSION_TOPOLOGY = "omega_6_tension_topology"
    O7_UNSTABLE_SELF_IMPROVEMENT = "omega_7_unstable_self_improvement"


# Symptom → Ω route mapping
OMEGA_SYMPTOM_MAP: Dict[str, OmegaRoute] = {
    "high_latency": OmegaRoute.O1_KOLMOGOROV_COMPRESS,
    "wasted_structure": OmegaRoute.O1_KOLMOGOROV_COMPRESS,
    "landscape_trap": OmegaRoute.O2_LANDSCAPE_ESCAPE,
    "repeated_stagnation": OmegaRoute.O2_LANDSCAPE_ESCAPE,
    "no_zoom_stability": OmegaRoute.O3_RENORMALIZE,
    "interface_reconstruction_failure": OmegaRoute.O4_AUTOPOIETIC_REBUILD,
    "high_prediction_error": OmegaRoute.O5_PREDICTION_ERROR_TRACK,
    "contradiction_accumulation": OmegaRoute.O6_TENSION_TOPOLOGY,
    "unstable_self_improvement": OmegaRoute.O7_UNSTABLE_SELF_IMPROVEMENT,
    "invariant_check_failed": OmegaRoute.O6_TENSION_TOPOLOGY,
    "empty_output": OmegaRoute.O5_PREDICTION_ERROR_TRACK,
    "stage_interface_incompatible": OmegaRoute.O4_AUTOPOIETIC_REBUILD,
    "fixpoint_failed": OmegaRoute.O6_TENSION_TOPOLOGY,
    "rc_below_4": OmegaRoute.O1_KOLMOGOROV_COMPRESS,
    "rc_below_7": OmegaRoute.O3_RENORMALIZE,
}


@dataclass
class OmegaRouteResult:
    """Resolved Ω route with trigger context."""
    omega_id: str
    trigger: str
    rationale: str
    payload: Dict[str, Any] = field(default_factory=dict)
    severity: float = 0.5  # 0.0–1.0, higher = more urgent
    metadata: Dict[str, Any] = field(default_factory=dict)


# ── Jcode Request / Response ─────────────────────────────────────────────────

@dataclass
class JcodeRequest:
    """Incoming jcode execution request."""
    jcode_input: Dict[str, Any]
    source: str = ""  # "chat", "flow_canvas", "manual"
    session_id: str = ""
    repo_path: str = "."
    strict: bool = True  # reject on pre-check failure
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class JcodeResponse:
    """Complete jcode pipeline response with all layer metadata."""
    request_id: str = ""
    precheck: Optional[PreCheckResult] = None
    pipeline: Optional[PipelineResult] = None
    ratchet: Optional[RatchetScore] = None
    omega_routes: List[OmegaRouteResult] = field(default_factory=list)
    verdict: str = "pending"  # "accepted" | "rejected" | "routed"
    total_latency_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_accepted(self) -> bool:
        return self.verdict == "accepted"

    @property
    def is_rejected(self) -> bool:
        return self.verdict == "rejected"

    @property
    def needs_routing(self) -> bool:
        return self.verdict == "routed" or len(self.omega_routes) > 0

    def summary(self) -> str:
        lines = [f"JcodeResponse [{self.verdict}] — {self.total_latency_ms:.1f}ms"]
        if self.precheck:
            status = "PASS" if self.precheck.passed else "FAIL"
            lines.append(f"  PreCheck: {status} ({len(self.precheck.invariants)} laws, "
                         f"{self.precheck.latency_ms:.1f}ms)")
        if self.pipeline:
            fp = "FIXPOINT" if self.pipeline.fixpoint_passed else "NO-FIXPOINT"
            lines.append(f"  Pipeline: {fp} ({len(self.pipeline.stages)} stages, "
                         f"{self.pipeline.latency_ms:.1f}ms)")
        if self.ratchet:
            lines.append(f"  Ratchet: {self.ratchet.total}/7 — {self.ratchet.verdict}")
        if self.omega_routes:
            routes = ", ".join(r.omega_id for r in self.omega_routes)
            lines.append(f"  Ω Routes: {routes}")
        return "\n".join(lines)


# ── Metrics / Observability ─────────────────────────────────────────────────

@dataclass
class JcodeMetrics:
    """Aggregated metrics for jcode pipeline observability."""
    total_requests: int = 0
    precheck_pass_rate: float = 0.0
    fixpoint_pass_rate: float = 0.0
    avg_ratchet_score: float = 0.0
    avg_total_latency_ms: float = 0.0
    avg_precheck_latency_ms: float = 0.0
    avg_pipeline_latency_ms: float = 0.0
    omega_route_frequency: Dict[str, int] = field(default_factory=dict)
    top_failed_laws: List[tuple[str, int]] = field(default_factory=list)
    top_failed_stages: List[tuple[str, int]] = field(default_factory=list)
    history: List[JcodeResponse] = field(default_factory=list)

    def record(self, response: JcodeResponse) -> None:
        self.history.append(response)
        n = len(self.history)

        # Rolling averages
        self.total_requests = n
        self.precheck_pass_rate = (
            sum(1 for r in self.history if r.precheck and r.precheck.passed) / n
        )
        self.fixpoint_pass_rate = (
            sum(1 for r in self.history if r.pipeline and r.pipeline.fixpoint_passed) / n
        )
        self.avg_ratchet_score = (
            sum(r.ratchet.total for r in self.history if r.ratchet) / n
        )
        self.avg_total_latency_ms = (
            sum(r.total_latency_ms for r in self.history) / n
        )
        self.avg_precheck_latency_ms = (
            sum(r.precheck.latency_ms for r in self.history if r.precheck) / n
        )
        self.avg_pipeline_latency_ms = (
            sum(r.pipeline.latency_ms for r in self.history if r.pipeline) / n
        )

        # Ω route frequency
        for route in response.omega_routes:
            self.omega_route_frequency[route.omega_id] = (
                self.omega_route_frequency.get(route.omega_id, 0) + 1
            )

        # Top failures
        law_fails: Dict[str, int] = {}
        stage_fails: Dict[str, int] = {}
        for r in self.history:
            if r.precheck:
                for law in r.precheck.failed_laws:
                    law_fails[law] = law_fails.get(law, 0) + 1
            if r.pipeline:
                for s in r.pipeline.failed_stages:
                    stage_fails[s] = stage_fails.get(s, 0) + 1

        self.top_failed_laws = sorted(law_fails.items(), key=lambda x: -x[1])[:5]
        self.top_failed_stages = sorted(stage_fails.items(), key=lambda x: -x[1])[:5]

    def snapshot(self) -> Dict[str, Any]:
        return {
            "total_requests": self.total_requests,
            "precheck_pass_rate": round(self.precheck_pass_rate, 4),
            "fixpoint_pass_rate": round(self.fixpoint_pass_rate, 4),
            "avg_ratchet_score": round(self.avg_ratchet_score, 2),
            "avg_total_latency_ms": round(self.avg_total_latency_ms, 2),
            "avg_precheck_latency_ms": round(self.avg_precheck_latency_ms, 2),
            "avg_pipeline_latency_ms": round(self.avg_pipeline_latency_ms, 2),
            "omega_route_frequency": dict(self.omega_route_frequency),
            "top_failed_laws": self.top_failed_laws[:],
            "top_failed_stages": self.top_failed_stages[:],
        }
