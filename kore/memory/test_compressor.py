"""Tests for soft compression triggers and temperature eviction."""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1].parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kore.memory.compressor import (
    WORKING_HARD_LIMIT,
    CompressionAction,
    compress_trigger,
)
from kore.memory.graph import MemoryGraph, MemoryNode, NodeKind, NodeTemperature
from kore.memory.memory_keeper import MemoryKeeper


class StubLLM:
    async def complete(self, model, prompt, max_tokens=512, temperature=0.1):
        return "- decision: use KoreExecBackend\n- constraint: no self-dev"


def test_compress_trigger_soft():
    g = MemoryGraph()
    for i in range(WORKING_HARD_LIMIT - 5):
        g.add(MemoryNode(id=f"n{i}", content=f"turn {i}", kind=NodeKind.TURN))
    assert compress_trigger(g) == CompressionAction.SUMMARIZE_COLD


def test_compress_trigger_force():
    g = MemoryGraph()
    for i in range(WORKING_HARD_LIMIT + 5):
        g.add(MemoryNode(id=f"n{i}", content=f"turn {i}", kind=NodeKind.TURN))
    assert compress_trigger(g) == CompressionAction.FORCE_EVICT


def test_hot_node_not_evicted():
    g = MemoryGraph()
    hot = MemoryNode(id="active", content="current turn", active_path=True)
    g.add(hot)
    for i in range(WORKING_HARD_LIMIT + 5):
        g.add(MemoryNode(id=f"c{i}", content=f"cold {i}", kind=NodeKind.TURN))
    keeper = MemoryKeeper(StubLLM())
    snap = asyncio.run(keeper.evict_cold_nodes(g, force=True))
    assert snap is not None
    assert "active" in g.nodes
    assert g.nodes["active"].temperature == NodeTemperature.HOT


if __name__ == "__main__":
    test_compress_trigger_soft()
    test_compress_trigger_force()
    test_hot_node_not_evicted()
    print("kore/memory tests OK")
