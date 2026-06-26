"""Session → persistent: embedding recall via Grey-OS MemoryStack."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, List, Optional

from .graph import SessionSnapshot


@dataclass
class ArchivedSnapshot:
    id: str
    content: str
    sprint: str
    source_node_ids: List[str]


class PersistentStore:
    """Cold tier — Grey-OS SQLite when available, JSONL fallback."""

    def __init__(self, fallback_dir: Optional[Path] = None) -> None:
        self.fallback_dir = fallback_dir or Path.home() / ".jcode" / "kore-memory"
        self.fallback_dir.mkdir(parents=True, exist_ok=True)
        self._stack = None

    def _greyos_stack(self):
        if self._stack is not None:
            return self._stack
        grey_os = os.environ.get("GREYOS_ROOT")
        if not grey_os:
            candidate = Path(__file__).resolve().parents[3] / "Grey-OS"
            if candidate.is_dir():
                grey_os = str(candidate)
        if grey_os and grey_os not in sys.path:
            sys.path.insert(0, grey_os)
        try:
            from memory import MemoryStack  # type: ignore

            self._stack = MemoryStack()
            return self._stack
        except Exception:
            return None

    async def archive_snapshot(self, snap: SessionSnapshot, snap_id: Optional[str] = None) -> str:
        sid = snap_id or f"snap_{len(snap.source_node_ids)}_{hash(snap.content) & 0xFFFF:x}"
        stack = self._greyos_stack()
        if stack is not None:
            stack.store_semantic(
                fact_type="memory_snapshot",
                content={
                    "id": sid,
                    "content": snap.content,
                    "sprint": snap.sprint,
                    "source_node_ids": snap.source_node_ids,
                },
                domain="kore",
                confidence=0.9,
                provenance="memory_keeper",
            )
            return sid

        path = self.fallback_dir / "snapshots.jsonl"
        row = {
            "id": sid,
            "content": snap.content,
            "sprint": snap.sprint,
            "source_node_ids": snap.source_node_ids,
        }
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return sid

    async def recall(self, query: str, top_k: int = 5) -> List[ArchivedSnapshot]:
        stack = self._greyos_stack()
        if stack is not None:
            hits = stack.recall_semantic(query, top_k=top_k, fact_type="memory_snapshot", domain="kore")
            out: List[ArchivedSnapshot] = []
            for h in hits:
                c = h.get("content") or {}
                if isinstance(c, str):
                    try:
                        c = json.loads(c)
                    except json.JSONDecodeError:
                        c = {"content": c}
                out.append(
                    ArchivedSnapshot(
                        id=c.get("id", h.get("id", "")),
                        content=c.get("content", ""),
                        sprint=c.get("sprint", ""),
                        source_node_ids=c.get("source_node_ids", []),
                    )
                )
            return out

        path = self.fallback_dir / "snapshots.jsonl"
        if not path.is_file():
            return []
        q = query.lower()
        scored: list[tuple[float, ArchivedSnapshot]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            text = row.get("content", "").lower()
            score = sum(1 for w in q.split() if w in text)
            if score > 0:
                scored.append(
                    (
                        score,
                        ArchivedSnapshot(
                            id=row["id"],
                            content=row["content"],
                            sprint=row.get("sprint", ""),
                            source_node_ids=row.get("source_node_ids", []),
                        ),
                    )
                )
        scored.sort(key=lambda x: x[0], reverse=True)
        return [s for _, s in scored[:top_k]]

    async def archive_session_overflow(self, graph) -> int:
        """Move oldest session snapshots to persistent when session tier is full."""
        from .compressor import SESSION_SOFT_LIMIT

        if graph.session_count() < SESSION_SOFT_LIMIT:
            return 0
        overflow = graph.session_store[: graph.session_count() - SESSION_SOFT_LIMIT + 50]
        archived = 0
        for snap in overflow:
            await self.archive_snapshot(snap)
            graph.session_store.remove(snap)
            archived += 1
        return archived
