from __future__ import annotations

from typing import Any, Dict

from ui.panel_state import MissionControlState


def render_payload(state: MissionControlState) -> Dict[str, Any]:
    return state.snapshot()


class RichRenderer:
    def render(self, state: MissionControlState):
        try:
            from rich.console import Group
            from rich.panel import Panel
            from rich.table import Table
        except ImportError as exc:
            raise ImportError("rich is required for RichRenderer") from exc

        road = Table(title="Road")
        road.add_column("Current Node")
        road.add_column("State")
        road.add_column("Progress")
        road.add_row(
            state.road.current_node,
            state.road.node_state,
            f"{state.road.completed_nodes}/{state.road.total_nodes}",
        )

        score = Table(title="Score")
        score.add_column("Metric")
        score.add_column("Value")
        score.add_row("total", f"{state.score.total:.3f}")
        score.add_row("hard_gates_pass", str(state.score.hard_gates_pass))
        score.add_row("outcome", str(state.score.outcome))
        score.add_row("self_completion_rate", f"{state.self_completion_rate:.2%}")
        for pillar, value in sorted(state.score.pillars.items()):
            score.add_row(pillar, f"{value:.3f}")

        constraints = Table(title="Constraints")
        constraints.add_column("Type")
        constraints.add_column("Dependency")
        if state.constraint.active_constraints:
            for item in state.constraint.active_constraints[-5:]:
                constraints.add_row(
                    str(item.get("type", "-")),
                    str(item.get("dependency", "-")),
                )
        else:
            constraints.add_row("-", "-")

        stream = Table(title="Stream")
        stream.add_column("Entries")
        if state.stream.entries:
            for entry in state.stream.entries[-5:]:
                stream.add_row(entry)
        else:
            stream.add_row("-")

        return Group(
            Panel(road),
            Panel(score),
            Panel(constraints),
            Panel(stream),
        )


class RichLiveRenderer:
    def __init__(self, *, refresh_per_second: float = 4.0) -> None:
        self.refresh_per_second = refresh_per_second
        self._live = None
        self._base = RichRenderer()

    def render(self, state: MissionControlState):
        renderable = self._base.render(state)
        if self._live is None:
            try:
                from rich.live import Live
            except ImportError as exc:
                raise ImportError("rich is required for RichLiveRenderer") from exc
            self._live = Live(renderable, refresh_per_second=self.refresh_per_second)
            self._live.start()
        else:
            self._live.update(renderable, refresh=True)
        return renderable

    def close(self) -> None:
        if self._live is not None:
            self._live.stop()
            self._live = None