"""Sprint 6 — Dyson Road Replanner: constraint-aware path selection."""

from __future__ import annotations

import re
from typing import List, Optional

from contract_registry import Constraint, ConstraintType, TaskEdge, TaskNode
from replanner import Replanner
from task_graph import TaskGraph


def path_to_node_id(dep_path: str) -> str:
    """deps/lib.py → dep_deps_lib"""
    slug = re.sub(r"[^a-z0-9]+", "_", dep_path.lower()).strip("_")
    return f"dep_{slug}"[:48]


def apply_constraint(graph: TaskGraph, constraint: Constraint) -> Optional[str]:
    """Mutates graph for one constraint. Returns inserted node id if any."""
    if constraint.type == ConstraintType.MISSING_DEP:
        return _apply_missing_dep(graph, constraint)
    if constraint.type == ConstraintType.PATH_BLOCKED:
        return _apply_path_blocked(graph, constraint)
    if constraint.type == ConstraintType.SPEC_UNCLEAR:
        _reset_blocked_node(graph, constraint.blocked_path)
        return None
    if constraint.type == ConstraintType.BEHAVIOR_WRONG:
        _reset_blocked_node(graph, constraint.blocked_path)
        return None
    return None


def _apply_missing_dep(graph: TaskGraph, constraint: Constraint) -> str:
    blocked = constraint.blocked_path
    dep_path = constraint.dependency
    dep_node_id = path_to_node_id(dep_path)

    if dep_node_id not in graph.nodes:
        graph.add_node(TaskNode(
            id=dep_node_id,
            title=f"write {dep_path}",
            depends_on=[],
            role="builder",
            risk_score=0.2,
            progress_gain=0.7,
            context_retention=0.9,
            status="pending",
        ))
        if blocked in graph.nodes:
            graph.add_edge(TaskEdge(
                source=dep_node_id,
                target=blocked,
                constraint=constraint.to_edge_label(),
            ))

    _reset_blocked_node(graph, blocked)
    return dep_node_id


def _apply_path_blocked(graph: TaskGraph, constraint: Constraint) -> None:
    blocked = constraint.blocked_path
    prereq = constraint.dependency
    if prereq in graph.nodes and blocked in graph.nodes:
        graph.add_edge(TaskEdge(
            source=prereq,
            target=blocked,
            constraint=constraint.to_edge_label(),
        ))
    _reset_blocked_node(graph, blocked)


def _reset_blocked_node(graph: TaskGraph, node_id: str) -> None:
    if node_id in graph.nodes and graph.nodes[node_id].status == "blocked":
        graph.nodes[node_id].status = "pending"


def replan(
    graph: TaskGraph,
    constraints: List[Constraint],
    replanner: Optional[Replanner] = None,
) -> Optional[TaskNode]:
    """
    Wendet alle Constraints an und wählt den nächsten Knoten.
    Z3/heuristic via Replanner.check; Fallback: compute_dyson_road.
    """
    rp = replanner or Replanner()

    for constraint in constraints:
        apply_constraint(graph, constraint)

    result, next_id = rp.check(graph)
    if result == "unsat":
        return None

    if next_id and next_id in graph.nodes:
        node = graph.nodes[next_id]
        if node.status in ("pending", "blocked"):
            node.status = "pending"
            return node

    ready = graph.compute_dyson_road()
    return ready[0] if ready else None
