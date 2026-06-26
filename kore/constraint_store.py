"""Sprint 6 — Constraint Store: append-only log of active constraints."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from contract_registry import Constraint, ConstraintType


@dataclass
class ConstraintRecord:
    """Einzelner Store-Eintrag mit Monotonie-Index."""
    index: int
    constraint: Constraint


class ConstraintStore:
    """Append-only Log — wird vom Dyson Road Optimizer gelesen."""

    def __init__(self) -> None:
        self._records: List[ConstraintRecord] = []

    def append(self, constraint: Constraint) -> ConstraintRecord:
        record = ConstraintRecord(index=len(self._records), constraint=constraint)
        self._records.append(record)
        return record

    def active(self) -> List[Constraint]:
        return [r.constraint for r in self._records]

    def records(self) -> List[ConstraintRecord]:
        return list(self._records)

    def count(self) -> int:
        return len(self._records)

    def latest(self) -> Optional[Constraint]:
        if not self._records:
            return None
        return self._records[-1].constraint

    def by_type(self, ctype: ConstraintType) -> List[Constraint]:
        return [c for c in self.active() if c.type == ctype]

    def clear(self) -> None:
        self._records.clear()
