"""Soft compression triggers — eviction operator, not hard max_nodes."""

from __future__ import annotations

from enum import Enum

from .graph import MemoryGraph, NodeKind, NodeTemperature

WORKING_SOFT_LIMIT = 40
WORKING_HARD_LIMIT = 60
SESSION_SOFT_LIMIT = 300


class CompressionAction(str, Enum):
    NONE = "none"
    SUMMARIZE_COLD = "summarize_cold"
    FORCE_EVICT = "force_evict"
    ARCHIVE_SESSION = "archive_session"


def compress_trigger(graph: MemoryGraph) -> CompressionAction:
    n = len(graph.nodes)
    if n < WORKING_SOFT_LIMIT and graph.session_count() < SESSION_SOFT_LIMIT:
        return CompressionAction.NONE
    if graph.session_count() >= SESSION_SOFT_LIMIT:
        return CompressionAction.ARCHIVE_SESSION
    if n < WORKING_HARD_LIMIT:
        return CompressionAction.SUMMARIZE_COLD
    return CompressionAction.FORCE_EVICT


def eviction_priority(node_kind: NodeKind, temperature: NodeTemperature, active_path: bool) -> int:
    """Lower = evict first. Hot active path never selected (filtered before sort)."""
    if active_path or temperature == NodeTemperature.HOT:
        return 10_000
    if temperature == NodeTemperature.WARM:
        return 100
    if node_kind == NodeKind.DUPLICATE:
        return 0
    if node_kind == NodeKind.TURN:
        return 10
    if node_kind == NodeKind.OBSERVATION:
        return 20
    return 50
