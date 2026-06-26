"""Sprint 7 — OpenHandsBackend: Builder/Sandbox execution via subprocess JSON.

HarnessEngine misst — OpenHandsBackend baut. Beide sprechen nur über den Orchestrator.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from typing import Any, Optional

from contract_registry import FailureNote
from execution.adapter import (
    KoreExecFatalError,
    ToolCall,
    ToolCallStatus,
    ToolResult,
)
from failure_classifier import FailureClassifier

PROTOCOL_VERSION = 1
OPENHANDS_TOOLS = frozenset({"write_file", "shell", "docker_build", "edit_file"})


class OpenHandsBackend:
    """
    subprocess JSON bridge to OpenHands Runtime CLI.
    Builder-Backend: editiert Dateien, führt Shell/Docker aus — kein pytest.
    """

    def __init__(
        self,
        cli_path: str = "openhands",
        timeout: float = 120.0,
        workspace_root: Optional[str] = None,
        constraint_store: Optional[Any] = None,
        raise_on_fatal: bool = False,
    ) -> None:
        self.cli = cli_path
        self.timeout = timeout
        self.workspace_root = workspace_root
        self.constraint_store = constraint_store
        self.raise_on_fatal = raise_on_fatal
        self._classifier = FailureClassifier()

    def name(self) -> str:
        return "openhands"

    def health(self) -> bool:
        return shutil.which(self.cli) is not None

    def execute(self, call: ToolCall) -> ToolResult:
        if call.tool not in OPENHANDS_TOOLS:
            return ToolResult(
                status=ToolCallStatus.ERROR,
                output="",
                exit_code=1,
                duration_ms=0.0,
                error=f"OpenHandsBackend does not handle tool: {call.tool}",
                backend=self.name(),
            )

        if not self.health():
            return ToolResult(
                status=ToolCallStatus.FATAL,
                output="",
                exit_code=-1,
                duration_ms=0.0,
                error="openhands CLI not found — pip install openhands",
                backend=self.name(),
            )

        workspace = call.workspace_root or self.workspace_root or "."
        payload = json.dumps({
            "version": PROTOCOL_VERSION,
            "backend": "openhands",
            "tool": call.tool,
            "args": call.args,
            "workspace_root": workspace,
            "node_id": call.node_id,
            "role": call.role,
        })

        t0 = time.monotonic()
        try:
            proc = subprocess.run(
                [self.cli, "exec", "--json"],
                input=payload,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=workspace,
            )
            duration_ms = (time.monotonic() - t0) * 1000
            return self._parse_response(proc, duration_ms)
        except subprocess.TimeoutExpired:
            return ToolResult(
                status=ToolCallStatus.TIMEOUT,
                output="",
                exit_code=-1,
                duration_ms=self.timeout * 1000,
                error=f"openhands timeout after {self.timeout}s",
                backend=self.name(),
            )
        except OSError as e:
            return ToolResult(
                status=ToolCallStatus.FATAL,
                output="",
                exit_code=-2,
                duration_ms=(time.monotonic() - t0) * 1000,
                error=str(e),
                backend=self.name(),
            )

    def _parse_response(self, proc: subprocess.CompletedProcess, duration_ms: float) -> ToolResult:
        if proc.stdout and proc.stdout.strip():
            try:
                data = json.loads(proc.stdout)
                status = ToolCallStatus(data.get("status", "error"))
                if proc.returncode != 0 and status == ToolCallStatus.OK:
                    status = ToolCallStatus.ERROR
                return ToolResult(
                    status=status,
                    output=data.get("output", ""),
                    exit_code=proc.returncode,
                    duration_ms=data.get("duration_ms", duration_ms),
                    error=data.get("error"),
                    backend=self.name(),
                )
            except (json.JSONDecodeError, ValueError):
                pass

        if proc.returncode != 0:
            return ToolResult(
                status=ToolCallStatus.FATAL,
                output=proc.stderr or "",
                exit_code=proc.returncode,
                duration_ms=duration_ms,
                error=proc.stderr or f"openhands exited {proc.returncode}",
                backend=self.name(),
            )

        return ToolResult(
            status=ToolCallStatus.OK,
            output=proc.stdout,
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )

    def on_fatal(self, call: ToolCall, result: ToolResult) -> FailureNote:
        constraint, note = self._classifier.classify_tool_call(
            call, result.error or "openhands fatal error",
        )
        if self.constraint_store is not None:
            self.constraint_store.append(constraint)
        if self.raise_on_fatal:
            raise KoreExecFatalError(constraint=constraint, note=note)
        return note


class MockOpenHandsBackend(OpenHandsBackend):
    """In-process OpenHands mock for CI without openhands package."""

    def __init__(self, workspace_root: str = ".") -> None:
        super().__init__(cli_path="openhands", workspace_root=workspace_root)
        self._handlers = {
            "write_file": self._mock_write,
            "edit_file": self._mock_write,
            "shell": self._mock_shell,
            "docker_build": self._mock_docker_build,
        }

    def health(self) -> bool:
        return True

    def name(self) -> str:
        return "openhands-mock"

    def execute(self, call: ToolCall) -> ToolResult:
        t0 = time.monotonic()
        handler = self._handlers.get(call.tool)
        if not handler:
            duration_ms = (time.monotonic() - t0) * 1000
            return ToolResult(
                status=ToolCallStatus.ERROR,
                output="",
                exit_code=1,
                duration_ms=duration_ms,
                error=f"Unknown tool: {call.tool}",
                backend=self.name(),
            )
        return handler(call, t0)

    def _mock_write(self, call: ToolCall, t0: float) -> ToolResult:
        from pathlib import Path

        path = Path(call.workspace_root) / call.args.get("path", "")
        content = call.args.get("content", "")
        duration_ms = (time.monotonic() - t0) * 1000
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return ToolResult(
            status=ToolCallStatus.OK,
            output=f"wrote {len(content)} bytes via openhands",
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )

    def _mock_shell(self, call: ToolCall, t0: float) -> ToolResult:
        import subprocess as sp

        cmd = call.args.get("command", "")
        duration_ms = (time.monotonic() - t0) * 1000
        if not cmd:
            return ToolResult(
                status=ToolCallStatus.ERROR,
                output="",
                exit_code=1,
                duration_ms=duration_ms,
                error="shell: missing command",
                backend=self.name(),
            )
        proc = sp.run(
            cmd, shell=True, capture_output=True, text=True,
            cwd=call.workspace_root, timeout=self.timeout,
        )
        duration_ms = (time.monotonic() - t0) * 1000
        status = ToolCallStatus.OK if proc.returncode == 0 else ToolCallStatus.ERROR
        return ToolResult(
            status=status,
            output=proc.stdout,
            exit_code=proc.returncode,
            duration_ms=duration_ms,
            error=proc.stderr if proc.returncode != 0 else None,
            backend=self.name(),
        )

    def _mock_docker_build(self, call: ToolCall, t0: float) -> ToolResult:
        from pathlib import Path

        tag = call.args.get("tag", "kore-build:latest")
        marker = Path(call.workspace_root) / ".docker_build_ok"
        marker.write_text(tag, encoding="utf-8")
        duration_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            status=ToolCallStatus.OK,
            output=f"docker build {tag} (mock)",
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )
