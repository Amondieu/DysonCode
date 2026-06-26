#!/usr/bin/env python3
"""Sprint 8 — Mission Control event flow proof test."""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from orchestrator import DysonEventType, DysonOrchestrator
from role_engine import RoleEngine
from ui.live_console import run_live_console
from ui.events import KOREEventType
from ui.mission_control import KOREMissionControl
from ui.panel_state import MissionControlState


def _role_engine() -> RoleEngine:
    yaml_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "routes",
        "kore-inner-circle-v1.yaml",
    )
    return RoleEngine.from_yaml(yaml_path)


async def test_mission_control_event_sequence() -> None:
    orch = DysonOrchestrator(_role_engine(), workspace_root=".")
    mc = KOREMissionControl(orch)
    mc.wire_orchestrator_events()

    queue = mc.bus.subscribe(maxsize=32)
    state = MissionControlState()

    sprint = orch.start_sprint("MODULE: api role: builder")
    node = orch.execute_planning()
    selected = orch.execute_next_node()

    orch._emit(  # type: ignore[attr-defined]
        DysonEventType.EXEC_BACKEND,
        {
            "backend": "kore-exec",
            "kind": "kore-exec",
            "status": "running",
            "node_id": "B1",
        },
    )
    orch._emit(  # type: ignore[attr-defined]
        DysonEventType.CONSTRAINT_ADDED,
        {
            "type": "missing_dep",
            "blocked_path": "B1",
            "dependency": "deps/lib.py",
            "message": "create dependency",
            "source_tool": "write_file",
        },
    )
    orch._emit(  # type: ignore[attr-defined]
        DysonEventType.SCORE_UPDATE,
        {
            "total": 0.973,
            "pillars": {
                "build": 1.0,
                "tests": 1.0,
                "coverage": 0.85,
                "type_safety": 1.0,
                "architecture": 1.0,
                "ux_gate": 1.0,
                "llm_judge": 0.9,
            },
            "hard_gates_pass": True,
            "outcome": "sprint_done",
        },
    )
    orch._emit(  # type: ignore[attr-defined]
        DysonEventType.SPRINT_DONE,
        {"outcome": "sprint_done", "score": 0.973, "verdict": "done"},
    )

    await asyncio.sleep(0)

    received_types = []
    while not queue.empty():
        event = await queue.get()
        received_types.append(event.type)
        state.apply(event)

    assert KOREEventType.SPRINT_STARTED in received_types
    assert KOREEventType.EXEC_BACKEND in received_types
    assert KOREEventType.CONSTRAINT_ADDED in received_types
    assert KOREEventType.SCORE_UPDATE in received_types
    assert KOREEventType.SPRINT_DONE in received_types
    assert KOREEventType.ROLE_STREAM in received_types

    snapshot = state.snapshot()
    mirrored = mc.get_state()
    assert snapshot["badge"]["kind"] == "kore-exec"
    assert snapshot["badge"]["status"] == "RUNNING"
    assert snapshot["constraint"]["last_failure_type"] == "missing_dep"
    assert snapshot["score"]["total"] == 0.973
    assert snapshot["score"]["pillars"]["architecture"] == 1.0
    assert snapshot["score"]["hard_gates_pass"] is True
    assert snapshot["score"]["outcome"] == "sprint_done"
    assert snapshot["self_completion_rate"] == 1.0
    assert snapshot["stream"]["entries"]
    assert any("[architect]" in entry for entry in snapshot["stream"]["entries"])
    assert snapshot["stream"]["channels"]["role"]
    assert snapshot["stream"]["channels"]["system"]
    assert mirrored == snapshot
    assert sprint.id.startswith("sprint-")
    assert len(node.nodes) >= 1
    assert selected is not None


async def test_render_loop_renders_on_event() -> None:
    orch = DysonOrchestrator(_role_engine(), workspace_root=".")
    mc = KOREMissionControl(orch)
    mc.wire_orchestrator_events()

    stop_event = asyncio.Event()

    class FakeRenderer:
        def __init__(self) -> None:
            self.render_calls = 0
            self.closed = False
            self.last_snapshot = None

        def render(self, state: MissionControlState):
            self.render_calls += 1
            self.last_snapshot = state.snapshot()
            stop_event.set()

        def close(self) -> None:
            self.closed = True

    renderer = FakeRenderer()
    task = asyncio.create_task(mc.render_loop(renderer, stop_event=stop_event))

    orch.start_sprint("MODULE: api role: builder")
    await task

    assert renderer.render_calls == 1
    assert renderer.closed is True
    assert renderer.last_snapshot is not None
    assert renderer.last_snapshot["self_completion_rate"] == 0.0


async def test_live_console_startpoint_uses_event_rendering() -> None:
    stop_event = asyncio.Event()

    class FakeRenderer:
        def __init__(self) -> None:
            self.render_calls = 0
            self.closed = False

        def render(self, state: MissionControlState):
            self.render_calls += 1
            stop_event.set()
            return state.snapshot()

        def close(self) -> None:
            self.closed = True

    renderer = FakeRenderer()
    snapshot = await run_live_console(
        "MODULE: api role: builder",
        renderer=renderer,
        stop_event=stop_event,
        max_steps=2,
    )

    assert renderer.render_calls >= 1
    assert renderer.closed is True
    assert snapshot["stream"]["entries"]
    assert any("[architect]" in entry for entry in snapshot["stream"]["entries"])
    assert snapshot["road"]["completed_nodes"] >= 1


async def test_electron_bridge_emits_snapshots() -> None:
    import json
    import subprocess

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui", "electron_bridge.py"),
        "MODULE: auth\nMODULE: api depends: auth",
        "--workspace-root",
        ".",
        "--max-steps",
        "2",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    assert proc.returncode == 0, stderr.decode("utf-8")
    lines = [json.loads(line) for line in stdout.decode("utf-8").splitlines() if line.strip()]
    assert any(line.get("type") == "snapshot" for line in lines)
    assert lines[-1]["type"] == "complete"
    assert "channels" in lines[-1]["state"]["stream"]


def main() -> None:
    print("\nKORE Sprint 8 - Mission Control event flow\n")
    asyncio.run(test_mission_control_event_sequence())
    asyncio.run(test_render_loop_renders_on_event())
    asyncio.run(test_live_console_startpoint_uses_event_rendering())
    asyncio.run(test_electron_bridge_emits_snapshots())
    print("  [ok] mission control: event wiring + reducer + self completion rate")
    print("  [ok] mission control: render loop reacts to events")
    print("  [ok] mission control: live console startpoint renders from events")
    print("  [ok] mission control: electron bridge streams snapshots")
    print("\nSprint 8 proof test passed\n")


if __name__ == "__main__":
    main()