"""Sprint 7 — Done Gate: HarnessScore → Sprint-Verdict.

HarnessEngine misst; DoneGate urteilt. Kein Builder-Code hier.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from contract_registry import DoneVerdict, HarnessScore


class SprintOutcome(str, Enum):
    """Orchestrator-facing Sprint-7 Ergebnis."""
    SPRINT_DONE = "sprint_done"
    BLOCKED = "blocked"
    ADVISORY = "advisory"       # hard gates pass, score 0.70–0.74


class DoneGate:
    """Fertigkeits-Prüfung mit Score-Drift-Tracking."""

    SPRINT_DONE_THRESHOLD = 0.75
    ADVISORY_THRESHOLD = 0.70
    FULL_DONE_THRESHOLD = 0.90

    def __init__(self, history_path: Optional[str] = None):
        self.history: List[Dict[str, Any]] = []
        self.history_path = Path(history_path) if history_path else None

    def evaluate(self, score: HarnessScore, sprint_id: str = "") -> DoneVerdict:
        """Legacy 4-State-Verdict."""
        verdict = score.verdict()
        self._record(score, sprint_id, verdict.value)
        return verdict

    def evaluate_sprint(
        self,
        score: HarnessScore,
        sprint_id: str = "",
    ) -> SprintOutcome:
        """
        Sprint-7 Done-Kriterium:
        - Hard Gates (build + tests) müssen 1.0 sein
        - total >= 0.75 → SPRINT_DONE
        - total 0.70–0.74 → ADVISORY (Partial)
        - sonst BLOCKED
        """
        hard_pass = score.build >= 1.0 and score.tests >= 1.0
        total = score.total()

        if not hard_pass:
            outcome = SprintOutcome.BLOCKED
        elif total >= self.SPRINT_DONE_THRESHOLD:
            outcome = SprintOutcome.SPRINT_DONE
        elif total >= self.ADVISORY_THRESHOLD:
            outcome = SprintOutcome.ADVISORY
        else:
            outcome = SprintOutcome.BLOCKED

        verdict_map = {
            SprintOutcome.SPRINT_DONE: DoneVerdict.DONE,
            SprintOutcome.ADVISORY: DoneVerdict.PARTIAL,
            SprintOutcome.BLOCKED: DoneVerdict.BLOCKED,
        }
        self._record(score, sprint_id, outcome.value, verdict_map[outcome].value)
        return outcome

    def to_done_verdict(self, outcome: SprintOutcome) -> DoneVerdict:
        if outcome == SprintOutcome.SPRINT_DONE:
            return DoneVerdict.DONE
        if outcome == SprintOutcome.ADVISORY:
            return DoneVerdict.PARTIAL
        return DoneVerdict.BLOCKED

    def detect_drift(self, threshold: float = 0.05) -> Optional[str]:
        if len(self.history) < 2:
            return None
        last = self.history[-1]["score"]["total"]
        prev = self.history[-2]["score"]["total"]
        diff = last - prev
        if abs(diff) > threshold:
            direction = "improved" if diff > 0 else "regressed"
            return f"Score {direction} by {abs(diff):.3f} ({prev:.3f} -> {last:.3f})"
        return None

    def last_verdict(self) -> Optional[DoneVerdict]:
        if not self.history:
            return None
        v = self.history[-1].get("done_verdict")
        return DoneVerdict(v) if v else None

    def get_history(self) -> List[Dict[str, Any]]:
        return list(self.history)

    # ── RC Metadata Consumption (jcode Layer 3 Bridge) ───────────────────

    def evaluate_with_rc(
        self,
        score: HarnessScore,
        rc_total: int,
        sprint_id: str = "",
    ) -> SprintOutcome:
        """Evaluate sprint outcome with Ratchet Condition metadata.

        Extends evaluate_sprint() by incorporating the jcode ratchet score
        as an additional quality signal. High RC scores can lift advisory
        outcomes to DONE; low RC scores can downgrade.

        Args:
            score: HarnessScore from harness_engine.
            rc_total: Ratchet score total (0–7) from ratchet_scorer.
            sprint_id: Sprint identifier for history tracking.

        Returns:
            SprintOutcome with RC-adjusted verdict.
        """
        base_outcome = self.evaluate_sprint(score, sprint_id)

        # RC ≥ 7: maximum quality — can lift ADVISORY → SPRINT_DONE
        if rc_total >= 7 and base_outcome == SprintOutcome.ADVISORY:
            if score.total() >= self.SPRINT_DONE_THRESHOLD - 0.05:
                outcome = SprintOutcome.SPRINT_DONE
                self._record(score, sprint_id, outcome.value,
                           f"lifted_by_rc_{rc_total}")
                return outcome

        # RC ≥ 5: permanent ratchet — confirms DONE, stabilizes ADVISORY
        if rc_total >= 5 and base_outcome == SprintOutcome.SPRINT_DONE:
            self._record(score, sprint_id, base_outcome.value,
                       f"confirmed_by_rc_{rc_total}")
            return base_outcome

        # RC < 4: useful artifact only — cannot be SPRINT_DONE
        if rc_total < 4 and base_outcome == SprintOutcome.SPRINT_DONE:
            outcome = SprintOutcome.ADVISORY
            self._record(score, sprint_id, outcome.value,
                       f"downgraded_by_rc_{rc_total}")
            return outcome

        return base_outcome

    def rc_boost_factor(self, rc_total: int) -> float:
        """Compute a score boost factor from RC total (0.0–1.0 scale).

        Used to adjust harness thresholds based on ratchet quality.
        """
        return min(rc_total / 7.0, 1.0)

    def _record(
        self,
        score: HarnessScore,
        sprint_id: str,
        outcome: str,
        done_verdict: Optional[str] = None,
    ) -> None:
        record = {
            "sprint_id": sprint_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "score": {
                "build": score.build,
                "tests": score.tests,
                "coverage": score.coverage,
                "type_safety": score.type_safety,
                "architecture": score.architecture,
                "ux_gate": score.ux_gate,
                "llm_judge": score.llm_judge,
                "total": score.total(),
            },
            "outcome": outcome,
            "done_verdict": done_verdict or score.verdict().value,
        }
        self.history.append(record)
        self._persist()

    def _persist(self) -> None:
        if not self.history_path:
            return
        try:
            self.history_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.history_path, "w", encoding="utf-8") as f:
                json.dump(self.history, f, indent=2)
        except OSError:
            pass
