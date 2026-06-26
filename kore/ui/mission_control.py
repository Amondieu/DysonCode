"""Sprint 8 — Mission Control: FastAPI SSE Server für Echtzeit-UI.

Bietet SSE-Endpunkte für die Dyson Mode UI und WebSocket-Commands
für Autonomy Controls (PAUSE/RESUME/ABORT).
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any, Dict, Optional

# FastAPI optional — nur importieren wenn verfügbar
try:
    from fastapi import FastAPI, Request
    from fastapi.responses import StreamingResponse, JSONResponse
    from pydantic import BaseModel
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False

# KORE-Importe
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ui.events import KOREEvent, KOREEventType
from ui.event_bus import EventBus
from orchestrator import DysonEvent, DysonEventType, DysonOrchestrator
from ui.panel_state import MissionControlState


class KOREMissionControl:
    """Fasst Orchestrator + EventBus für die UI zusammen."""

    def __init__(self, orchestrator: DysonOrchestrator) -> None:
        self.orch = orchestrator
        self.bus = EventBus()
        self.state = MissionControlState()

    def wire_orchestrator_events(self) -> None:
        """Verbindet Orchestrator-Events mit dem EventBus."""
        for event_type in DysonEventType:
            self.orch.on(event_type, self._forward_event)

    def _forward_event(self, event: DysonEvent) -> None:
        ui_event = KOREEvent(type=KOREEventType(event.type.value), data=event.data)
        self.state.apply(ui_event)
        asyncio.create_task(self.bus.publish(ui_event))

    async def event_stream(self) -> StreamingResponse:
        """SSE-Stream für alle KORE-Events."""
        queue = self.bus.subscribe()

        async def generate():
            try:
                while True:
                    event = await queue.get()
                    yield event.to_sse()
            except asyncio.CancelledError:
                pass
            finally:
                self.bus.unsubscribe(queue)

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-AG-UI-Version": "1.0",
            },
        )

    def get_state(self) -> Dict[str, Any]:
        return self.state.snapshot()

    def get_kernel_state(self) -> Dict[str, Any]:
        return self.orch.get_state()

    async def render_loop(self, renderer: Any, *, stop_event: Optional[asyncio.Event] = None) -> None:
        """Renders the mirrored mission-control state on every incoming event."""
        queue = self.bus.subscribe(maxsize=128)
        try:
            while True:
                if stop_event and stop_event.is_set():
                    break
                await queue.get()
                renderer.render(self.state)
        except asyncio.CancelledError:
            pass
        finally:
            self.bus.unsubscribe(queue)
            close = getattr(renderer, "close", None)
            if callable(close):
                close()

    def command(self, action: str, **kwargs) -> Dict[str, Any]:
        """Verarbeitet UI-Commands."""
        if action == "start_sprint":
            spec = kwargs.get("spec", "")
            sprint = self.orch.start_sprint(spec)
            self.orch.execute_planning()
            return {"status": "ok", "sprint_id": sprint.id}
        elif action == "next_node":
            node = self.orch.execute_next_node()
            return {"status": "ok", "node": node.id if node else None}
        elif action == "pause":
            self.orch.pause()
            return {"status": "ok", "autonomy": "paused"}
        elif action == "resume":
            self.orch.resume()
            return {"status": "ok", "autonomy": "full_auto"}
        elif action == "abort":
            self.orch.abort()
            return {"status": "ok", "state": "IDLE"}
        elif action == "get_state":
            return {"status": "ok", "state": self.get_state()}
        elif action == "get_kernel_state":
            return {"status": "ok", "state": self.get_kernel_state()}
        return {"status": "error", "message": f"Unknown action: {action}"}


def create_app(orchestrator: Optional[DysonOrchestrator] = None) -> "FastAPI":
    """Erstellt eine konfigurierte FastAPI-App.

    Usage:
        app = create_app(orchestrator)
        uvicorn.run(app, host="127.0.0.1", port=9876)
    """
    if not FASTAPI_AVAILABLE:
        raise ImportError("FastAPI is required: pip install fastapi uvicorn")

    from fastapi import FastAPI, Request
    from fastapi.responses import StreamingResponse, JSONResponse
    from pydantic import BaseModel

    app = FastAPI(title="KORE Mission Control", version="1.0.0")

    # Wenn kein Orchestrator übergeben, Dummy erstellen (für Standalone-Tests)
    mc = None
    if orchestrator:
        from role_engine import RoleEngine, RoutingMode, RoleConfig, RouteConfig
        config = RouteConfig(
            name="kore-mission-control",
            routing_mode=RoutingMode.HYBRID_LOCAL,
            roles={
                "architect": RoleConfig(local="coder"),
                "builder": RoleConfig(local="coder"),
                "critic": RoleConfig(local="forge-base"),
                "tester": RoleConfig(local="micro-coder"),
                "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
            }
        )
        engine = RoleEngine(config)
        if not orchestrator:
            from orchestrator import DysonOrchestrator
            orchestrator = DysonOrchestrator(role_engine=engine)
        mc = KOREMissionControl(orchestrator)
        mc.wire_orchestrator_events()

    class CommandRequest(BaseModel):
        action: str
        spec: Optional[str] = None

    @app.get("/kore/events")
    async def sse_events():
        if not mc:
            return JSONResponse({"error": "No orchestrator configured"}, status_code=500)
        return await mc.event_stream()

    @app.get("/kore/state")
    async def get_state():
        if not mc:
            return JSONResponse({"error": "No orchestrator configured"}, status_code=500)
        return JSONResponse(mc.get_state())

    @app.get("/kore/kernel-state")
    async def get_kernel_state():
        if not mc:
            return JSONResponse({"error": "No orchestrator configured"}, status_code=500)
        return JSONResponse(mc.get_kernel_state())

    @app.post("/kore/command")
    async def post_command(cmd: CommandRequest):
        if not mc:
            return JSONResponse({"error": "No orchestrator configured"}, status_code=500)
        result = mc.command(cmd.action, spec=cmd.spec)
        return JSONResponse(result)

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "kore-mission-control"}

    return app
