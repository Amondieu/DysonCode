"""Sprint 5b — ExecutionAdapter Protocol: unified tool-call interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Protocol, runtime_checkable

from contract_registry import Constraint, FailureNote


class KoreExecFatalError(Exception):
    """Sprint 6 — fatal execution failure with typed constraint for recovery."""

    def __init__(self, constraint: Constraint, note: FailureNote) -> None:
        self.constraint = constraint
        self.note = note
        super().__init__(note.description or constraint.message)


class ToolCallStatus(str, Enum):
    OK = "ok"
    ERROR = "error"       # recoverable → HEALING
    TIMEOUT = "timeout"   # recoverable → HEALING
    FATAL = "fatal"       # infra crash → BLOCKED / HUMAN_GATE


@dataclass
class ToolCall:
    tool: str
    args: dict
    node_id: str
    role: str = "builder"
    workspace_root: str = "."


@dataclass
class ToolResult:
    status: ToolCallStatus
    output: str
    exit_code: int
    duration_ms: float
    error: Optional[str] = None
    backend: str = ""


@runtime_checkable
class ExecutionAdapter(Protocol):
    """Unified interface — KoreExecBackend and OpenHandsBackend implement this."""

    def execute(self, call: ToolCall) -> ToolResult: ...

    def health(self) -> bool: ...

    def name(self) -> str: ...

    def on_fatal(self, call: ToolCall, result: ToolResult) -> FailureNote: ...


def status_to_failure_class(status: ToolCallStatus) -> str:
    """Maps tool status to orchestrator recovery hint."""
    if status == ToolCallStatus.TIMEOUT:
        return "action_failure"
    if status == ToolCallStatus.FATAL:
        return "action_failure"
    return "tool_call_failure"
