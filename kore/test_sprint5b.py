#!/usr/bin/env python3
"""Integration tests — Sprint 5b kore-exec execution layer."""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contract_registry import BuilderFailure, CodeDelta, FailureNote, TaskNode
from execution.adapter import ToolCall, ToolCallStatus
from execution.builder_session import BuilderSession, BuilderToolPlan
from execution.kore_exec_backend import KoreExecBackend, MockKoreExecBackend
from execution.router import select_backend
from orchestrator import DysonOrchestrator, DysonState
from role_engine import RoleEngine


def test_mock_read_write():
    with tempfile.TemporaryDirectory() as tmp:
        backend = MockKoreExecBackend(workspace_root=tmp)
        w = backend.execute(ToolCall(
            tool="write_file",
            args={"path": "a.py", "content": "print('kore')\n"},
            node_id="n1",
            workspace_root=tmp,
        ))
        assert w.status == ToolCallStatus.OK

        r = backend.execute(ToolCall(
            tool="read_file",
            args={"path": "a.py"},
            node_id="n1",
            workspace_root=tmp,
        ))
        assert r.status == ToolCallStatus.OK
        assert "kore" in r.output
    print("  [ok] mock backend: read/write")


def test_builder_session_code_delta():
    with tempfile.TemporaryDirectory() as tmp:
        node = TaskNode(id="b1", title="write out.py", role="builder")
        plan = BuilderSession.plan_from_node(node, tmp)
        session = BuilderSession(
            backend=MockKoreExecBackend(workspace_root=tmp),
            workspace_root=tmp,
        )
        result = session.run(node, plan)
        assert isinstance(result, CodeDelta)
        assert "out.py" in result.files_changed
    print("  [ok] builder_session: CodeDelta")


def test_builder_session_failure():
    with tempfile.TemporaryDirectory() as tmp:
        node = TaskNode(id="b2", title="noop", role="builder")
        plan = BuilderToolPlan(calls=[
            ToolCall(
                tool="read_file",
                args={"path": "missing.py"},
                node_id="b2",
                workspace_root=tmp,
            )
        ])
        session = BuilderSession(
            backend=MockKoreExecBackend(workspace_root=tmp),
            workspace_root=tmp,
        )
        from contract_registry import BuilderFailure
        result = session.run(node, plan)
        assert isinstance(result, BuilderFailure)
    print("  [ok] builder_session: FailureNote on missing file")


def test_router_defaults_mock():
    node = TaskNode(id="x", title="edit foo", role="builder", risk_score=0.2)
    backend = select_backend(node, use_mock=True)
    assert backend.name() == "kore-exec-mock"
    print("  [ok] router: default mock backend")


def test_orchestrator_execute_builder_node():
    with tempfile.TemporaryDirectory() as tmp:
        yaml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "routes", "kore-inner-circle-v1.yaml",
        )
        engine = RoleEngine.from_yaml(yaml_path)
        orch = DysonOrchestrator(engine, workspace_root=tmp)
        orch.start_sprint("MODULE: out role: builder")
        orch.execute_planning()
        node = orch.execute_next_node()
        assert node is not None
        assert node.role == "builder"
        node.title = "write out.py"

        delta = orch.execute_builder_node()
        assert delta is not None
        assert orch.current_sprint.state in (
            DysonState.NODE_TEST,
            DysonState.NODE_REVIEW,
        )
        exec_events = [
            e for e in orch.current_sprint.events
            if e.type.value == "kore.exec.backend"
        ]
        assert len(exec_events) >= 1
    print("  [ok] orchestrator: execute_builder_node + EXEC_BACKEND event")


def test_on_fatal_returns_failure_note():
    backend = MockKoreExecBackend()
    call = ToolCall(tool="x", args={}, node_id="n")
    from execution.adapter import ToolResult
    result = ToolResult(
        status=ToolCallStatus.FATAL,
        output="",
        exit_code=-1,
        duration_ms=0,
        error="crash",
    )
    note = backend.on_fatal(call, result)
    assert isinstance(note, FailureNote)
    assert note.node_id == "n"
    print("  [ok] on_fatal: returns FailureNote (no raise)")


def main():
    print("\nKORE Sprint 5b - Execution Layer\n")
    test_mock_read_write()
    test_builder_session_code_delta()
    test_builder_session_failure()
    test_router_defaults_mock()
    test_orchestrator_execute_builder_node()
    test_on_fatal_returns_failure_note()
    print("\nSprint 5b execution tests passed\n")


if __name__ == "__main__":
    main()
