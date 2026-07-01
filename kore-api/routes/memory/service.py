from __future__ import annotations

from datetime import datetime

from memory_models import (
    ConflictRequest,
    ConflictResponse,
    MemoryEntry,
    RecallAsOfRequest,
    RecallRequest,
    RecallResponse,
    RememberRequest,
    RememberResponse,
)
from memory_repository import MemoryRepository


class MemoryService:
    def __init__(self, repository: MemoryRepository):
        self.repository = repository

    async def remember(self, payload: RememberRequest) -> RememberResponse:
        self._validate_agent_consistency(payload)
        self._validate_certification_rules(payload.entries)
        ids = await self.repository.insert_entries(payload.entries)
        return RememberResponse(stored=len(ids), ids=ids)

    async def recall(self, payload: RecallRequest) -> RecallResponse:
        matches = await self.repository.recall(
            agent_id=payload.agent_id,
            query_text=payload.query,
            scope=payload.scope,
            types=[t.value for t in payload.types] if payload.types else None,
            knowledge_class=[k.value for k in payload.knowledge_class] if payload.knowledge_class else None,
            tags=payload.tags,
            limit=payload.limit,
        )
        return RecallResponse(count=len(matches), matches=matches)

    async def recall_as_of(self, payload: RecallAsOfRequest) -> RecallResponse:
        matches = await self.repository.recall(
            agent_id=payload.agent_id,
            query_text=payload.query,
            scope=payload.scope,
            types=[t.value for t in payload.types] if payload.types else None,
            knowledge_class=[k.value for k in payload.knowledge_class] if payload.knowledge_class else None,
            tags=payload.tags,
            limit=payload.limit,
            as_of=payload.as_of,
        )
        return RecallResponse(count=len(matches), matches=matches)

    async def conflicts(self, payload: ConflictRequest) -> ConflictResponse:
        conflicts = await self.repository.find_conflicts(
            agent_id=payload.agent_id,
            scope=payload.scope,
            types=[t.value for t in payload.types] if payload.types else None,
        )
        return ConflictResponse(count=len(conflicts), conflicts=conflicts)

    def _validate_agent_consistency(self, payload: RememberRequest) -> None:
        mismatched = [entry.memory_id for entry in payload.entries if entry.agent_id != payload.agent_id]
        if mismatched:
            raise ValueError(f"entry.agent_id must match request agent_id: {mismatched}")

    def _validate_certification_rules(self, entries: list[MemoryEntry]) -> None:
        for entry in entries:
            if entry.type.value == "artifact" and entry.subtype == "release_cert":
                if not entry.certification:
                    raise ValueError(f"release_cert {entry.memory_id} missing certification block")
                if not entry.source.trace_id or not entry.source.run_id:
                    raise ValueError(f"release_cert {entry.memory_id} missing trace_id or run_id")
                if entry.certification.verdict.value != "DONE":
                    raise ValueError(f"release_cert {entry.memory_id} may only be created for DONE verdict")
