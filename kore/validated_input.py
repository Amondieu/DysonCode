"""Dyson Level Blueprint — Validated Input Processing System.

4-module architecture:
  Module 1 — Criteria Definition Engine (immutable criteria set)
  Module 2 — Input Receiver (raw input capture)
  Module 3 — Atomic Validation Gate (all-or-nothing check)
  Module 4 — Response Generator ("ok" only on full pass)

Critical constraint: No partial or premature "ok" can be emitted.
The Atomic Validation Gate must complete ALL checks before any response.

This is the reference implementation that jcode_precheck.py was built from.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple


# ═══════════════════════════════════════════════════════════════════════════════
# Module 1 — Criteria Definition Engine
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Criterion:
    """A single immutable validation criterion.

    Frozen=True enforces criteria stability — they cannot change mid-cycle.
    """
    name: str
    description: str
    check: Callable[[Any], Tuple[bool, str]]
    # check(input) -> (passed: bool, reason: str)


@dataclass(frozen=True)
class CriteriaSet:
    """Immutable set of validation criteria.

    Locked at cycle start. Cannot be modified after creation.
    Module 3 reads from this; Module 4 never sees it directly.
    """
    criteria: Tuple[Criterion, ...] = field(default_factory=tuple)
    created_at: str = ""

    @property
    def count(self) -> int:
        return len(self.criteria)

    def __post_init__(self) -> None:
        if self.count == 0:
            raise ValueError("CriteriaSet must contain at least one criterion")


class CriteriaBuilder:
    """Mutable builder for CriteriaSet — use during definition phase only.

    Usage:
        builder = CriteriaBuilder()
        builder.add("not_empty", "Input must not be empty", lambda x: (bool(x), "..."))
        criteria = builder.lock()  # returns frozen CriteriaSet
    """

    def __init__(self) -> None:
        self._criteria: List[Criterion] = []

    def add(
        self,
        name: str,
        description: str,
        check: Callable[[Any], Tuple[bool, str]],
    ) -> CriteriaBuilder:
        """Add a criterion. Returns self for chaining."""
        self._criteria.append(Criterion(name=name, description=description, check=check))
        return self

    def lock(self) -> CriteriaSet:
        """Freeze and return the immutable criteria set."""
        if not self._criteria:
            raise ValueError("Cannot lock empty criteria set")
        import datetime
        return CriteriaSet(
            criteria=tuple(self._criteria),
            created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

    @property
    def count(self) -> int:
        return len(self._criteria)


# ═══════════════════════════════════════════════════════════════════════════════
# Module 2 — Input Receiver
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ReceivedInput:
    """Raw input captured by the Input Receiver.

    Frozen=True prevents tampering between reception and validation.
    """
    data: Any
    received_at: str = ""


class InputReceiver:
    """Captures user input and passes it to the validation gate.

    Does NOT validate. Does NOT modify. Only receives and forwards.
    """

    def receive(self, raw_input: Any) -> ReceivedInput:
        """Capture raw input. No processing, no validation."""
        import datetime
        return ReceivedInput(
            data=raw_input,
            received_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Module 3 — Atomic Validation Gate
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ValidationResult:
    """Atomic validation result.

    passed=True ONLY if ALL criteria passed.
    Individual criterion results are preserved for diagnostics but
    the 'passed' flag is the single source of truth for Module 4.
    """
    passed: bool
    criteria_results: Tuple[Tuple[str, bool, str], ...] = field(default_factory=tuple)
    # Each tuple: (criterion_name, passed, reason)
    total_checked: int = 0
    total_passed: int = 0
    validated_at: str = ""

    @property
    def failed_criteria(self) -> List[str]:
        return [name for name, passed, _ in self.criteria_results if not passed]

    @property
    def failure_reasons(self) -> str:
        reasons = [reason for _, passed, reason in self.criteria_results if not passed]
        return "; ".join(reasons) if reasons else ""


class AtomicValidationGate:
    """Checks input against ALL criteria before emitting any result.

    THE CRITICAL CONSTRAINT: This gate must be atomic — no partial result
    can escape. All criteria are evaluated before any result is returned.
    The implementation uses a simple loop that cannot be interrupted;
    no generator, no yield, no early return on failure.

    If any criterion raises an exception, it is treated as a failure
    for that criterion — but all remaining criteria are still evaluated.
    """

    def validate(self, input_data: Any, criteria: CriteriaSet) -> ValidationResult:
        """Run ALL criteria against input. Atomic — no early exit.

        Args:
            input_data: The raw input to validate (from Module 2).
            criteria: The immutable criteria set (from Module 1).

        Returns:
            ValidationResult with passed=True only if ALL criteria passed.
        """
        if criteria.count == 0:
            raise ValueError("Cannot validate against empty criteria set")

        import datetime

        results: List[Tuple[str, bool, str]] = []
        total_passed = 0

        # CRITICAL: No early return. All criteria must be evaluated.
        for criterion in criteria.criteria:
            try:
                passed, reason = criterion.check(input_data)
            except Exception as exc:
                passed = False
                reason = f"Criterion raised exception: {exc}"

            results.append((criterion.name, passed, reason))
            if passed:
                total_passed += 1

        all_passed = total_passed == criteria.count

        return ValidationResult(
            passed=all_passed,
            criteria_results=tuple(results),
            total_checked=criteria.count,
            total_passed=total_passed,
            validated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Module 4 — Response Generator
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Response:
    """The system response.

    ok=True ONLY if Module 3 returned passed=True.
    No other condition can produce ok=True.
    """
    ok: bool
    detail: str = ""


class ResponseGenerator:
    """Returns 'ok' only when the Atomic Validation Gate reports a pass.

    Returns nothing (ok=False) on failure — never a partial 'ok'.
    """

    def generate(self, result: ValidationResult) -> Response:
        """Generate response based on validation result.

        The ONLY path to ok=True is result.passed == True.
        This cannot be circumvented — it's a single boolean check.
        """
        if result.passed:
            return Response(
                ok=True,
                detail=f"ok — all {result.total_checked}/{result.total_checked} criteria passed",
            )
        return Response(
            ok=False,
            detail=f"validation failed — {result.total_passed}/{result.total_checked} criteria passed. "
                    f"Failed: {', '.join(result.failed_criteria)}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Pipeline — Orchestrates Modules 1→2→3→4
# ═══════════════════════════════════════════════════════════════════════════════

class ValidatedInputPipeline:
    """Complete pipeline: CriteriaDefinition → InputReceive → Validate → Respond.

    Usage:
        pipeline = ValidatedInputPipeline()
        pipeline.define_criteria(builder)   # Phase 1
        response = pipeline.process(input)   # Phases 2-4
    """

    def __init__(self) -> None:
        self._criteria: Optional[CriteriaSet] = None
        self._receiver = InputReceiver()
        self._gate = AtomicValidationGate()
        self._responder = ResponseGenerator()

    def define_criteria(self, builder: CriteriaBuilder) -> None:
        """Phase 1: Lock in the criteria set."""
        self._criteria = builder.lock()

    @property
    def criteria_locked(self) -> bool:
        return self._criteria is not None

    def process(self, raw_input: Any) -> Response:
        """Phases 2-4: Receive → Validate → Respond.

        Raises RuntimeError if criteria not yet defined.
        """
        if self._criteria is None:
            raise RuntimeError(
                "Criteria not defined. Call define_criteria() before process()."
            )

        # Module 2: Receive
        received = self._receiver.receive(raw_input)

        # Module 3: Atomic validation
        result = self._gate.validate(received.data, self._criteria)

        # Module 4: Response
        return self._responder.generate(result)


# ═══════════════════════════════════════════════════════════════════════════════
# Mapping to jcode PreCheck Gate
# ═══════════════════════════════════════════════════════════════════════════════
#
#   Blueprint Module          jcode Equivalent
#   ─────────────────         ─────────────────────────────────
#   CriteriaDefinitionEngine  jcode_models.COMPILE_TIME_LAWS (8 InvariantLaw)
#   InputReceiver             jcode_precheck.run_precheck(jcode_input)
#   AtomicValidationGate      jcode_precheck._evaluate_law() loop — all 8 laws
#   ResponseGenerator         jcode_models.PreCheckResult.passed → "ok" or reject
#
#   The atomic constraint is enforced identically:
#   - Blueprint: for criterion in criteria.criteria (no early return)
#   - jcode:      for law in COMPILE_TIME_LAWS (all 8 evaluated)
#
#   The blueprint validates THIS architecture.
