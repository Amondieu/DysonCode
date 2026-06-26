"""Sprint 8 — Event-Schema: AG-UI kompatible Event-Typen.

AG-UI Protocol-Standard: Event-basierte Kommunikation zwischen KORE-Kernel
und der Mission Control UI. Transport-agnostisch (SSE, WebSocket, HTTP).
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class KOREEventType(str, Enum):
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


@dataclass
class KOREEvent:
    """Ein KORE-Event im AG-UI-Format."""
    type: KOREEventType
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    source: str = "kore"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "data": self.data,
            "timestamp": self.timestamp,
            "source": self.source,
        }

    def to_sse(self) -> str:
        """SSE-formatierter Event-String."""
        import json
        return f"event: {self.type.value}\ndata: {json.dumps(self.to_dict())}\n\n"
