"""Memory Keeper — fast-draft compression of cold working nodes."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import List, Protocol

from kore.contract_registry import MemorySnapshot
from .compressor import CompressionAction, compress_trigger, eviction_priority
from .graph import MemoryGraph, MemoryNode, SessionSnapshot

COMPRESS_PROMPT = """Compress the following memory nodes into a single dense snapshot.
Preserve: decisions, constraints, interface contracts, failure patterns.
Drop: intermediate reasoning, redundant observations, verbose outputs.
Format: bullet list, max 10 items, each <20 words.

NODES:
{nodes}
"""


class LLMClient(Protocol):
    async def complete(
        self,
        model: str,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.1,
    ) -> str: ...


@dataclass
class LiteLLMClient:
    """Grey-OS LiteLLM proxy — fast-draft SET-D, local only."""

    base_url: str = "http://127.0.0.1:4000/v1"
    api_key: str = "grey-os-local"
    timeout: float = 120.0

    async def complete(
        self,
        model: str,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.1,
    ) -> str:
        import asyncio

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url.rstrip('/')}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        def _post() -> str:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]

        return await asyncio.to_thread(_post)


class MemoryKeeper:
    def __init__(self, llm: LLMClient, model: str = "fast-draft") -> None:
        self.llm = llm
        self.model = model

    async def maybe_compress(self, graph: MemoryGraph) -> MemorySnapshot | None:
        action = compress_trigger(graph)
        if action == CompressionAction.NONE:
            return None
        if action == CompressionAction.ARCHIVE_SESSION:
            return None
        return await self.evict_cold_nodes(graph, force=action == CompressionAction.FORCE_EVICT)

    async def evict_cold_nodes(self, graph: MemoryGraph, force: bool = False) -> MemorySnapshot | None:
        cold = graph.cold_nodes()
        if not cold and not force:
            return None

        if force and not cold:
            candidates = [
                n
                for n in graph.nodes.values()
                if not n.active_path and n.temperature != NodeTemperature.HOT
            ]
            cold = sorted(
                candidates,
                key=lambda n: eviction_priority(n.kind, n.temperature, n.active_path),
            )[: max(1, len(graph.nodes) - 30)]

        if not cold:
            return None

        nodes_text = "\n".join(f"- [{n.kind.value}] {n.content[:500]}" for n in cold)
        snapshot_text = await self.llm.complete(
            model=self.model,
            prompt=COMPRESS_PROMPT.format(nodes=nodes_text),
            max_tokens=512,
            temperature=0.1,
        )

        snap = SessionSnapshot(
            content=snapshot_text,
            source_node_ids=[n.id for n in cold],
            sprint=graph.current_sprint,
        )
        graph.session_store.append(snap)

        for n in cold:
            graph.remove(n.id)

        return MemorySnapshot(
            session_id=graph.current_sprint or "working",
            sprint_id=graph.current_sprint,
            compressed_state=snapshot_text,
            patterns_added=len(cold),
        )
