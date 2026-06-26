from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orchestrator import DysonOrchestrator
from contract_registry import CodeDelta
from role_engine import RoleEngine
from ui.mission_control import KOREMissionControl
from ui.renderer import RichLiveRenderer


def default_route_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "data",
        "routes",
        "kore-inner-circle-v1.yaml",
    )


def build_orchestrator(workspace_root: str = ".") -> DysonOrchestrator:
    engine = RoleEngine.from_yaml(default_route_path())
    return DysonOrchestrator(engine, workspace_root=workspace_root)


async def run_live_console(
    spec: str,
    *,
    workspace_root: str = ".",
    execute_next: bool = True,
    max_steps: int = 1,
    execute_builder: bool = False,
    renderer: Optional[Any] = None,
    stop_event: Optional[asyncio.Event] = None,
) -> dict[str, Any]:
    mc = KOREMissionControl(build_orchestrator(workspace_root))
    mc.wire_orchestrator_events()

    render_stop = stop_event or asyncio.Event()
    render_target = renderer or RichLiveRenderer()
    render_task = asyncio.create_task(mc.render_loop(render_target, stop_event=render_stop))
    try:
        mc.command("start_sprint", spec=spec)
        if execute_next:
            steps = 0
            while steps < max_steps:
                node_id = mc.command("next_node").get("node")
                if not node_id:
                    break
                steps += 1
                current = mc.orch.current_sprint.current_node if mc.orch.current_sprint else None
                if current is None:
                    break
                if execute_builder and current.role == "builder":
                    result = mc.orch.execute_builder_node(auto_recover=False)
                    if result is None:
                        break
                else:
                    mc.orch.complete_node(
                        CodeDelta(
                            node_id=current.id,
                            files_changed=[f"{current.id}.py"],
                            confidence=0.8,
                        )
                    )
                await asyncio.sleep(0)

        if stop_event is None:
            await asyncio.Future()
        else:
            await render_task
        return mc.get_state()
    finally:
        render_stop.set()
        if not render_task.done():
            render_task.cancel()
        await asyncio.gather(render_task, return_exceptions=True)


async def main_async(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Run KORE Mission Control in a terminal live view")
    parser.add_argument("spec", nargs="?", default="MODULE: api role: builder")
    parser.add_argument("--workspace-root", default=".")
    parser.add_argument("--no-next-node", action="store_true")
    parser.add_argument("--max-steps", type=int, default=1)
    parser.add_argument("--execute-builder", action="store_true")
    args = parser.parse_args(argv)

    await run_live_console(
        args.spec,
        workspace_root=args.workspace_root,
        execute_next=not args.no_next_node,
        max_steps=max(1, args.max_steps),
        execute_builder=args.execute_builder,
    )


def main(argv: Optional[list[str]] = None) -> int:
    try:
        asyncio.run(main_async(argv))
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())