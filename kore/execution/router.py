"""Sprint 7 — Backend routing: KoreExec vs OpenHands."""

from __future__ import annotations

from enum import Enum
from typing import Callable, Optional

from contract_registry import TaskNode
from execution.adapter import ExecutionAdapter
from execution.kore_exec_backend import KoreExecBackend, MockKoreExecBackend
from execution.openhands_backend import MockOpenHandsBackend, OpenHandsBackend

BackendFactory = Callable[[], ExecutionAdapter]

_SANDBOX_KEYWORDS = frozenset({
    "docker", "ci", "sandbox", "container", "e2e", "integration test",
    "swe-bench", "refactor",
})

_KORE_EXEC_KEYWORDS = frozenset({
    "grep", "read", "diff", "tight", "micro",
})


class BackendKind(str, Enum):
    KORE_EXEC = "kore-exec"
    OPENHANDS = "openhands"
    KORE_EXEC_MOCK = "kore-exec-mock"
    OPENHANDS_MOCK = "openhands-mock"


def select_backend(
    node: TaskNode,
    *,
    pii_detected: bool = False,
    pii_hold: bool = False,
    workspace_root: str = ".",
    use_mock: bool = False,
    force_kind: Optional[BackendKind] = None,
) -> ExecutionAdapter:
    """
    Routing-Regel Sprint 7:
    - PII / PII_HOLD → KoreExec (lokal)
    - docker/ci/sandbox/swe-bench → OpenHands
    - tight read/grep/diff → KoreExec
    - Default → KoreExec (lokale tight loops)
    """
    if pii_hold:
        pii_detected = True

    if force_kind == BackendKind.OPENHANDS_MOCK:
        return MockOpenHandsBackend(workspace_root=workspace_root)
    if force_kind == BackendKind.KORE_EXEC_MOCK:
        return MockKoreExecBackend(workspace_root=workspace_root)
    if force_kind == BackendKind.OPENHANDS:
        return OpenHandsBackend(workspace_root=workspace_root)
    if force_kind == BackendKind.KORE_EXEC:
        return KoreExecBackend(workspace_root=workspace_root)

    if use_mock:
        kind = _resolve_kind(node, pii_detected)
        if kind == BackendKind.OPENHANDS:
            return MockOpenHandsBackend(workspace_root=workspace_root)
        return MockKoreExecBackend(workspace_root=workspace_root)

    if pii_detected:
        return KoreExecBackend(workspace_root=workspace_root)

    kind = _resolve_kind(node, pii_detected=False)
    if kind == BackendKind.OPENHANDS:
        oh = OpenHandsBackend(workspace_root=workspace_root)
        if oh.health():
            return oh
        return MockOpenHandsBackend(workspace_root=workspace_root)

    kore = KoreExecBackend(workspace_root=workspace_root)
    if kore.health():
        return kore
    return MockKoreExecBackend(workspace_root=workspace_root)


def _resolve_kind(node: TaskNode, pii_detected: bool) -> BackendKind:
    if pii_detected:
        return BackendKind.KORE_EXEC

    title_lower = node.title.lower()

    if any(kw in title_lower for kw in _SANDBOX_KEYWORDS):
        return BackendKind.OPENHANDS
    if node.risk_score >= 0.7:
        return BackendKind.OPENHANDS
    if any(kw in title_lower for kw in _KORE_EXEC_KEYWORDS):
        return BackendKind.KORE_EXEC

    return BackendKind.KORE_EXEC
