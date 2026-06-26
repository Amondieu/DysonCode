"""Sprint 5 — Dyson Orchestrator: State Machine + Event System + Sprint Lifecycle.

Der Kernel des KORE Dyson Coding Mode. Steuert den gesamten Sprint-Lebenszyklus
von Spec-Eingabe bis Done-Verdict, dispatcht Rollen, injected Constraints und
emittiert Events für die Mission Control UI.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum, auto
from typing import Any, Callable, Dict, List, Optional, Set, Union

from contract_registry import (
    BuildManifest,
    BuilderFailure,
    CodeDelta,
    Constraint,
    ContractRegistry,
    DoneVerdict,
    FailureClass,
    FailureNote,
    HarnessScore,
    InterfaceContract,
    MemorySnapshot,
    TaskEdge,
    TaskNode,
    TestResult,
)
from constraint_store import ConstraintStore
from done_gate import DoneGate, SprintOutcome
from dyson_road import replan as dyson_replan
from harness_engine import HarnessEngine
from replanner import Replanner
from role_engine import RoleEngine, RoutingMode
from task_graph import TaskGraph, spec_to_task_graph

# ── jcode Pipeline Imports ──
from jcode_models import (
    JcodeRequest,
    JcodeResponse,
    OmegaRouteResult,
    PipelineResult,
    PreCheckResult,
    RatchetScore,
)
from jcode_precheck import run_precheck
from jcode_pipeline import run_jcode_pipeline
from ratchet_scorer import score_ratchet
from omega_router import resolve_omega_route
from jcode_metrics import record_response as _record_jcode_metrics
from litellm_bridge import LiteLLMBridge, get_bridge

# ── jcode Mode Feature Flag ──
_JCODE_MODE_DEFAULT = os.environ.get("JCODE_MODE", "post-validate")


# ── States ───────────────────────────────────────────────────────────────────

class DysonState(Enum):
    IDLE = auto()
    PLANNING = auto()
    EXECUTING = auto()
    NODE_READY = auto()
    NODE_REVIEW = auto()
    NODE_TEST = auto()
    NODE_DONE = auto()
    HEALING = auto()
    DONE_GATE = auto()
    HUMAN_GATE = auto()
    SPRINT_DONE = auto()
    BLOCKED = auto()
    CLOUD_DEGRADED = auto()  # v2
    PII_HOLD = auto()        # v2
    # ── jcode Pipeline States ──
    JCODE_RECEIVED = auto()
    PRECHECK_RUNNING = auto()
    PRECHECK_PASSED = auto()
    PRECHECK_REJECTED = auto()
    PIPELINE_RUNNING = auto()
    RATCHET_SCORING = auto()
    OMEGA_ROUTING = auto()
    EXECUTION_READY = auto()
    REPLAN_REQUIRED = auto()
    REJECTED = auto()
    LLM_CALL_FAILED = auto()  # pre-gate mode: LiteLLM proxy unreachable/error


# ── Events ───────────────────────────────────────────────────────────────────

class DysonEventType(str, Enum):
    SPRINT_STARTED = "kore.sprint.started"
    NODE_START = "kore.node.start"
    NODE_DONE = "kore.node.done"
    NODE_BLOCKED = "kore.node.blocked"
    ROLE_STREAM = "kore.role.stream"
    ROAD_UPDATE = "kore.road.update"
    SCORE_UPDATE = "kore.score.update"
    STATE_CHANGE = "kore.state.change"
    HUMAN_GATE = "kore.human.gate"
    SPRINT_DONE = "kore.sprint.done"
    CONSTRAINT_ADDED = "kore.constraint.added"
    EXEC_BACKEND = "kore.exec.backend"
    # ── jcode Events ──
    JCODE_RECEIVED = "kore.jcode.received"
    PRECHECK_RESULT = "kore.jcode.precheck"
    PIPELINE_RESULT = "kore.jcode.pipeline"
    RATCHET_RESULT = "kore.jcode.ratchet"
    OMEGA_ROUTE = "kore.jcode.omega"
    JCODE_COMPLETE = "kore.jcode.complete"


@dataclass
class DysonEvent:
    type: DysonEventType
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


EventHandler = Callable[[DysonEvent], None]


# ── Autonomy Level ───────────────────────────────────────────────────────────

class AutonomyLevel(Enum):
    """Steuerungsstufe (Sprint 8: Mission Control UI)."""
    FULL_AUTO = auto()       # System entscheidet alles
    PAUSE_BEFORE_NODE = auto()  # Pause vor neuem Knoten
    PAUSE_AT_GATE = auto()   # Pause vor Done Gate
    PAUSED = auto()          # Manuelle Pause


# ── Orchestrator ─────────────────────────────────────────────────────────────

@dataclass
class Sprint:
    """Ein aktiver Sprint."""
    id: str = field(default_factory=lambda: f"sprint-{uuid.uuid4().hex[:8]}")
    spec: str = ""
    state: DysonState = DysonState.IDLE
    manifest: Optional[BuildManifest] = None
    task_graph: Optional[TaskGraph] = None
    current_node: Optional[TaskNode] = None
    harness_score: Optional[HarnessScore] = None
    done_verdict: Optional[DoneVerdict] = None
    constraints: List[str] = field(default_factory=list)
    events: List[DysonEvent] = field(default_factory=list)
    failures: List[FailureNote] = field(default_factory=list)
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class DysonOrchestrator:
    """Zentrale State Machine.

    Lifecycle: IDLE → PLANNING → EXECUTING → ... → DONE_GATE → SPRINT_DONE
    """

    def __init__(
        self,
        role_engine: RoleEngine,
        contract_registry: Optional[ContractRegistry] = None,
        workspace_root: str = ".",
        constraint_store: Optional[ConstraintStore] = None,
        replanner: Optional[Replanner] = None,
        done_gate: Optional[DoneGate] = None,
    ) -> None:
        self.role_engine = role_engine
        self.contracts = contract_registry or ContractRegistry()
        self.workspace_root = workspace_root
        self.constraint_store = constraint_store or ConstraintStore()
        self.replanner = replanner or Replanner()
        self.done_gate = done_gate or DoneGate()
        self.current_sprint: Optional[Sprint] = None
        self.autonomy: AutonomyLevel = AutonomyLevel.FULL_AUTO
        self._listeners: Dict[DysonEventType, List[EventHandler]] = {}
        self._manual_override: Optional[str] = None  # für HUMAN_GATE

    # ── Event System ─────────────────────────────────────────────────────

    def on(self, event_type: DysonEventType, handler: EventHandler) -> None:
        self._listeners.setdefault(event_type, []).append(handler)

    def _emit(self, event_type: DysonEventType, data: Dict[str, Any]) -> None:
        if not self.current_sprint:
            return
        event = DysonEvent(type=event_type, data=data)
        self.current_sprint.events.append(event)
        for handler in self._listeners.get(event_type, []):
            handler(event)

    def _emit_role_stream(
        self,
        role: str,
        message: str,
        *,
        channel: str = "role",
        **data: Any,
    ) -> None:
        self._emit(DysonEventType.ROLE_STREAM, {
            "role": role,
            "message": message,
            "channel": channel,
            **data,
        })

    # ── Lifecycle ────────────────────────────────────────────────────────

    def start_sprint(self, spec: str) -> Sprint:
        """IDLE → PLANNING."""
        if self.current_sprint and self.current_sprint.state not in (
            DysonState.IDLE, DysonState.SPRINT_DONE, DysonState.BLOCKED
        ):
            raise RuntimeError(f"Sprint already running: {self.current_sprint.state}")

        sprint = Sprint(spec=spec)
        self.current_sprint = sprint
        self._emit(DysonEventType.SPRINT_STARTED, {
            "sprint_id": sprint.id,
            "spec_preview": spec[:100],
            "started_at": sprint.created_at,
        })
        self._emit_role_stream(
            "system",
            f"started sprint {sprint.id}",
            channel="system",
            phase="sprint_started",
            sprint_id=sprint.id,
        )
        self._transition_to(DysonState.PLANNING, {"spec": spec[:100]})
        return sprint

    def execute_planning(self) -> BuildManifest:
        """PLANNING → EXECUTING (Architect: Spec → BuildManifest)."""
        if not self.current_sprint or self.current_sprint.state != DysonState.PLANNING:
            raise RuntimeError("Invalid state for planning")

        manifest = spec_to_task_graph(
            self.current_sprint.spec,
            sprint_id=self.current_sprint.id,
        )
        self.current_sprint.manifest = manifest

        tg = TaskGraph.from_manifest(manifest)
        self.current_sprint.task_graph = tg

        # Architect-Prompt rendern (für späteren LLM-Call)
        prompt = self.role_engine.render_prompt("architect", {
            "spec": self.current_sprint.spec,
            "input": self.current_sprint.spec,
        })
        architect_complexity = max(
            (node.risk_score for node in manifest.nodes.values()),
            default=0.5,
        )
        architect_alias = self.role_engine.resolve_alias(
            "architect",
            complexity=architect_complexity,
        )
        self._emit_role_stream(
            "architect",
            f"planned {len(manifest.nodes)} nodes / {len(manifest.edges)} edges via {architect_alias}",
            channel="role",
            alias=architect_alias,
            phase="planning",
            node_count=len(manifest.nodes),
            edge_count=len(manifest.edges),
            content=prompt[:200],
        )

        self._transition_to(DysonState.EXECUTING, {
            "node_count": len(manifest.nodes),
            "edge_count": len(manifest.edges),
        })
        return manifest

    def execute_next_node(self) -> Optional[TaskNode]:
        """EXECUTING → NODE_*: Wähle nächsten Knoten via Dyson Road."""
        if not self.current_sprint or not self.current_sprint.task_graph:
            raise RuntimeError("No active sprint or task graph")

        tg = self.current_sprint.task_graph

        # Autonomy Check
        if self.autonomy == AutonomyLevel.PAUSED:
            return None
        if self.autonomy == AutonomyLevel.PAUSE_BEFORE_NODE:
            self._emit(DysonEventType.HUMAN_GATE, {
                "reason": "autonomy_pause_before_node",
                "action": "proceed",
            })
            return None

        ready = tg.compute_dyson_road()
        if not ready:
            # Alle Knoten done → DONE_GATE
            self._transition_to(DysonState.DONE_GATE, {})
            return None

        node = ready[0]
        tg.mark_running(node.id)
        self.current_sprint.current_node = node
        role_alias = self.role_engine.resolve_alias(
            node.role,
            complexity=node.risk_score,
        )
        self._emit_role_stream(
            node.role,
            f"selected node {node.id}: {node.title}",
            channel="role",
            alias=role_alias,
            phase="node_selected",
            node_id=node.id,
            title=node.title,
            risk=node.risk_score,
        )

        self._transition_to(DysonState.NODE_READY, {
            "node_id": node.id,
            "title": node.title,
            "role": node.role,
            "risk": node.risk_score,
            "dyson_score": round(node.dyson_road_score, 3),
        })
        return node

    def execute_builder_node(
        self,
        plan: Optional[Any] = None,
        *,
        backend: Optional[Any] = None,
        auto_recover: bool = True,
    ) -> Optional[Union[CodeDelta, TaskNode]]:
        """NODE_READY builder: BuilderSession → CodeDelta or auto-recovery via HEALING."""
        if not self.current_sprint or not self.current_sprint.current_node:
            raise RuntimeError("No active node")

        node = self.current_sprint.current_node
        if node.role != "builder":
            raise RuntimeError(f"execute_builder_node requires builder role, got {node.role}")

        from execution.adapter import KoreExecFatalError
        from execution.builder_session import BuilderSession, BuilderToolPlan

        pii_hold = self.current_sprint.state == DysonState.PII_HOLD
        builder_alias = self.role_engine.resolve_alias(
            node.role,
            complexity=node.risk_score,
            is_pii=pii_hold,
        )

        def _on_tool(call: Any, result: Any) -> None:
            self._emit(DysonEventType.EXEC_BACKEND, {
                "backend": result.backend,
                "tool": call.tool,
                "status": result.status.value,
                "duration_ms": result.duration_ms,
                "node_id": node.id,
            })
            self._emit_role_stream(
                node.role,
                f"tool {call.tool} -> {result.status.value}",
                channel="tool",
                alias=builder_alias,
                phase="tool_result",
                node_id=node.id,
                tool=call.tool,
                backend=result.backend,
                status=result.status.value,
            )

        session = BuilderSession(
            backend=backend,
            workspace_root=self.workspace_root,
            on_tool_result=_on_tool,
        )
        if plan is None:
            tool_plan = BuilderSession.plan_from_node(node, self.workspace_root)
        elif isinstance(plan, BuilderToolPlan):
            tool_plan = plan
        else:
            tool_plan = BuilderToolPlan(calls=list(plan.calls))

        self._emit_role_stream(
            node.role,
            f"prepared {len(tool_plan.calls)} tool calls for {node.id}",
            channel="role",
            alias=builder_alias,
            phase="plan_ready",
            node_id=node.id,
            tool_count=len(tool_plan.calls),
        )

        try:
            result = session.run(node, tool_plan, pii_hold=pii_hold)
        except KoreExecFatalError as exc:
            self.fail_node(exc.note, constraint=exc.constraint)
            if auto_recover:
                return self.heal_and_replan()
            return None

        if isinstance(result, BuilderFailure):
            self.fail_node(result.note, constraint=result.constraint)
            if auto_recover:
                return self.heal_and_replan()
            return None

        if isinstance(result, CodeDelta):
            self._emit_role_stream(
                node.role,
                f"completed {node.id} with {len(result.files_changed)} file changes",
                channel="role",
                alias=builder_alias,
                phase="node_completed",
                node_id=node.id,
                files_changed=list(result.files_changed),
                confidence=result.confidence,
            )

        self.complete_node(result)
        return result

    def complete_node(self, result: Any) -> None:
        """Markiert Knoten als done → sucht nächsten oder geht zu HEALING/TEST."""
        if not self.current_sprint or not self.current_sprint.current_node:
            raise RuntimeError("No active node")

        node = self.current_sprint.current_node
        tg = self.current_sprint.task_graph
        tg.mark_done(node.id)

        # Je nach Rolle: nächster Schritt
        if node.role == "builder" and isinstance(result, CodeDelta):
            # Builder done → Critic (wenn complexity ≥ 0.5)
            if result.confidence < 0.5:
                self._transition_to(DysonState.NODE_REVIEW, {
                    "node_id": node.id,
                    "reason": "low_confidence",
                })
            else:
                self._transition_to(DysonState.NODE_TEST, {
                    "node_id": node.id,
                })
        elif node.role == "critic" and isinstance(result, FailureNote):
            # Critic fand Fehler → HEALING
            self.current_sprint.failures.append(result)
            self._inject_constraint(result)
            self._transition_to(DysonState.HEALING, {
                "node_id": node.id,
                "failure": result.failure_class,
                "severity": result.severity,
            })
        else:
            # Default: Tester
            self._transition_to(DysonState.NODE_TEST, {
                "node_id": node.id,
            })

        self._emit(DysonEventType.NODE_DONE, {
            "node_id": node.id,
            "status": "done",
        })

    def fail_node(
        self,
        failure: FailureNote,
        constraint: Optional[Constraint] = None,
    ) -> None:
        """BLOCKED → HEALING mit FailureNote + optional typed Constraint."""
        if not self.current_sprint or not self.current_sprint.current_node:
            raise RuntimeError("No active node")

        if constraint is not None:
            self.constraint_store.append(constraint)
            self._emit(DysonEventType.CONSTRAINT_ADDED, {
                "type": constraint.type.value,
                "blocked_path": constraint.blocked_path,
                "dependency": constraint.dependency,
                "message": constraint.message,
                "source_tool": constraint.source_tool,
            })

        node = self.current_sprint.current_node
        tg = self.current_sprint.task_graph
        tg.mark_blocked(node.id)
        self.current_sprint.failures.append(failure)

        self._inject_constraint(failure)
        self._emit(DysonEventType.NODE_BLOCKED, {
            "node_id": node.id,
            "failure_class": failure.failure_class,
            "constraint": failure.constraint,
            "severity": failure.severity,
        })
        self._transition_to(DysonState.HEALING, {
            "node_id": node.id,
            "failure": failure.failure_class,
            "constraint": failure.constraint,
            "constraint_type": constraint.type.value if constraint else None,
        })

    def heal_and_replan(self) -> Optional[TaskNode]:
        """HEALING → EXECUTING via dyson_road.replan oder → HUMAN_GATE (unsat)."""
        if not self.current_sprint or not self.current_sprint.task_graph:
            raise RuntimeError("No active sprint")

        tg = self.current_sprint.task_graph
        constraints = self.constraint_store.active()

        node = dyson_replan(tg, constraints, self.replanner)

        if node is None:
            self._transition_to(DysonState.HUMAN_GATE, {
                "reason": "no_alternative_path",
                "failures": len(self.current_sprint.failures),
            })
            return None

        tg.mark_running(node.id)
        self.current_sprint.current_node = node
        self._transition_to(DysonState.EXECUTING, {
            "node_id": node.id,
            "recovery": True,
            "constraint_count": len(constraints),
        })
        return node

    def run_harness_and_finalize(self) -> DoneVerdict:
        """
        DONE_GATE: HarnessEngine misst → DoneGate urteilt → SPRINT_DONE / BLOCKED.
        OpenHands baut vorher; Harness urteilt nie über Builder-Output direkt.
        """
        if not self.current_sprint:
            raise RuntimeError("No active sprint")

        self._transition_to(DysonState.DONE_GATE, {
            "sprint_id": self.current_sprint.id,
        })

        harness = HarnessEngine(self.workspace_root)
        score = harness.run_all()
        self.current_sprint.harness_score = score

        outcome = self.done_gate.evaluate_sprint(score, self.current_sprint.id)
        verdict = self.done_gate.to_done_verdict(outcome)

        self._emit(DysonEventType.SCORE_UPDATE, {
            "total": round(score.total(), 3),
            "outcome": outcome.value,
            "hard_gates_pass": harness.hard_gates_pass(),
            "pillars": {
                "build": score.build,
                "tests": score.tests,
                "coverage": score.coverage,
                "type_safety": score.type_safety,
                "architecture": score.architecture,
                "ux_gate": score.ux_gate,
                "llm_judge": score.llm_judge,
            },
            "build": score.build,
            "tests": score.tests,
        })

        if outcome == SprintOutcome.BLOCKED:
            self.current_sprint.done_verdict = verdict
            self._transition_to(DysonState.BLOCKED, {
                "reason": "harness_gate_failed",
                "score": score.total(),
            })
            return verdict

        self.current_sprint.done_verdict = verdict
        self._transition_to(DysonState.SPRINT_DONE, {
            "score": score.total(),
            "verdict": verdict,
            "outcome": outcome.value,
            "failures": len(self.current_sprint.failures),
            "node_count": len(self.current_sprint.task_graph.nodes)
            if self.current_sprint.task_graph else 0,
        })
        self._emit(DysonEventType.SPRINT_DONE, {
            "score": score.total(),
            "verdict": verdict.value,
            "outcome": outcome.value,
        })
        self._emit_role_stream(
            "system",
            f"sprint finished with {outcome.value}",
            channel="system",
            phase="sprint_done",
            outcome=outcome.value,
            score=score.total(),
        )
        return verdict

    def finalize_sprint(self) -> DoneVerdict:
        """Legacy finalize — delegates to harness score if present."""
        if not self.current_sprint:
            raise RuntimeError("No active sprint")

        if self.current_sprint.harness_score is None:
            return self.run_harness_and_finalize()

        score = self.current_sprint.harness_score
        verdict = score.verdict()

        self.current_sprint.done_verdict = verdict
        self._transition_to(DysonState.SPRINT_DONE, {
            "score": score.total(),
            "verdict": verdict,
            "failures": len(self.current_sprint.failures),
            "node_count": len(self.current_sprint.task_graph.nodes)
            if self.current_sprint.task_graph else 0,
        })
        return verdict

    # ── Autonomy Controls ─────────────────────────────────────────────────

    def pause(self) -> None:
        self.autonomy = AutonomyLevel.PAUSED
        self._emit(DysonEventType.STATE_CHANGE, {"autonomy": "paused"})

    def resume(self) -> None:
        self.autonomy = AutonomyLevel.FULL_AUTO
        self._emit(DysonEventType.STATE_CHANGE, {"autonomy": "full_auto"})

    def abort(self) -> None:
        self.current_sprint = None
        self._emit(DysonEventType.STATE_CHANGE, {"autonomy": "aborted"})

    def human_decision(self, decision: str) -> None:
        """Verarbeitet Human-Gate-Entscheidung."""
        if decision == "proceed":
            self.autonomy = AutonomyLevel.FULL_AUTO
            self._transition_to(DysonState.EXECUTING, {
                "human_decision": "proceed",
            })
        elif decision == "cancel":
            self.abort()

    # ── Internals ─────────────────────────────────────────────────────────

    def _transition_to(self, state: DysonState, data: Dict[str, Any]) -> None:
        if not self.current_sprint:
            return
        old_state = self.current_sprint.state
        self.current_sprint.state = state
        self._emit(DysonEventType.STATE_CHANGE, {
            "from": old_state.name,
            "to": state.name,
            **data,
        })

    def _inject_constraint(self, failure: FailureNote) -> None:
        """FailureNote → neue Edge im Task Graph (C3: Failure-as-Constraint)."""
        if not self.current_sprint or not self.current_sprint.task_graph:
            return

        tg = self.current_sprint.task_graph
        constraint_id = f"C-{len(self.current_sprint.constraints) + 1:03d}"
        constraint_str = f"{constraint_id}: {failure.constraint}"

        self.current_sprint.constraints.append(constraint_str)

        # Wenn ein aktueller Knoten und Dependency-Constraint
        if self.current_sprint.current_node:
            tg.apply_constraint(
                source=failure.failure_class,
                target=self.current_sprint.current_node.id,
                constraint=constraint_str,
            )

        self._emit(DysonEventType.ROAD_UPDATE, {
            "constraint_id": constraint_id,
            "constraint": constraint_str,
            "failure_class": failure.failure_class,
            "node_id": failure.node_id,
        })

    def get_state(self) -> Dict[str, Any]:
        """Aktuellen Zustand als Dict (für IPC/UI)."""
        if not self.current_sprint:
            return {"state": "IDLE", "sprint": None}
        s = self.current_sprint
        return {
            "state": s.state.name,
            "sprint_id": s.id,
            "progress": s.task_graph.dyson_road_progress()
            if s.task_graph else 0.0,
            "current_node": s.current_node.id if s.current_node else None,
            "failures": len(s.failures),
            "constraints": len(s.constraints),
            "autonomy": self.autonomy.name,
            "events": len(s.events),
        }

    # ── jcode Pipeline Integration ───────────────────────────────────────

    def process_jcode_request(
        self,
        jcode_input: Dict[str, Any],
        *,
        source: str = "manual",
        session_id: str = "",
        mode: Optional[str] = None,
    ) -> JcodeResponse:
        """Main end-to-end entrypoint for jcode-native execution.

        Lifecycle (post-validate mode):
          JCODE_RECEIVED → PRECHECK_RUNNING → PRECHECK_PASSED/REJECTED
          → PIPELINE_RUNNING → RATCHET_SCORING → OMEGA_ROUTING
          → EXECUTION_READY / REPLAN_REQUIRED / REJECTED

        Lifecycle (pre-gate mode):
          JCODE_RECEIVED → PRECHECK → PIPELINE (stages 1-4)
          → LITELLM CALL → FIXPOINT(on LLM response) → RATCHET → OMEGA

        Each phase emits structured events for Mission Control UI.

        Args:
            jcode_input: Raw jcode payload (spec, nodes, edges, code, etc.).
            source: Origin of the request ("chat", "flow_canvas", "manual").
            session_id: Session identifier for metrics tracking.
            mode: "pre-gate" (jcode validates prompt BEFORE LLM call)
                  or "post-validate" (jcode validates model output AFTER).
                  Default from JCODE_MODE env var, falls back to "post-validate".

        Returns:
            JcodeResponse with all 4 layer results, LLM response (if pre-gate),
            metadata, and verdict.
        """
        effective_mode = mode or _JCODE_MODE_DEFAULT
        if effective_mode not in ("pre-gate", "post-validate"):
            effective_mode = "post-validate"
        import time
        import uuid

        request_id = f"jcode-{uuid.uuid4().hex[:8]}"
        total_start = time.perf_counter()

        # ── Phase 0: JCODE_RECEIVED ──
        self._emit(DysonEventType.JCODE_RECEIVED, {
            "request_id": request_id,
            "source": source,
            "session_id": session_id,
            "input_size": len(str(jcode_input)),
        })

        # ── Phase 1: Pre-Check Gate ──
        self._emit(DysonEventType.STATE_CHANGE, {
            "from": "JCODE_RECEIVED",
            "to": "PRECHECK_RUNNING",
            "request_id": request_id,
        })
        precheck = run_precheck(jcode_input, strict=True, parallel=True)

        self._emit(DysonEventType.PRECHECK_RESULT, {
            "request_id": request_id,
            "passed": precheck.passed,
            "laws_evaluated": len(precheck.invariants),
            "laws_passed": len(precheck.passed_laws),
            "laws_failed": precheck.failed_laws,
            "latency_ms": precheck.latency_ms,
        })

        if not precheck.passed:
            self._emit(DysonEventType.STATE_CHANGE, {
                "from": "PRECHECK_RUNNING",
                "to": "PRECHECK_REJECTED",
                "request_id": request_id,
                "reasons": precheck.rejection_reasons,
            })
            response = JcodeResponse(
                request_id=request_id,
                precheck=precheck,
                verdict="rejected",
                total_latency_ms=round((time.perf_counter() - total_start) * 1000, 3),
                metadata={
                    "source": source,
                    "session_id": session_id,
                    "rejection_reason": precheck.rejection_reasons,
                },
            )
            _record_jcode_metrics(response)
            return response

        # ── Phase 2: Pipeline ──
        self._emit(DysonEventType.STATE_CHANGE, {
            "from": "PRECHECK_PASSED",
            "to": "PIPELINE_RUNNING",
            "request_id": request_id,
        })
        pipeline = run_jcode_pipeline(jcode_input, precheck, parallel=precheck.skip_per_stage)

        self._emit(DysonEventType.PIPELINE_RESULT, {
            "request_id": request_id,
            "passed": pipeline.passed,
            "fixpoint_passed": pipeline.fixpoint_passed,
            "stages_passed": sum(1 for s in pipeline.stages if s.passed),
            "total_stages": len(pipeline.stages),
            "latency_ms": pipeline.latency_ms,
        })

        # ── Phase 2.5: LiteLLM Call (pre-gate mode only) ──
        llm_response: Optional[Dict[str, Any]] = None
        if effective_mode == "pre-gate":
            # In pre-gate mode, the jcode input IS the prompt.
            # PreCheck + Pipeline stages 1-4 have validated and collapsed it.
            # Now we send it to the LLM, then check fixpoint on the response.
            prompt_text = jcode_input.get("spec", jcode_input.get("prompt", str(jcode_input)))

            # Resolve model via role engine if available
            model = self.role_engine.resolve_alias(
                "builder", complexity=0.5
            ) if self.role_engine else None

            bridge = get_bridge()
            llm_response = bridge.complete(
                prompt=prompt_text,
                model=model,
                system=(
                    "You are jcode — the DysonCode execution pipeline. "
                    "Respond with actionable code, build commands, or implementation plans. "
                    "Prefer concrete output over explanation."
                ),
            )

            if llm_response.get("error"):
                # LLM call failed — emit explicit state, route to REPLAN_REQUIRED.
                # A model error is not a schema error. The prompt was valid;
                # the transport failed. Retry or re-route via Ω4 (autopoietic rebuild).
                ratchet_fallback = score_ratchet(pipeline)  # score pipeline without LLM
                omega_routes = resolve_omega_route(
                    pipeline, ratchet_fallback, precheck_passed=precheck.passed
                )
                self._emit(DysonEventType.STATE_CHANGE, {
                    "from": "PIPELINE_RUNNING",
                    "to": "LLM_CALL_FAILED",
                    "request_id": request_id,
                    "error": llm_response["error"],
                    "model": llm_response.get("model"),
                })
                self._emit_role_stream(
                    "system",
                    f"jcode {request_id}: LiteLLM call FAILED — {llm_response['error']}",
                    channel="system",
                    phase="litellm_failed",
                    request_id=request_id,
                    error=llm_response["error"],
                )
                response = JcodeResponse(
                    request_id=request_id,
                    precheck=precheck,
                    pipeline=pipeline,
                    ratchet=ratchet_fallback,
                    omega_routes=omega_routes,
                    verdict="routed",
                    total_latency_ms=round((time.perf_counter() - total_start) * 1000, 3),
                    metadata={
                        "source": source,
                        "session_id": session_id,
                        "mode": effective_mode,
                        "precheck_passed": precheck.passed,
                        "llm_error": llm_response["error"],
                        "state": "LLM_CALL_FAILED",
                    },
                )
                _record_jcode_metrics(response)
                return response

            self._emit_role_stream(
                "system",
                f"jcode {request_id}: LiteLLM call ({llm_response.get('model', '?')}) "
                f"— {llm_response.get('tokens_used', 0)} tokens, "
                f"{llm_response.get('latency_ms', 0):.1f}ms",
                channel="system",
                phase="litellm_call",
                request_id=request_id,
                model=llm_response.get("model"),
                tokens_used=llm_response.get("tokens_used"),
                latency_ms=llm_response.get("latency_ms"),
            )

            # Re-run fixpoint check on the LLM response (not the jcode input)
            if llm_response.get("content") and not llm_response.get("error"):
                from fixpoint_evaluator import evaluate_fixpoint

                llm_fixpoint = evaluate_fixpoint(
                    {"stages": {"llm_output": {"content": llm_response["content"]}}, "stage_count": 1},
                    tolerance=0.999,
                    max_iterations=2,
                )
                # Override pipeline fixpoint with LLM response fixpoint
                pipeline.fixpoint_passed = llm_fixpoint.passed
                if pipeline.fixpoint:
                    pipeline.fixpoint.passed = llm_fixpoint.passed
                    pipeline.fixpoint.score = llm_fixpoint.score
                    pipeline.fixpoint.did_timeout = llm_fixpoint.did_timeout
                    pipeline.fixpoint.contradiction_markers = llm_fixpoint.contradiction_markers
                    pipeline.fixpoint.metadata["llm_fixpoint"] = True
                    pipeline.fixpoint.metadata["llm_model"] = llm_response.get("model")

        # ── Phase 3: Ratchet Scoring ──
        ratchet = score_ratchet(pipeline)

        self._emit(DysonEventType.RATCHET_RESULT, {
            "request_id": request_id,
            "rc_total": ratchet.total,
            "verdict": ratchet.verdict,
            "is_permanent_ratchet": ratchet.is_permanent_ratchet,
            "failed_conditions": ratchet.failed_conditions,
        })

        # ── Phase 4: Ω Routing ──
        omega_routes = resolve_omega_route(pipeline, ratchet, precheck_passed=precheck.passed)

        for route in omega_routes:
            self._emit(DysonEventType.OMEGA_ROUTE, {
                "request_id": request_id,
                "omega_id": route.omega_id,
                "trigger": route.trigger,
                "severity": route.severity,
            })

        # ── Feed Ω routes + RC hints to replanner/constraint injector ──
        if self.current_sprint and self.current_sprint.task_graph:
            from constraint_injector import ConstraintInjector

            injector = ConstraintInjector()
            node_id = (
                self.current_sprint.current_node.id
                if self.current_sprint.current_node else ""
            )

            # 1. Feed Ω routes to replanner
            if omega_routes:
                route_dicts = [
                    {
                        "omega_id": r.omega_id,
                        "trigger": r.trigger,
                        "rationale": r.rationale,
                        "payload": r.payload,
                        "severity": r.severity,
                    }
                    for r in omega_routes
                ]
                self.replanner.accept_omega_routes(
                    self.current_sprint.task_graph, route_dicts
                )

            # 2. Inject ratchet improvement hints as planning constraints.
            #    This closes the feedback loop: RC scorer → constraint injector → replanner.
            #    Without this, RC scoring is just logging. With it, the system learns.
            if ratchet.improvement_hints:
                injector.inject_ratchet_hints(
                    self.current_sprint.task_graph,
                    ratchet.improvement_hints,
                    node_id=node_id,
                )

            # 3. Inject runtime invariant fallback if needed
            if precheck.failed_laws:
                runtime_laws = [
                    law for law in precheck.failed_laws
                    if law not in {
                        "law_1_compressibility", "law_2_self_application",
                        "law_4_constraint_precision", "law_5_shadow_signature",
                        "law_7_category_expansion", "law_8_min_energy_path",
                        "law_10_harvest_before_build", "law_11_zero_wasted_surface",
                    }
                ]
                if runtime_laws:
                    injector.inject_invariant_fallback(
                        self.current_sprint.task_graph,
                        runtime_laws,
                        node_id=node_id,
                    )

        # ── Determine verdict ──
        if not pipeline.passed or not pipeline.fixpoint_passed:
            if omega_routes:
                verdict_state = DysonState.REPLAN_REQUIRED
                verdict = "routed"
            else:
                verdict_state = DysonState.REJECTED
                verdict = "rejected"
        elif ratchet.total < 4:
            verdict_state = DysonState.EXECUTION_READY
            verdict = "accepted"  # useful artifact, not permanent ratchet
        else:
            verdict_state = DysonState.EXECUTION_READY
            verdict = "accepted"

        total_latency_ms = round((time.perf_counter() - total_start) * 1000, 3)

        response = JcodeResponse(
            request_id=request_id,
            precheck=precheck,
            pipeline=pipeline,
            ratchet=ratchet,
            omega_routes=omega_routes,
            verdict=verdict,
            total_latency_ms=total_latency_ms,
            metadata={
                "source": source,
                "session_id": session_id,
                "mode": effective_mode,
                "precheck_passed": precheck.passed,
                "fixpoint_passed": pipeline.fixpoint_passed,
                "rc_total": ratchet.total,
                "omega_routes": len(omega_routes),
                "llm_response": (
                    {
                        "content": llm_response.get("content", "")[:500],
                        "model": llm_response.get("model"),
                        "tokens_used": llm_response.get("tokens_used"),
                        "finish_reason": llm_response.get("finish_reason"),
                        "latency_ms": llm_response.get("latency_ms"),
                        "error": llm_response.get("error"),
                    }
                    if llm_response else None
                ),
            },
        )

        # ── Record metrics ──
        _record_jcode_metrics(response)

        self._emit(DysonEventType.JCODE_COMPLETE, {
            "request_id": request_id,
            "verdict": verdict,
            "total_latency_ms": total_latency_ms,
            "rc_total": ratchet.total,
        })

        self._emit_role_stream(
            "system",
            f"jcode {request_id}: {verdict} (RC={ratchet.total}/7, "
            f"precheck={'PASS' if precheck.passed else 'FAIL'}, "
            f"fixpoint={'PASS' if pipeline.fixpoint_passed else 'FAIL'})",
            channel="system",
            phase="jcode_complete",
            request_id=request_id,
            verdict=verdict,
            rc_total=ratchet.total,
        )

        return response
