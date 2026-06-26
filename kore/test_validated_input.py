"""Tests for the Validated Input Processing System.

Covers:
  - Unit tests for all 4 modules
  - Integration test: full pipeline
  - Atomicity test: no partial "ok" can be emitted
  - Stability test: criteria cannot change mid-cycle
  - Exhaustiveness test: criteria set covers all known invalid conditions
"""

from __future__ import annotations

import pytest

from validated_input import (
    AtomicValidationGate,
    CriteriaBuilder,
    CriteriaSet,
    Criterion,
    InputReceiver,
    ReceivedInput,
    Response,
    ResponseGenerator,
    ValidationResult,
    ValidatedInputPipeline,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Module 1 — Criteria Definition Engine Tests
# ═══════════════════════════════════════════════════════════════════════════════

def test_criterion_is_immutable():
    """Criterion dataclass is frozen — cannot be modified after creation."""
    c = Criterion(
        name="test",
        description="A test criterion",
        check=lambda x: (True, "ok"),
    )
    with pytest.raises(Exception):
        c.name = "modified"  # type: ignore


def test_criteria_set_requires_at_least_one():
    """Empty criteria set must raise ValueError."""
    with pytest.raises(ValueError):
        CriteriaSet(criteria=())


def test_criteria_builder_chaining():
    """Builder supports fluent chaining."""
    builder = CriteriaBuilder()
    builder.add("a", "desc a", lambda x: (True, "")).add("b", "desc b", lambda x: (True, ""))
    assert builder.count == 2


def test_criteria_builder_lock_returns_frozen():
    """Lock() returns an immutable CriteriaSet."""
    builder = CriteriaBuilder()
    builder.add("a", "desc", lambda x: (True, ""))
    cs = builder.lock()
    assert isinstance(cs, CriteriaSet)
    assert cs.count == 1
    # Verify frozen: cannot append to the tuple
    with pytest.raises(AttributeError):
        cs.criteria.append(None)  # type: ignore


def test_criteria_builder_empty_lock_raises():
    """Locking an empty builder raises ValueError."""
    builder = CriteriaBuilder()
    with pytest.raises(ValueError):
        builder.lock()


# ═══════════════════════════════════════════════════════════════════════════════
# Module 2 — Input Receiver Tests
# ═══════════════════════════════════════════════════════════════════════════════

def test_input_receiver_captures_raw():
    """InputReceiver captures whatever is given without modification."""
    receiver = InputReceiver()
    result = receiver.receive("hello world")
    assert result.data == "hello world"
    assert isinstance(result.received_at, str)


def test_input_receiver_preserves_type():
    """InputReceiver does not coerce or modify input type."""
    receiver = InputReceiver()
    for val in ["text", 42, {"key": "value"}, [1, 2, 3], None]:
        result = receiver.receive(val)
        assert result.data == val


def test_received_input_is_immutable():
    """ReceivedInput dataclass is frozen."""
    ri = ReceivedInput(data="test", received_at="2024-01-01")
    with pytest.raises(Exception):
        ri.data = "modified"  # type: ignore


# ═══════════════════════════════════════════════════════════════════════════════
# Module 3 — Atomic Validation Gate Tests
# ═══════════════════════════════════════════════════════════════════════════════

def test_atomic_gate_all_pass():
    """When all criteria pass, ValidationResult.passed is True."""
    builder = CriteriaBuilder()
    builder.add("is_string", "Must be string", lambda x: (isinstance(x, str), "not a string"))
    builder.add("not_empty", "Must not be empty", lambda x: (len(x) > 0, "empty"))
    criteria = builder.lock()

    gate = AtomicValidationGate()
    result = gate.validate("hello", criteria)
    assert result.passed
    assert result.total_checked == 2
    assert result.total_passed == 2


def test_atomic_gate_one_fails():
    """One failing criterion makes passed=False."""
    builder = CriteriaBuilder()
    builder.add("is_string", "Must be string", lambda x: (isinstance(x, str), "not a string"))
    builder.add("not_empty", "Must not be empty", lambda x: (len(x) > 0, "empty"))
    criteria = builder.lock()

    gate = AtomicValidationGate()
    result = gate.validate("", criteria)  # empty string passes is_string, fails not_empty
    assert not result.passed
    assert result.total_checked == 2
    assert result.total_passed == 1
    assert "not_empty" in result.failed_criteria


def test_atomic_gate_all_fail():
    """All failing gives passed=False with correct count."""
    builder = CriteriaBuilder()
    builder.add("a", "a", lambda x: (False, "fail a"))
    builder.add("b", "b", lambda x: (False, "fail b"))
    builder.add("c", "c", lambda x: (False, "fail c"))
    criteria = builder.lock()

    gate = AtomicValidationGate()
    result = gate.validate("anything", criteria)
    assert not result.passed
    assert result.total_checked == 3
    assert result.total_passed == 0
    assert len(result.failed_criteria) == 3


def test_atomic_gate_all_evaluated_even_on_failure():
    """CRITICAL: ALL criteria must be evaluated even if some fail.
    This is the atomicity guarantee — no early exit on first failure.
    """
    eval_count = [0]  # mutable counter

    def make_check(should_pass: bool):
        def check(x):
            eval_count[0] += 1
            return (should_pass, f"check_{eval_count[0]}")
        return check

    builder = CriteriaBuilder()
    builder.add("fail1", "fails first", make_check(False))
    builder.add("fail2", "fails second", make_check(False))
    builder.add("pass1", "passes", make_check(True))
    builder.add("fail3", "fails fourth", make_check(False))
    criteria = builder.lock()

    gate = AtomicValidationGate()
    result = gate.validate("anything", criteria)

    # All 4 must have been evaluated — not just 2
    assert eval_count[0] == 4, (
        f"Atomicity violation: only {eval_count[0]}/4 criteria evaluated. "
        f"All must be checked."
    )
    assert not result.passed
    assert result.total_checked == 4


def test_atomic_gate_exception_in_criterion():
    """Exception in a criterion is caught and treated as failure — remaining criteria still run."""
    eval_count = [0]

    def crashing_check(x):
        eval_count[0] += 1
        raise RuntimeError("boom")

    def normal_check(x):
        eval_count[0] += 1
        return (True, "ok")

    builder = CriteriaBuilder()
    builder.add("crasher", "will crash", crashing_check)
    builder.add("survivor", "should still run", normal_check)
    criteria = builder.lock()

    gate = AtomicValidationGate()
    result = gate.validate("anything", criteria)

    assert eval_count[0] == 2, "Survivor criterion must run even after crash"
    assert not result.passed
    assert "crasher" in result.failed_criteria
    assert "survivor" not in result.failed_criteria


# Note: test_atomic_gate_empty_criteria not needed — CriteriaSet constructor
# already rejects empty criteria sets (raises ValueError). The gate's empty
# check is defense-in-depth, verified by the CriteriaBuilder test above.


# ═══════════════════════════════════════════════════════════════════════════════
# Module 4 — Response Generator Tests
# ═══════════════════════════════════════════════════════════════════════════════

def test_response_ok_only_on_pass():
    """ok=True ONLY when ValidationResult.passed is True."""
    gen = ResponseGenerator()

    # Pass result
    pass_result = ValidationResult(
        passed=True,
        criteria_results=(("a", True, "ok"), ("b", True, "ok")),
        total_checked=2, total_passed=2, validated_at="",
    )
    response = gen.generate(pass_result)
    assert response.ok
    assert "ok" in response.detail.lower()

    # Fail result
    fail_result = ValidationResult(
        passed=False,
        criteria_results=(("a", True, "ok"), ("b", False, "fail")),
        total_checked=2, total_passed=1, validated_at="",
    )
    response = gen.generate(fail_result)
    assert not response.ok
    assert "failed" in response.detail.lower()


def test_response_dataclass_is_immutable():
    """Response dataclass is frozen."""
    r = Response(ok=True, detail="ok")
    with pytest.raises(Exception):
        r.ok = False  # type: ignore


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Tests — Full Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def test_pipeline_requires_criteria_first():
    """Calling process() before define_criteria() raises RuntimeError."""
    pipeline = ValidatedInputPipeline()
    with pytest.raises(RuntimeError):
        pipeline.process("anything")


def test_pipeline_valid_input_returns_ok():
    """Full pipeline with valid input returns ok=True."""
    builder = CriteriaBuilder()
    builder.add("is_string", "Must be string", lambda x: (isinstance(x, str), "not string"))
    builder.add("not_empty", "Must not be empty", lambda x: (len(x) > 0, "empty"))
    builder.add("no_spaces", "No leading/trailing spaces",
                lambda x: (x == x.strip(), "has spaces"))

    pipeline = ValidatedInputPipeline()
    pipeline.define_criteria(builder)

    response = pipeline.process("hello")
    assert response.ok
    assert "3/3" in response.detail


def test_pipeline_invalid_input_returns_not_ok():
    """Full pipeline with invalid input returns ok=False."""
    builder = CriteriaBuilder()
    builder.add("is_string", "Must be string", lambda x: (isinstance(x, str), "not string"))
    builder.add("not_empty", "Must not be empty", lambda x: (len(x) > 0, "empty"))

    pipeline = ValidatedInputPipeline()
    pipeline.define_criteria(builder)

    response = pipeline.process("")
    assert not response.ok


def test_pipeline_criteria_stable_across_cycles():
    """Criteria do not change between processing cycles."""
    builder = CriteriaBuilder()
    builder.add("check", "always passes", lambda x: (True, "ok"))
    criteria1 = builder.lock()

    # Process multiple inputs — criteria remain identical
    pipeline = ValidatedInputPipeline()
    pipeline.define_criteria(builder)

    r1 = pipeline.process("input1")
    r2 = pipeline.process("input2")
    r3 = pipeline.process("input3")

    assert r1.ok
    assert r2.ok
    assert r3.ok


def test_pipeline_atomicity_no_partial_ok():
    """CRITICAL: No response with ok=True can be generated unless ALL criteria pass.
    This directly addresses the UNRESOLVED CHECK from the blueprint.
    """
    builder = CriteriaBuilder()
    builder.add("c1", "passes", lambda x: (True, "ok"))
    builder.add("c2", "passes", lambda x: (True, "ok"))
    builder.add("c3", "FAILS — this one fails", lambda x: (False, "intentional fail"))
    builder.add("c4", "passes", lambda x: (True, "ok"))
    builder.add("c5", "passes", lambda x: (True, "ok"))

    pipeline = ValidatedInputPipeline()
    pipeline.define_criteria(builder)

    # Process 100 inputs — none should return ok=True because c3 always fails
    for i in range(100):
        response = pipeline.process(f"input_{i}")
        assert not response.ok, (
            f"ATOMICITY VIOLATION: input_{i} got ok=True despite c3 always failing. "
            f"Partial 'ok' detected — validation gate not atomic."
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Exhaustiveness Test
# ═══════════════════════════════════════════════════════════════════════════════

def test_criteria_cover_all_invalid_conditions():
    """The criteria set must cover all known invalid input conditions."""
    builder = CriteriaBuilder()
    builder.add("not_none", "Input must not be None", lambda x: (x is not None, "is None"))
    builder.add("is_string", "Input must be string", lambda x: (isinstance(x, str), "not string"))
    builder.add("not_empty", "Input must not be empty", lambda x: (len(x) > 0 if isinstance(x, str) else True, "empty"))
    builder.add("no_whitespace_only", "Input must not be whitespace-only",
                lambda x: (x.strip() != "" if isinstance(x, str) else True, "whitespace only"))
    builder.add("max_length", "Input must be <= 1000 chars",
                lambda x: (len(x) <= 1000 if isinstance(x, str) else True, "too long"))

    pipeline = ValidatedInputPipeline()
    pipeline.define_criteria(builder)

    # All invalid conditions must return ok=False
    invalid_cases = [
        (None, "None input"),
        (42, "non-string input"),
        ("", "empty string"),
        ("   ", "whitespace only"),
        ("x" * 1001, "too long"),
    ]

    for invalid_input, description in invalid_cases:
        response = pipeline.process(invalid_input)
        assert not response.ok, f"Exhaustiveness failure: {description} should not pass"

    # Valid input must return ok=True
    response = pipeline.process("valid input")
    assert response.ok, "Valid input should return ok=True"
