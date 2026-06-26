from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from ui.events import KOREEvent, KOREEventType


@dataclass
class RoadPanel:
    current_node: str = "-"
    node_state: str = "IDLE"
    total_nodes: int = 0
    completed_nodes: int = 0


@dataclass
class StreamPanel:
    entries: list[str] = field(default_factory=list)
    channels: dict[str, list[str]] = field(
        default_factory=lambda: {"role": [], "tool": [], "system": []}
    )
    max_entries: int = 20

    def append(self, entry: str, channel: str = "role") -> None:
        channel_key = channel if channel in self.channels else "system"
        self.entries.append(entry)
        self.channels[channel_key].append(entry)
        if len(self.entries) > self.max_entries:
            self.entries.pop(0)
        if len(self.channels[channel_key]) > self.max_entries:
            self.channels[channel_key].pop(0)


@dataclass
class ConstraintPanel:
    active_constraints: list[dict[str, Any]] = field(default_factory=list)
    last_failure_type: Optional[str] = None


@dataclass
class ScorePanel:
    total: float = 0.0
    pillars: dict[str, float] = field(default_factory=dict)
    hard_gates_pass: Optional[bool] = None
    outcome: Optional[str] = None


@dataclass
class BackendBadge:
    kind: str = "kore-exec"
    status: str = "IDLE"

    @property
    def color(self) -> str:
        colors = {
            "kore-exec": "green",
            "openhands": "blue",
            "kore-exec-mock": "yellow",
            "openhands-mock": "cyan",
        }
        if self.status.upper() == "DEGRADED":
            return "red"
        return colors.get(self.kind, "white")


@dataclass
class SelfCompletionGauge:
    completed: int = 0
    total_started: int = 0

    @property
    def rate(self) -> float:
        if self.total_started == 0:
            return 0.0
        return self.completed / self.total_started


@dataclass
class MissionControlState:
    road: RoadPanel = field(default_factory=RoadPanel)
    stream: StreamPanel = field(default_factory=StreamPanel)
    constraint: ConstraintPanel = field(default_factory=ConstraintPanel)
    score: ScorePanel = field(default_factory=ScorePanel)
    badge: BackendBadge = field(default_factory=BackendBadge)
    gauge: SelfCompletionGauge = field(default_factory=SelfCompletionGauge)

    def apply(self, event: KOREEvent) -> None:
        payload = event.data
        event_type = event.type

        if event_type == KOREEventType.SPRINT_STARTED:
            self.gauge.total_started += 1
            return

        if event_type == KOREEventType.STATE_CHANGE:
            self.road.node_state = payload.get("to", self.road.node_state)
            if payload.get("node_id"):
                self.road.current_node = payload["node_id"]
            if payload.get("node_count") is not None:
                self.road.total_nodes = int(payload["node_count"])
            return

        if event_type == KOREEventType.NODE_DONE:
            self.road.current_node = payload.get("node_id", self.road.current_node)
            self.road.node_state = payload.get("status", "done").upper()
            self.road.completed_nodes += 1
            return

        if event_type == KOREEventType.NODE_BLOCKED:
            self.road.current_node = payload.get("node_id", self.road.current_node)
            self.road.node_state = "BLOCKED"
            return

        if event_type == KOREEventType.ROAD_UPDATE:
            if payload.get("node_id"):
                self.road.current_node = payload["node_id"]
            if payload.get("total_nodes") is not None:
                self.road.total_nodes = int(payload["total_nodes"])
            if payload.get("completed_nodes") is not None:
                self.road.completed_nodes = int(payload["completed_nodes"])
            return

        if event_type == KOREEventType.EXEC_BACKEND:
            self.badge.kind = str(payload.get("kind") or payload.get("backend") or self.badge.kind)
            self.badge.status = str(payload.get("status", self.badge.status)).upper()
            return

        if event_type == KOREEventType.SCORE_UPDATE:
            self.score.total = float(payload.get("total", self.score.total))
            self.score.hard_gates_pass = payload.get("hard_gates_pass", self.score.hard_gates_pass)
            self.score.outcome = payload.get("outcome", self.score.outcome)
            pillars = payload.get("pillars")
            if isinstance(pillars, dict):
                self.score.pillars = {str(key): float(value) for key, value in pillars.items()}
            return

        if event_type == KOREEventType.CONSTRAINT_ADDED:
            self.constraint.active_constraints.append(dict(payload))
            self.constraint.last_failure_type = payload.get("type")
            return

        if event_type == KOREEventType.SPRINT_DONE:
            self.gauge.completed += 1
            self.score.outcome = payload.get("outcome", self.score.outcome)
            return

        if event_type == KOREEventType.ROLE_STREAM:
            role = payload.get("role", "unknown")
            message = str(payload.get("message") or payload.get("content") or "")
            channel = str(payload.get("channel") or "role")
            self.stream.append(f"[{role}] {message[:80]}", channel=channel)

    @property
    def self_completion_rate(self) -> float:
        return self.gauge.rate

    def snapshot(self) -> Dict[str, Any]:
        return {
            "road": {
                "current_node": self.road.current_node,
                "node_state": self.road.node_state,
                "total_nodes": self.road.total_nodes,
                "completed_nodes": self.road.completed_nodes,
            },
            "stream": {
                "entries": list(self.stream.entries),
                "channels": {
                    key: list(value) for key, value in self.stream.channels.items()
                },
            },
            "constraint": {
                "active_constraints": list(self.constraint.active_constraints),
                "last_failure_type": self.constraint.last_failure_type,
            },
            "score": {
                "total": self.score.total,
                "pillars": dict(self.score.pillars),
                "hard_gates_pass": self.score.hard_gates_pass,
                "outcome": self.score.outcome,
            },
            "badge": {
                "kind": self.badge.kind,
                "status": self.badge.status,
                "color": self.badge.color,
            },
            "self_completion_rate": self.self_completion_rate,
        }