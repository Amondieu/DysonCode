#!/usr/bin/env python3
"""Sprint 7 — OpenHands build + Harness measure + DoneGate proof test."""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contract_registry import CodeDelta, DoneVerdict, TaskNode
from done_gate import DoneGate, SprintOutcome
from execution.adapter import ToolCall
from execution.builder_session import BuilderSession, BuilderToolPlan
from execution.openhands_backend import MockOpenHandsBackend
from execution.router import BackendKind, select_backend
from harness_engine import HarnessEngine
from orchestrator import DysonOrchestrator, DysonState
from role_engine import RoleEngine


def _write_project(root: str) -> None:
    """Minimal Python project with passing pytest."""
    os.makedirs(os.path.join(root, "app"), exist_ok=True)
    os.makedirs(os.path.join(root, "tests"), exist_ok=True)
    with open(os.path.join(root, "app", "__init__.py"), "w", encoding="utf-8") as f:
        f.write("")
    with open(os.path.join(root, "tests", "__init__.py"), "w", encoding="utf-8") as f:
        f.write("")
    with open(os.path.join(root, "tests", "test_app.py"), "w", encoding="utf-8") as f:
        f.write(
            "def test_placeholder():\n"
            "    assert True\n"
        )


def test_router_openhands_for_docker():
    node = TaskNode(
        id="api", title="docker build api module", role="builder", risk_score=0.5,
    )
    backend = select_backend(node, workspace_root=".", use_mock=True)
    assert backend.name() == "openhands-mock"
    print("  [ok] router: docker keyword -> openhands-mock")


def test_openhands_mock_write():
    with tempfile.TemporaryDirectory() as tmp:
        oh = MockOpenHandsBackend(workspace_root=tmp)
        result = oh.execute(ToolCall(
            tool="write_file",
            args={"path": "app/module.py", "content": "VALUE = 42\n"},
            node_id="api",
            workspace_root=tmp,
        ))
        assert result.status.value == "ok"
        assert os.path.isfile(os.path.join(tmp, "app", "module.py"))
    print("  [ok] openhands mock: write_file")


def test_harness_scores_project():
    with tempfile.TemporaryDirectory() as tmp:
        _write_project(tmp)
        oh = MockOpenHandsBackend(workspace_root=tmp)
        oh.execute(ToolCall(
            tool="write_file",
            args={"path": "app/module.py", "content": "VALUE = 42\n"},
            node_id="api",
            workspace_root=tmp,
        ))
        harness = HarnessEngine(tmp)
        score = harness.run_all()
        assert harness.hard_gates_pass()
        assert score.total() >= 0.75
    print(f"  [ok] harness: hard gates pass, total={score.total():.3f}")


def test_done_gate_sprint_done():
    with tempfile.TemporaryDirectory() as tmp:
        _write_project(tmp)
        harness = HarnessEngine(tmp)
        score = harness.run_all()
        gate = DoneGate()
        outcome = gate.evaluate_sprint(score)
        assert outcome == SprintOutcome.SPRINT_DONE
        assert gate.to_done_verdict(outcome) == DoneVerdict.DONE
    print("  [ok] done_gate: SPRINT_DONE at >= 0.75")


def test_sprint7_end_to_end():
    """
    Done-Kriterium Sprint 7:
    OpenHandsBackend baut → HarnessEngine misst → DoneGate SPRINT_DONE.
    """
    with tempfile.TemporaryDirectory() as tmp:
        _write_project(tmp)

        yaml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "routes", "kore-inner-circle-v1.yaml",
        )
        engine = RoleEngine.from_yaml(yaml_path)
        orch = DysonOrchestrator(engine, workspace_root=tmp)

        orch.start_sprint("MODULE: api role: builder")
        orch.execute_planning()
        node = orch.execute_next_node()
        assert node is not None
        node.title = "docker build api module"

        oh_backend = select_backend(
            node, workspace_root=tmp, force_kind=BackendKind.OPENHANDS_MOCK,
        )
        plan = BuilderToolPlan(calls=[
            ToolCall(
                tool="write_file",
                args={"path": "app/module.py", "content": "VALUE = 42\n"},
                node_id=node.id,
                role="builder",
                workspace_root=tmp,
            )
        ])

        delta = orch.execute_builder_node(plan, backend=oh_backend, auto_recover=False)
        assert isinstance(delta, CodeDelta)
        assert "app/module.py" in delta.files_changed

        exec_events = [
            e for e in orch.current_sprint.events
            if e.type.value == "kore.exec.backend"
        ]
        assert exec_events[-1].data["backend"] == "openhands-mock"

        verdict = orch.run_harness_and_finalize()
        assert verdict == DoneVerdict.DONE
        assert orch.current_sprint.state == DysonState.SPRINT_DONE
        assert orch.current_sprint.harness_score.total() >= 0.75

    print("  [ok] sprint7 e2e: openhands build -> harness -> SPRINT_DONE")


def main():
    print("\nKORE Sprint 7 - OpenHands + Harness + DoneGate\n")
    test_router_openhands_for_docker()
    test_openhands_mock_write()
    test_harness_scores_project()
    test_done_gate_sprint_done()
    test_sprint7_end_to_end()
    print("\nSprint 7 proof test passed\n")


if __name__ == "__main__":
    main()
