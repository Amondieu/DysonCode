"""Working-memory graph with temperature semantics."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


class NodeTemperature(str, Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"


class NodeKind(str, Enum):
    TURN = "turn"
    DECISION = "decision"
    CONTRACT = "contract"
    FAILURE = "failure"
    CONSTRAINT = "constraint"
    OBSERVATION = "observation"
    DUPLICATE = "duplicate"


_KIND_TEMPERATURE: dict[NodeKind, NodeTemperature] = {
    NodeKind.TURN: NodeTemperature.COLD,
    NodeKind.OBSERVATION: NodeTemperature.COLD,
    NodeKind.DUPLICATE: NodeTemperature.COLD,
    NodeKind.DECISION: NodeTemperature.WARM,
    NodeKind.CONTRACT: NodeTemperature.WARM,
    NodeKind.FAILURE: NodeTemperature.WARM,
    NodeKind.CONSTRAINT: NodeTemperature.WARM,
}


@dataclass
class MemoryNode:
    id: str
    content: str
    kind: NodeKind = NodeKind.TURN
    temperature: NodeTemperature = NodeTemperature.COLD
    active_path: bool = False
    sprint: str = ""

    def __post_init__(self) -> None:
        if self.kind in _KIND_TEMPERATURE and self.temperature == NodeTemperature.COLD:
            if self.active_path:
                self.temperature = NodeTemperature.HOT
            else:
                self.temperature = _KIND_TEMPERATURE[self.kind]


@dataclass
class SessionSnapshot:
    content: str
    source_node_ids: List[str]
    sprint: str = ""


@dataclass
class MemoryGraph:
    """Hot working set — nodes evict downward, never hard-deleted from system."""

    nodes: Dict[str, MemoryNode] = field(default_factory=dict)
    session_store: List[SessionSnapshot] = field(default_factory=list)
    current_sprint: str = ""
    active_node_id: Optional[str] = None

    def add(self, node: MemoryNode) -> None:
        if self.active_node_id and node.id == self.active_node_id:
            node.temperature = NodeTemperature.HOT
            node.active_path = True
        self.nodes[node.id] = node

    def remove(self, node_id: str) -> None:
        self.nodes.pop(node_id, None)

    def mark_active(self, node_id: str) -> None:
        self.active_node_id = node_id
        if node_id in self.nodes:
            self.nodes[node_id].temperature = NodeTemperature.HOT
            self.nodes[node_id].active_path = True

    def cold_nodes(self) -> List[MemoryNode]:
        return [
            n
            for n in self.nodes.values()
            if n.temperature == NodeTemperature.COLD and not n.active_path
        ]

    def session_count(self) -> int:
        return len(self.session_store)
