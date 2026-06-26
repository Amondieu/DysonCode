#!/usr/bin/env python3
"""Sprint 6 — Failure→Constraint Injection Loop proof test."""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contract_registry import ConstraintType, TaskNode
from execution.adapter import ToolCall
from execution.builder_session import BuilderSession, BuilderToolPlan
from execution.kore_exec_backend import MockKoreExecBackend
from failure_classifier import FailureClassifier
from orchestrator import DysonOrchestrator, DysonState
from role_engine import RoleEngine


def test_classify_tool_call_missing_dep():
    clf = FailureClassifier()
    call = ToolCall(
        tool="read_file",
        args={"path": "deps/lib.py"},
        node_id="app",
        role="builder",
    )
    constraint, note = clf.classify_tool_call(
        call, "File read failed: deps/lib.py — No such file or directory",
    )
    assert constraint.type == ConstraintType.MISSING_DEP
    assert constraint.dependency == "deps/lib.py"
    assert constraint.blocked_path == "app"
    assert note.failure_class.value == "tool_call_failure"
    print("  [ok] classify_tool_call: MISSING_DEP")


def test_constraint_store_append_only():
    from constraint_store import ConstraintStore

    store = ConstraintStore()
    clf = FailureClassifier()
    call = ToolCall(tool="read_file", args={"path": "x.py"}, node_id="n1")
    c, _ = clf.classify_tool_call(call, "file not found")
    store.append(c)
    store.append(c)
    assert store.count() == 2
    assert store.by_type(ConstraintType.MISSING_DEP)
    print("  [ok] constraint_store: append-only")


def test_missing_dep_auto_recovery():
    """
    Done-Kriterium Sprint 6:
    Builder liest fehlende Dependency → MISSING_DEP → Replanner wählt Dep-Knoten.
    """
    with tempfile.TemporaryDirectory() as tmp:
        yaml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "routes", "kore-inner-circle-v1.yaml",
        )
        engine = RoleEngine.from_yaml(yaml_path)
        orch = DysonOrchestrator(engine, workspace_root=tmp)

        orch.start_sprint("MODULE: app role: builder")
        orch.execute_planning()
        node = orch.execute_next_node()
        assert node is not None
        assert node.id == "app"

        plan = BuilderToolPlan(calls=[
            ToolCall(
                tool="read_file",
                args={"path": "deps/lib.py"},
                node_id="app",
                role="builder",
                workspace_root=tmp,
            )
        ])

        recovered = orch.execute_builder_node(plan, auto_recover=True)

        assert orch.current_sprint.state == DysonState.EXECUTING
        assert recovered is not None
        assert isinstance(recovered, TaskNode)
        assert recovered.id.startswith("dep_")
        assert recovered.title == "write deps/lib.py"

        latest = orch.constraint_store.latest()
        assert latest is not None
        assert latest.type == ConstraintType.MISSING_DEP
        assert latest.dependency == "deps/lib.py"

        assert orch.current_sprint.current_node.id == recovered.id
        assert orch.current_sprint.task_graph.nodes["app"].status == "pending"

        print("  [ok] missing_dep_auto_recovery: HEALING -> dep node, no human gate")


def test_builder_session_returns_builder_failure():
    with tempfile.TemporaryDirectory() as tmp:
        node = TaskNode(id="b1", title="read dep", role="builder")
        plan = BuilderToolPlan(calls=[
            ToolCall(
                tool="read_file",
                args={"path": "missing.py"},
                node_id="b1",
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
        assert result.constraint.type == ConstraintType.MISSING_DEP
    print("  [ok] builder_session: BuilderFailure bundle")


def main():
    print("\nKORE Sprint 6 - Failure Constraint Loop\n")
    test_classify_tool_call_missing_dep()
    test_constraint_store_append_only()
    test_builder_session_returns_builder_failure()
    test_missing_dep_auto_recovery()
    print("\nSprint 6 proof test passed\n")


if __name__ == "__main__":
    main()
