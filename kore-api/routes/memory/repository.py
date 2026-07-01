from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from memory_models import ConflictItem, MemoryEntry, RecallMatch, Scope


class MemoryRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def insert_entries(self, entries: Iterable[MemoryEntry]) -> list[str]:
        ids: list[str] = []
        query = text(
            """
            INSERT INTO memory_entries (
                memory_id,
                agent_id,
                tenant_id,
                project_id,
                repo_id,
                environment,
                type,
                subtype,
                status,
                knowledge_class,
                pattern_role,
                scope_level,
                scope_id,
                branch,
                pr_number,
                observed_at,
                recorded_at,
                effective_from,
                effective_to,
                trace_id,
                run_id,
                session_id,
                tags,
                payload
            ) VALUES (
                :memory_id,
                :agent_id,
                :tenant_id,
                :project_id,
                :repo_id,
                :environment,
                :type,
                :subtype,
                :status,
                :knowledge_class,
                :pattern_role,
                :scope_level,
                :scope_id,
                :branch,
                :pr_number,
                :observed_at,
                :recorded_at,
                :effective_from,
                :effective_to,
                :trace_id,
                :run_id,
                :session_id,
                :tags,
                CAST(:payload AS JSONB)
            )
            ON CONFLICT (memory_id) DO NOTHING
            RETURNING memory_id
            """
        )
        for entry in entries:
            params = {
                "memory_id": entry.memory_id,
                "agent_id": entry.agent_id,
                "tenant_id": entry.tenant_id,
                "project_id": entry.project_id,
                "repo_id": entry.repo_id,
                "environment": entry.environment.value,
                "type": entry.type.value,
                "subtype": entry.subtype,
                "status": entry.status.value,
                "knowledge_class": entry.knowledge_class.value,
                "pattern_role": entry.pattern_role.value,
                "scope_level": entry.scope.level.value,
                "scope_id": entry.scope.scope_id,
                "branch": entry.scope.branch,
                "pr_number": entry.scope.pr_number,
                "observed_at": entry.time.observed_at,
                "recorded_at": entry.time.recorded_at,
                "effective_from": entry.time.effective_from,
                "effective_to": entry.time.effective_to,
                "trace_id": entry.source.trace_id,
                "run_id": entry.source.run_id,
                "session_id": entry.source.session_id,
                "tags": entry.tags,
                "payload": entry.model_dump_json(),
            }
            result = await self.session.execute(query, params)
            inserted = result.scalar_one_or_none()
            if inserted:
                ids.append(inserted)
        await self.session.commit()
        return ids

    async def recall(
        self,
        *,
        agent_id: str,
        query_text: str,
        scope: Optional[Scope] = None,
        types: list[str] | None = None,
        knowledge_class: list[str] | None = None,
        tags: list[str] | None = None,
        limit: int = 12,
        as_of: Optional[datetime] = None,
    ) -> list[RecallMatch]:
        sql = [
            "SELECT payload FROM memory_entries WHERE agent_id = :agent_id",
            "AND status != 'expired'",
        ]
        params: dict[str, Any] = {"agent_id": agent_id, "limit": limit}

        if scope:
            sql.append("AND scope_level = :scope_level AND scope_id = :scope_id")
            params["scope_level"] = scope.level.value
            params["scope_id"] = scope.scope_id
            if scope.branch:
                sql.append("AND COALESCE(branch, '') = :branch")
                params["branch"] = scope.branch
            if scope.pr_number:
                sql.append("AND pr_number = :pr_number")
                params["pr_number"] = scope.pr_number

        if types:
            sql.append("AND type = ANY(:types)")
            params["types"] = types

        if knowledge_class:
            sql.append("AND knowledge_class = ANY(:knowledge_class)")
            params["knowledge_class"] = knowledge_class

        if tags:
            sql.append("AND tags && :tags")
            params["tags"] = tags

        if as_of:
            sql.append("AND effective_from <= :as_of AND (effective_to IS NULL OR effective_to >= :as_of)")
            params["as_of"] = as_of

        sql.append(
            "ORDER BY recorded_at DESC LIMIT :limit"
        )

        result = await self.session.execute(text("\n".join(sql)), params)
        rows = result.fetchall()

        matches: list[RecallMatch] = []
        for row in rows:
            memory = MemoryEntry.model_validate(row.payload)
            score = self._naive_score(memory, query_text, tags or [])
            matches.append(RecallMatch(memory=memory, score=score))

        matches.sort(key=lambda m: m.score, reverse=True)
        return matches[:limit]

    async def find_conflicts(
        self,
        *,
        agent_id: str,
        scope: Scope,
        types: list[str] | None = None,
    ) -> list[ConflictItem]:
        sql = [
            "SELECT payload FROM memory_entries",
            "WHERE agent_id = :agent_id AND scope_level = :scope_level AND scope_id = :scope_id",
            "AND status IN ('active', 'frozen')",
        ]
        params: dict[str, Any] = {
            "agent_id": agent_id,
            "scope_level": scope.level.value,
            "scope_id": scope.scope_id,
        }
        if types:
            sql.append("AND type = ANY(:types)")
            params["types"] = types

        result = await self.session.execute(text("\n".join(sql)), params)
        rows = [MemoryEntry.model_validate(r.payload) for r in result.fetchall()]

        conflicts: list[ConflictItem] = []
        for i, left in enumerate(rows):
            for right in rows[i + 1 :]:
                if left.type == right.type and left.subtype == right.subtype:
                    if left.title == right.title and left.content != right.content:
                        conflicts.append(
                            ConflictItem(
                                left_id=left.memory_id,
                                right_id=right.memory_id,
                                reason="same title and subtype, divergent content",
                                confidence=0.84,
                            )
                        )
        return conflicts

    def _naive_score(self, memory: MemoryEntry, query_text: str, query_tags: list[str]) -> float:
        score = 0.15
        content = f"{memory.title} {memory.content} {' '.join(memory.tags)}".lower()
        for token in query_text.lower().split():
            if token in content:
                score += 0.08
        overlap = len(set(query_tags).intersection(memory.tags))
        score += min(overlap * 0.1, 0.3)
        score += memory.confidence * 0.2
        return min(score, 0.99)
