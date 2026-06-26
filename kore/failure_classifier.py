"""Sprint 6 — Failure Classifier: 6-Klassen-Taxonomie + Constraint-Typen."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from contract_registry import (
    BuilderFailure,
    Constraint,
    ConstraintType,
    FailureClass,
    FailureNote,
)

if TYPE_CHECKING:
    from execution.adapter import ToolCall


# ── Klassifikations-Regeln ──────────────────────────────────────────────────

CLASSIFICATION_RULES: Dict[FailureClass, List[str]] = {
    FailureClass.SPEC_DRIFT: [
        "spec changed", "requirement changed", "scope changed",
        "different from spec", "not what was asked",
        "implements wrong", "misunderstood spec", "unclear spec",
    ],
    FailureClass.REASONING_PROBLEM: [
        "contradiction", "inconsistent", "doesn't make sense",
        "logical error", "wrong assumption", "incorrect logic",
        "behavior wrong", "wrong behavior",
    ],
    FailureClass.TOOL_CALL_FAILURE: [
        "not found", "missing dependency", "import error",
        "module not found", "file not found", "command not found",
        "no such", "cannot find", "does not exist",
    ],
    FailureClass.MEMORY_FAILURE: [
        "forgot", "context lost", "session expired",
        "out of context", "memory error", "recall failed",
    ],
    FailureClass.PLANNING_FAILURE: [
        "dependency not met", "precondition failed",
        "wrong order", "circular", "blocked by",
        "needs", "must be done first", "path blocked",
    ],
    FailureClass.ACTION_FAILURE: [
        "timeout", "error", "exception", "crash",
        "failed", "unexpected", "retry", "exit code",
    ],
}

FAILURE_TO_CONSTRAINT: Dict[FailureClass, ConstraintType] = {
    FailureClass.TOOL_CALL_FAILURE: ConstraintType.MISSING_DEP,
    FailureClass.SPEC_DRIFT: ConstraintType.SPEC_UNCLEAR,
    FailureClass.REASONING_PROBLEM: ConstraintType.BEHAVIOR_WRONG,
    FailureClass.PLANNING_FAILURE: ConstraintType.PATH_BLOCKED,
    FailureClass.ACTION_FAILURE: ConstraintType.PATH_BLOCKED,
    FailureClass.MEMORY_FAILURE: ConstraintType.SPEC_UNCLEAR,
}


class FailureClassifier:
    """Klassifiziert Fehler in FailureNote + strukturierte Constraint."""

    def __init__(self) -> None:
        self._rules = CLASSIFICATION_RULES

    def classify(
        self,
        error_message: str,
        node_id: str = "unknown",
        context: Optional[Dict[str, Any]] = None,
    ) -> FailureNote:
        """Legacy API — analysiert Fehlermeldung → FailureNote."""
        failure_class, severity, details = self._score_message(error_message)
        return FailureNote(
            node_id=node_id,
            failure_class=failure_class,
            severity=severity,
            constraint=self._format_constraint(failure_class, details),
            description=error_message[:200],
            suggested_action=self._suggest_action(failure_class, error_message),
        )

    def classify_tool_call(
        self,
        call: "ToolCall",
        error_message: str,
    ) -> Tuple[Constraint, FailureNote]:
        """Sprint 6 API — ToolCall + error → Constraint + FailureNote."""
        failure_class, severity, details = self._score_message(error_message)
        constraint_type = self._resolve_constraint_type(
            failure_class, error_message, call, context=None,
        )
        dependency = self._extract_dependency(call, error_message, constraint_type)
        blocked = call.node_id

        constraint = Constraint(
            type=constraint_type,
            blocked_path=blocked,
            dependency=dependency,
            message=error_message[:200],
            source_tool=call.tool,
        )

        note = FailureNote(
            node_id=blocked,
            failure_class=failure_class,
            severity=severity,
            constraint=constraint.to_edge_label(),
            description=error_message[:200],
            suggested_action=self._suggest_action(failure_class, error_message),
        )
        return constraint, note

    def classify_tool_failure(self, call: "ToolCall", error_message: str) -> BuilderFailure:
        """Convenience bundle for BuilderSession."""
        constraint, note = self.classify_tool_call(call, error_message)
        return BuilderFailure(note=note, constraint=constraint)

    def _score_message(
        self, error_message: str,
    ) -> Tuple[FailureClass, int, List[str]]:
        msg_lower = error_message.lower()
        best_class: FailureClass = FailureClass.ACTION_FAILURE
        best_score = 0
        details: List[str] = []

        for cls, keywords in self._rules.items():
            score = 0
            found: List[str] = []
            for kw in keywords:
                if kw in msg_lower:
                    score += 1
                    found.append(kw)
            if score > best_score:
                best_score = score
                best_class = cls
                details = found

        severity = min(best_score, 3) if best_score > 0 else 1
        return best_class, severity, details

    def _resolve_constraint_type(
        self,
        failure_class: FailureClass,
        error_message: str,
        call: "ToolCall",
        context: Optional[Dict[str, Any]],
    ) -> ConstraintType:
        msg_lower = error_message.lower()
        if failure_class == FailureClass.TOOL_CALL_FAILURE:
            if any(k in msg_lower for k in ("not found", "no such", "does not exist")):
                return ConstraintType.MISSING_DEP
        if failure_class == FailureClass.SPEC_DRIFT:
            return ConstraintType.SPEC_UNCLEAR
        if failure_class == FailureClass.REASONING_PROBLEM:
            return ConstraintType.BEHAVIOR_WRONG
        if failure_class == FailureClass.PLANNING_FAILURE:
            return ConstraintType.PATH_BLOCKED
        return FAILURE_TO_CONSTRAINT.get(failure_class, ConstraintType.PATH_BLOCKED)

    def _extract_dependency(
        self,
        call: "ToolCall",
        error_message: str,
        constraint_type: ConstraintType,
    ) -> str:
        if call.tool == "read_file" and call.args.get("path"):
            return str(call.args["path"])

        path_match = re.search(
            r"(?:failed|read|open):\s*([^\s—]+)",
            error_message,
            re.IGNORECASE,
        )
        if path_match:
            return path_match.group(1).strip()

        if constraint_type == ConstraintType.PATH_BLOCKED:
            return call.node_id

        return call.args.get("path", call.node_id)

    def _format_constraint(self, cls: FailureClass, details: List[str]) -> str:
        mapping = {
            FailureClass.SPEC_DRIFT: "SPEC_REFREEZE: Architect must re-validate spec",
            FailureClass.REASONING_PROBLEM: "REASONING_CHECK: Critic must validate assumptions",
            FailureClass.TOOL_CALL_FAILURE: f"TOOL_MISSING: {', '.join(details) if details else 'dependency'}",
            FailureClass.MEMORY_FAILURE: "MEMORY_RECALL: Memory Keeper must restore context",
            FailureClass.PLANNING_FAILURE: "PLAN_REVISE: Task dependencies need reordering",
            FailureClass.ACTION_FAILURE: "ACTION_RETRY: Alternative execution path required",
        }
        return mapping.get(cls, "GENERIC: Unknown failure")

    def _suggest_action(self, cls: FailureClass, msg: str) -> str:
        actions = {
            FailureClass.SPEC_DRIFT: "Run architect role with updated spec",
            FailureClass.REASONING_PROBLEM: "Run critic role with code context",
            FailureClass.TOOL_CALL_FAILURE: "Check dependencies, add missing module to task graph",
            FailureClass.MEMORY_FAILURE: "Trigger memory recall from CASS/K2 store",
            FailureClass.PLANNING_FAILURE: "Reorder task graph, check preconditions",
            FailureClass.ACTION_FAILURE: f"Retry with alternative approach: {msg[:80]}",
        }
        return actions.get(cls, "Review and retry")
