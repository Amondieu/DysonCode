from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ui.live_console import build_orchestrator
from ui.mission_control import KOREMissionControl
from ui.renderer import render_payload
from contract_registry import CodeDelta


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), flush=True)


async def drain_snapshots(queue: asyncio.Queue, mc: KOREMissionControl) -> None:
    await asyncio.sleep(0)
    while not queue.empty():
        event = await queue.get()
        emit(
            {
                "type": "snapshot",
                "event": event.to_dict(),
                "state": render_payload(mc.state),
                "kernel_state": mc.get_kernel_state(),
            }
        )


async def run_bridge(
    spec: str,
    *,
    workspace_root: str,
    max_steps: int,
    execute_builder: bool,
) -> int:
    mc = KOREMissionControl(build_orchestrator(workspace_root))
    mc.wire_orchestrator_events()
    queue = mc.bus.subscribe(maxsize=256)
    try:
        mc.command("start_sprint", spec=spec)
        await drain_snapshots(queue, mc)

        steps = 0
        while steps < max_steps:
            node_id = mc.command("next_node").get("node")
            await drain_snapshots(queue, mc)
            if not node_id:
                break

            current = mc.orch.current_sprint.current_node if mc.orch.current_sprint else None
            if current is None:
                break

            if current.role == "builder":
                result = mc.orch.execute_builder_node(auto_recover=False)
                if result is None:
                    await drain_snapshots(queue, mc)
                    break
            else:
                mc.orch.complete_node(
                    CodeDelta(
                        node_id=current.id,
                        files_changed=[],
                        confidence=0.8,
                    )
                )
            steps += 1
            await drain_snapshots(queue, mc)

        emit(
            {
                "type": "complete",
                "state": render_payload(mc.state),
                "kernel_state": mc.get_kernel_state(),
            }
        )
        return 0
    finally:
        mc.bus.unsubscribe(queue)


async def main_async(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bridge KORE mission control snapshots to Electron")
    parser.add_argument("spec")
    parser.add_argument("--workspace-root", default=".")
    parser.add_argument("--max-steps", type=int, default=2)
    parser.add_argument("--execute-builder", action="store_true")
    args = parser.parse_args(argv)

    try:
        return await run_bridge(
            args.spec,
            workspace_root=args.workspace_root,
            max_steps=max(1, args.max_steps),
            execute_builder=args.execute_builder,
        )
    except Exception as exc:
        emit({"type": "error", "message": str(exc)})
        return 1


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(main_async(argv))


if __name__ == "__main__":
    raise SystemExit(main())