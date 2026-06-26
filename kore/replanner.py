"""Sprint 6 — Replanner: Z3-basierter Constraint-Satisfaction-Check + neuer Pfad.

Prüft ob die aktuelle Constraint-Menge sat/unsat ist und berechnet einen neuen
Minimum-Energy-Pfad (Sprint 5 Bridge: task_graph.compute_dyson_road()).
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from task_graph import TaskGraph


class Replanner:
    """Prüft Constraints und findet neuen Pfad."""

    def __init__(self) -> None:
        self._history: List[Dict] = []

    def check(self, graph: TaskGraph) -> Tuple[str, Optional[str]]:
        """Constraint-Satisfaction-Check.

        Vereinfachtes Z3-Modell:
        - sat: es gibt ready Nodes → neuer Pfad möglich
        - unsat: keine ready Nodes → Human Gate
        """
        ready = graph.compute_dyson_road()

        if ready:
            result = "sat"
            next_node = ready[0].id
        else:
            # Prüfe ob überhaupt noch pending Knoten existieren
            pending = [n for n in graph.nodes.values() if n.status == "pending"]
            if pending:
                result = "sat"  # Dependencies nicht erfüllt, aber nicht unsat
                next_node = pending[0].id
            else:
                result = "unsat"
                next_node = None

        record = {
            "result": result,
            "next_node": next_node,
            "ready_count": len(ready),
            "pending_count": len([n for n in graph.nodes.values() if n.status == "pending"]),
            "done_count": len([n for n in graph.nodes.values() if n.status == "done"]),
        }
        self._history.append(record)
        return result, next_node

    def get_history(self) -> List[Dict]:
        return list(self._history)

    def reset(self) -> None:
        self._history.clear()

    # ── Omega Route Acceptance (jcode Layer 4 Bridge) ────────────────────

    def accept_omega_routes(
        self,
        graph: TaskGraph,
        omega_routes: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Accept Ω route outputs and convert them to replanning actions.

        Each Ω route may:
          - Add a new constraint edge to the graph
          - Modify node risk scores
          - Trigger a re-planning pass

        Args:
            graph: The active TaskGraph.
            omega_routes: List of OmegaRouteResult-compatible dicts with keys:
                omega_id, trigger, rationale, payload, severity.

        Returns:
            List of actions taken, each with 'action', 'omega_id', 'result'.
        """
        actions: List[Dict[str, Any]] = []

        route_actions = {
            "omega_1_kolmogorov_compress": self._action_compress,
            "omega_2_landscape_escape": self._action_escape,
            "omega_3_renormalize": self._action_renormalize,
            "omega_4_autopoietic_rebuild": self._action_rebuild,
            "omega_5_prediction_error_track": self._action_error_track,
            "omega_6_tension_topology": self._action_tension,
            "omega_7_unstable_self_improvement": self._action_stabilize,
        }

        for route in omega_routes:
            omega_id = route.get("omega_id", "")
            action_fn = route_actions.get(omega_id, self._action_unknown)
            result = action_fn(graph, route)
            result["omega_id"] = omega_id
            result["severity"] = route.get("severity", 0.5)
            actions.append(result)

        return actions

    def _action_compress(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω1: Reduce graph complexity by removing redundant edges."""
        removed = 0
        for node_id, node in list(graph.nodes.items()):
            if node.status == "pending" and node.risk_score < 0.1:
                graph.mark_done(node_id)
                removed += 1
        return {"action": "compress", "result": f"removed {removed} low-risk nodes"}

    def _action_escape(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω2: Perturb node order to escape local minimum."""
        # Reverse the road ordering temporarily
        for node in graph.nodes.values():
            if node.status == "pending":
                node.risk_score = 1.0 - node.risk_score  # invert risk
        return {"action": "landscape_escape", "result": "inverted risk scores"}

    def _action_renormalize(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω3: Strip scale-dependent features — keep only invariant nodes."""
        kept = 0
        for node_id, node in list(graph.nodes.items()):
            if node.status == "pending" and node.dyson_road_score < 0.3:
                graph.mark_done(node_id)  # skip low-impact nodes
            else:
                kept += 1
        return {"action": "renormalize", "result": f"kept {kept} invariant nodes"}

    def _action_rebuild(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω4: Reset blocked nodes to pending (rebuild attempt)."""
        reset_count = 0
        for node_id, node in graph.nodes.items():
            if node.status == "blocked":
                node.status = "pending"
                reset_count += 1
        return {"action": "autopoietic_rebuild", "result": f"reset {reset_count} blocked nodes"}

    def _action_error_track(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω5: Mark all nodes for review (prediction error tracking)."""
        for node in graph.nodes.values():
            if node.status == "pending":
                node.risk_score = min(node.risk_score + 0.2, 1.0)
        return {"action": "prediction_error_track", "result": "increased risk on all pending nodes"}

    def _action_tension(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω6: Force synthesis by merging adjacent pending nodes."""
        # Record tension — actual synthesis requires LLM
        pending = [n for n in graph.nodes.values() if n.status == "pending"]
        return {
            "action": "tension_topology",
            "result": f"identified {len(pending)} nodes for synthesis",
            "pending_nodes": [n.id for n in pending[:5]],
        }

    def _action_stabilize(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Ω7: Freeze a stable checkpoint — mark done on high-confidence nodes."""
        frozen = 0
        for node_id, node in graph.nodes.items():
            if node.status == "pending" and node.dyson_road_score > 0.8:
                graph.mark_done(node_id)
                frozen += 1
        return {"action": "stabilize", "result": f"frozen {frozen} stable nodes"}

    def _action_unknown(
        self, graph: TaskGraph, route: Dict[str, Any]
    ) -> Dict[str, Any]:
        return {"action": "unknown", "result": f"no handler for {route.get('omega_id', '?')}"}
