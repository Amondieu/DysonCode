"""Sprint 5 — Task Graph: DAG + Dyson Road Optimizer.

NetworkX-basierter Dependency-Graph mit Minimum-Energy-Pfad-Berechnung.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from contract_registry import BuildManifest, TaskEdge, TaskNode


@dataclass
class TaskGraph:
    """Gewichteter DAG für die Dyson Road Optimierung."""

    nodes: Dict[str, TaskNode] = field(default_factory=dict)
    edges: List[TaskEdge] = field(default_factory=list)
    _adjacency: Dict[str, Set[str]] = field(default_factory=dict)
    _incoming: Dict[str, Set[str]] = field(default_factory=dict)

    @classmethod
    def from_manifest(cls, manifest: BuildManifest) -> "TaskGraph":
        tg = cls()
        tg.nodes = dict(manifest.nodes)
        tg.edges = list(manifest.edges)

        # Adjazenz aufbauen
        for nid in tg.nodes:
            tg._adjacency.setdefault(nid, set())
            tg._incoming.setdefault(nid, set())

        for e in tg.edges:
            tg._adjacency.setdefault(e.source, set()).add(e.target)
            tg._incoming.setdefault(e.target, set()).add(e.source)

        return tg

    def add_node(self, node: TaskNode) -> None:
        if node.id in self.nodes:
            raise ValueError(f"Node {node.id} already exists")
        self.nodes[node.id] = node
        self._adjacency.setdefault(node.id, set())
        self._incoming.setdefault(node.id, set())

    def add_edge(self, edge: TaskEdge) -> None:
        # prüft auf Zyklen (einfach: verhindert backward edge)
        if edge.target in self._adjacency.get(edge.source, set()):
            return  # already exists
        self.edges.append(edge)
        self._adjacency.setdefault(edge.source, set()).add(edge.target)
        self._incoming.setdefault(edge.target, set()).add(edge.source)

    def get_ready_nodes(self) -> List[TaskNode]:
        """Alle Knoten deren Dependencies erfüllt sind."""
        ready = []
        for nid, node in self.nodes.items():
            if node.status != "pending":
                continue
            deps = self._incoming.get(nid, set())
            if all(self.nodes[d].status == "done" for d in deps):
                ready.append(node)
        return ready

    def topological_generations(self) -> List[List[str]]:
        """Parallelisierbare Execution-Levels (Kahn's Algorithm)."""
        in_degree: Dict[str, int] = {
            nid: len(self._incoming.get(nid, set())) for nid in self.nodes
        }
        queue = [nid for nid, deg in in_degree.items() if deg == 0]
        levels: List[List[str]] = []

        while queue:
            level: List[str] = []
            next_queue: List[str] = []
            for nid in queue:
                level.append(nid)
                for neighbor in self._adjacency.get(nid, set()):
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        next_queue.append(neighbor)
            levels.append(level)
            queue = next_queue

        # Prüfe auf Zyklus
        processed = sum(len(l) for l in levels)
        if processed != len(self.nodes):
            raise ValueError("Cycle detected in task graph")

        return levels

    def compute_dyson_road(self) -> List[TaskNode]:
        """Minimum-Energy-Pfad: sortiert ready Nodes nach dynamischer Dyson-Road-Score."""
        ready = self.get_ready_nodes()
        ready.sort(key=lambda n: n.dyson_road_score, reverse=True)
        return ready

    def apply_constraint(self, source: str, target: str, constraint: str) -> None:
        """Fügt neue Constraint-Edge ein (Sprint 6: Failure→Constraint)."""
        self.add_edge(TaskEdge(source=source, target=target, constraint=constraint))

    def mark_done(self, node_id: str) -> None:
        if node_id not in self.nodes:
            raise KeyError(f"Node {node_id} not found")
        self.nodes[node_id].status = "done"

    def mark_blocked(self, node_id: str) -> None:
        if node_id not in self.nodes:
            raise KeyError(f"Node {node_id} not found")
        self.nodes[node_id].status = "blocked"

    def mark_running(self, node_id: str) -> None:
        if node_id not in self.nodes:
            raise KeyError(f"Node {node_id} not found")
        self.nodes[node_id].status = "running"

    def dyson_road_progress(self) -> float:
        """Anteil der abgeschlossenen Knoten (0.0–1.0)."""
        if not self.nodes:
            return 0.0
        done = sum(1 for n in self.nodes.values() if n.status == "done")
        return done / len(self.nodes)


def spec_to_task_graph(spec: str, sprint_id: str = "sprint-1") -> BuildManifest:
    """Parst einen Text-Spec in ein BuildManifest.

    Einfaches Pattern: Zeilen mit 'MODULE: name [depends: x,y] [risk: 0.x]'
    """
    manifest = BuildManifest(sprint_id=sprint_id, spec_summary=spec[:200])
    module_pattern = re.compile(
        r"MODULE:\s*(\w+)"                    # MODULE: name
        r"(?:\s+depends:\s*([\w,]+))?"        # depends: a,b
        r"(?:\s+risk:\s*([\d.]+))?"            # risk: 0.3
        r"(?:\s+role:\s*(\w+))?",              # role: architect
        re.IGNORECASE,
    )

    edge_pattern = re.compile(
        r"EDGE:\s*(\w+)\s*->\s*(\w+)\s*(?::\s*(.+))?"  # EDGE: a -> b : constraint
    )

    for line in spec.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        m = module_pattern.match(line)
        if m:
            nid = m.group(1).lower()
            deps_str = m.group(2)
            risk_str = m.group(3)
            role_str = m.group(4)

            node = TaskNode(
                id=nid,
                title=m.group(1),
                depends_on=[d.strip() for d in deps_str.split(",")] if deps_str else [],
                risk_score=float(risk_str) if risk_str else 0.3,
                role=role_str.lower() if role_str else "builder",
                status="pending",
                context_retention=0.8,
                progress_gain=0.6,
            )
            manifest.nodes[nid] = node
            continue

        e = edge_pattern.match(line)
        if e:
            src, tgt = e.group(1).lower(), e.group(2).lower()
            constraint = e.group(3) or ""
            manifest.edges.append(TaskEdge(source=src, target=tgt, constraint=constraint))

    # Auto-Edges aus depends_on generieren
    for nid, node in list(manifest.nodes.items()):
        for dep in node.depends_on:
            if dep in manifest.nodes:
                manifest.edges.append(TaskEdge(source=dep, target=nid))

    return manifest
