"""Sprint 6 — Constraint Injector: FailureNote → DAG Edge + Replanning.

Empfängt klassifizierte FailureNotes und fügt sie als neue Constraint-Edges
in den Task Graph ein (C3: Failure-as-Constraint).
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set

from contract_registry import FailureNote, TaskEdge
from task_graph import TaskGraph


class ConstraintInjector:
    """Wandelt FailureNotes in Graph-Constraints um."""

    def __init__(self) -> None:
        self._injected: Dict[str, List[str]] = {}  # node_id → list of constraints

    def inject(self, graph: TaskGraph, failure: FailureNote) -> TaskEdge:
        """Fügt eine neue Constraint-Edge basierend auf FailureNote ein."""
        constraint_id = f"C-{len(self._injected.get(failure.node_id, [])) + 1:03d}"
        constraint_str = f"{constraint_id}: {failure.constraint}"

        # Ziel-Knoten bestimmen
        target = self._resolve_target(graph, failure)
        source = f"constraint_{failure.failure_class.value}"

        edge = TaskEdge(source=source, target=target, constraint=constraint_str)
        graph.apply_constraint(source, target, constraint_str)

        self._injected.setdefault(failure.node_id, []).append(constraint_str)
        return edge

    def _resolve_target(self, graph: TaskGraph, failure: FailureNote) -> str:
        """Bestimmt den Ziel-Knoten für die Constraint."""
        if failure.node_id and failure.node_id in graph.nodes:
            return failure.node_id
        # Fallback: erster nicht-done Knoten
        for nid, node in graph.nodes.items():
            if node.status in ("pending", "ready", "running"):
                return nid
        return failure.node_id or "unknown"

    def get_constraints(self, node_id: Optional[str] = None) -> Dict[str, List[str]]:
        if node_id:
            return {node_id: self._injected.get(node_id, [])}
        return dict(self._injected)

    def constraint_count(self) -> int:
        return sum(len(v) for v in self._injected.values())

    # ── Runtime Invariant Fallback (jcode Layer 1 Bridge) ─────────────────

    def inject_invariant_fallback(
        self,
        graph: "TaskGraph",
        failed_laws: List[str],
        node_id: str = "",
    ) -> List[TaskEdge]:
        """Inject runtime constraints for state-dependent invariants that
        cannot be checked at compile-time.

        This is the fallback path for the 4 runtime laws:
          - Law 3: Unresolved contradiction is not failure
          - Law 6: Tension productivity
          - Law 9: Ratchet non-regression
          - Law 12: Fixpoint convergence

        Args:
            graph: The active TaskGraph.
            failed_laws: List of law IDs that failed at runtime.
            node_id: The node where the failure was detected.

        Returns:
            List of injected TaskEdges (constraints).
        """
        injected: List[TaskEdge] = []

        law_to_constraint = {
            "law_3_unresolved_contradiction": (
                "Unresolved contradiction detected — Critic must re-evaluate "
                "before proceeding."
            ),
            "law_6_tension_productivity": (
                "Tension is unproductive — force synthesis via Ω6 route."
            ),
            "law_9_ratchet_non_regression": (
                "Ratchet score regressed — block execution until RC restored."
            ),
            "law_12_fixpoint_convergence": (
                "Fixpoint not converging — trigger Ω3 renormalization."
            ),
        }

        for law_id in failed_laws:
            constraint_msg = law_to_constraint.get(
                law_id,
                f"Runtime invariant '{law_id}' failed — constraint injected.",
            )
            edge = self.inject(
                graph,
                FailureNote(
                    node_id=node_id or "runtime_invariant",
                    failure_class=FailureClass.PLANNING_FAILURE,
                    severity=2,
                    constraint=constraint_msg,
                    description=f"Runtime invariant check failed: {law_id}",
                    suggested_action="Re-run with invariant enforcement.",
                ),
            )
            injected.append(edge)

        return injected

    def runtime_law_fallback_active(self) -> bool:
        """Check if any runtime law fallback constraints are active."""
        return any(
            "runtime_invariant" in c
            for constraints in self._injected.values()
            for c in constraints
        )

    # ── Ratchet Improvement Hint Injection (jcode Layer 3 → Replanner) ──

    def inject_ratchet_hints(
        self,
        graph: "TaskGraph",
        improvement_hints: List[str],
        node_id: str = "",
    ) -> List[TaskEdge]:
        """Inject ratchet improvement hints as planning constraints.

        Each hint from ratchet_scorer.suggest_ratchet_improvements() becomes
        a constraint edge in the task graph. This closes the feedback loop:
        RC scorer → constraint injector → replanner → next execution cycle.

        Without this, RC scoring is just logging. With it, the system learns.

        Args:
            graph: The active TaskGraph.
            improvement_hints: List of hint strings from ratchet_scorer.
            node_id: The node where RC scoring was performed.

        Returns:
            List of injected TaskEdges (constraints).
        """
        injected: List[TaskEdge] = []

        for i, hint in enumerate(improvement_hints):
            # Extract RC identifier from hint prefix (e.g., "RC1: ...")
            rc_id = hint.split(":")[0].strip() if ":" in hint else f"RC-{i}"
            constraint_id = f"RC-HINT-{i + 1:03d}"

            edge = self.inject(
                graph,
                FailureNote(
                    node_id=node_id or "ratchet_scorer",
                    failure_class=FailureClass.PLANNING_FAILURE,
                    severity=1,  # Hints are advisory, not blocking
                    constraint=f"{constraint_id}: {hint[:120]}",
                    description=f"Ratchet improvement hint: {rc_id}",
                    suggested_action=hint,
                ),
            )
            injected.append(edge)

        return injected

    def active_ratchet_hints(self) -> List[str]:
        """Return all active ratchet improvement hint constraints."""
        hints: List[str] = []
        for constraints in self._injected.values():
            for c in constraints:
                if "RC-HINT-" in c or c.startswith("RC"):
                    hints.append(c)
        return hints
