"""Sprint 5b — KoreExecBackend: subprocess + JSON bridge to kore-exec Rust binary."""

from __future__ import annotations

import json
import shutil
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


class KoreExecBackend:
    """
    subprocess + JSON bridge to kore-exec Rust binary.
    Panic isolation: subprocess dies, Python catches exit code.
    """

    def __init__(
        self,
        binary_path: str = "kore-exec",
        timeout: float = 30.0,
        workspace_root: Optional[str] = None,
        constraint_store: Optional[Any] = None,
        raise_on_fatal: bool = False,
    ) -> None:
        self.binary = binary_path
        self.timeout = timeout
        self.workspace_root = workspace_root
        self.constraint_store = constraint_store
        self.raise_on_fatal = raise_on_fatal
        self._classifier = FailureClassifier()

    def name(self) -> str:
        return "kore-exec"

    def health(self) -> bool:
        return shutil.which(self.binary) is not None

    def execute(self, call: ToolCall) -> ToolResult:
        import subprocess

        workspace = call.workspace_root or self.workspace_root or "."
        payload = json.dumps({
            "version": PROTOCOL_VERSION,
            "tool": call.tool,
            "args": call.args,
            "workspace_root": workspace,
            "node_id": call.node_id,
            "role": call.role,
        })

        t0 = time.monotonic()
        try:
            proc = subprocess.run(
                [self.binary],
                input=payload,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            duration_ms = (time.monotonic() - t0) * 1000

            if proc.stdout and proc.stdout.strip():
                try:
                    data = json.loads(proc.stdout)
                    status_str = data.get("status", "error")
                    status = ToolCallStatus(status_str)
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
                except json.JSONDecodeError:
                    pass

            # No parseable JSON — treat as fatal (panic or crash)
            if proc.returncode != 0:
                return ToolResult(
                    status=ToolCallStatus.FATAL,
                    output=proc.stderr or "",
                    exit_code=proc.returncode,
                    duration_ms=duration_ms,
                    error=proc.stderr or f"kore-exec exited with code {proc.returncode}",
                    backend=self.name(),
                )

            return ToolResult(
                status=ToolCallStatus.OK,
                output=proc.stdout,
                exit_code=0,
                duration_ms=duration_ms,
                backend=self.name(),
            )

        except subprocess.TimeoutExpired:
            return ToolResult(
                status=ToolCallStatus.TIMEOUT,
                output="",
                exit_code=-1,
                duration_ms=self.timeout * 1000,
                error=f"kore-exec timeout after {self.timeout}s",
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

    def on_fatal(self, call: ToolCall, result: ToolResult) -> FailureNote:
        constraint, note = self._classifier.classify_tool_call(
            call, result.error or "kore-exec fatal error",
        )
        if self.constraint_store is not None:
            self.constraint_store.append(constraint)
        if self.raise_on_fatal:
            raise KoreExecFatalError(constraint=constraint, note=note)
        return note


class MockKoreExecBackend(KoreExecBackend):
    """In-process mock for tests without Rust binary."""

    def __init__(self, workspace_root: str = ".") -> None:
        super().__init__(binary_path="kore-exec", workspace_root=workspace_root)
        self._handlers = {
            "read_file": self._mock_read,
            "write_file": self._mock_write,
            "shell": self._mock_shell,
            "grep": self._mock_grep,
            "diff": self._mock_diff,
            "health": self._mock_health,
        }

    def health(self) -> bool:
        return True

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
                backend="kore-exec-mock",
            )
        return handler(call, t0)

    def name(self) -> str:
        return "kore-exec-mock"

    def _mock_read(self, call: ToolCall, t0: float) -> ToolResult:
        from pathlib import Path

        path = Path(call.workspace_root) / call.args.get("path", "")
        duration_ms = (time.monotonic() - t0) * 1000
        if not path.is_file():
            return ToolResult(
                status=ToolCallStatus.ERROR,
                output="",
                exit_code=1,
                duration_ms=duration_ms,
                error=f"File read failed: {path} — No such file or directory",
                backend=self.name(),
            )
        return ToolResult(
            status=ToolCallStatus.OK,
            output=path.read_text(encoding="utf-8"),
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )

    def _mock_write(self, call: ToolCall, t0: float) -> ToolResult:
        from pathlib import Path

        path = Path(call.workspace_root) / call.args.get("path", "")
        content = call.args.get("content", "")
        duration_ms = (time.monotonic() - t0) * 1000
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return ToolResult(
            status=ToolCallStatus.OK,
            output=f"wrote {len(content)} bytes",
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )

    def _mock_shell(self, call: ToolCall, t0: float) -> ToolResult:
        import subprocess

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
        proc = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=call.workspace_root,
            timeout=self.timeout,
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

    def _mock_grep(self, call: ToolCall, t0: float) -> ToolResult:
        import re
        from pathlib import Path

        pattern = call.args.get("pattern", "")
        root = Path(call.workspace_root)
        matches: list[str] = []
        for p in root.rglob(call.args.get("glob", "*")):
            if not p.is_file():
                continue
            try:
                for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
                    if re.search(pattern, line):
                        matches.append(f"{p}:{i}:{line}")
            except (OSError, UnicodeDecodeError):
                continue
        duration_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            status=ToolCallStatus.OK,
            output="\n".join(matches),
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )

    def _mock_diff(self, call: ToolCall, t0: float) -> ToolResult:
        import difflib

        a = call.args.get("a", "").splitlines()
        b = call.args.get("b", "").splitlines()
        diff = "\n".join(difflib.unified_diff(a, b, lineterm=""))
        duration_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            status=ToolCallStatus.OK,
            output=diff,
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )

    def _mock_health(self, call: ToolCall, t0: float) -> ToolResult:
        duration_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            status=ToolCallStatus.OK,
            output="ok",
            exit_code=0,
            duration_ms=duration_ms,
            backend=self.name(),
        )
