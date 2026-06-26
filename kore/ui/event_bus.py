from __future__ import annotations

import asyncio
from collections import defaultdict
from enum import Enum
from typing import DefaultDict, Optional

from ui.events import KOREEvent, KOREEventType


class EventBus:
    """Queue-backed event bus with per-type subscriptions and bounded fan-out."""

    def __init__(self) -> None:
        self._all_queues: list[asyncio.Queue] = []
        self._typed_queues: DefaultDict[str, list[asyncio.Queue]] = defaultdict(list)

    def subscribe(
        self,
        event_type: Optional[KOREEventType | str] = None,
        *,
        maxsize: int = 100,
    ) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        key = self._normalize_key(event_type)
        if key is None:
            self._all_queues.append(queue)
        else:
            self._typed_queues[key].append(queue)
        return queue

    def unsubscribe(
        self,
        queue: asyncio.Queue,
        event_type: Optional[KOREEventType | str] = None,
    ) -> None:
        key = self._normalize_key(event_type)
        if key is None:
            if queue in self._all_queues:
                self._all_queues.remove(queue)
            return
        queues = self._typed_queues.get(key)
        if queues and queue in queues:
            queues.remove(queue)
            if not queues:
                self._typed_queues.pop(key, None)

    async def publish(self, event: KOREEvent) -> None:
        key = self._normalize_key(event.type)
        queues = list(self._all_queues)
        if key is not None:
            queues.extend(self._typed_queues.get(key, ()))
        for queue in queues:
            self._offer(queue, event)

    @staticmethod
    def _normalize_key(event_type: Optional[KOREEventType | str | Enum]) -> Optional[str]:
        if event_type is None:
            return None
        if isinstance(event_type, Enum):
            return str(event_type.value)
        return str(event_type)

    @staticmethod
    def _offer(queue: asyncio.Queue, event: KOREEvent) -> None:
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass