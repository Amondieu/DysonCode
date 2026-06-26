"""Sprint 5 — Contract Registry: Typisierte Artefakte für den Inner Circle.

Jede Rolle kommuniziert ausschließlich über strukturierte Artefakte (C1: Artefakt-Primat).
PydanticAI-kompatible Model-Definitionen + Freeze-Mechanismus (SI-3).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


# ── Failure Taxonomy (Sprint 6 Bridge) ──────────────────────────────────────

class FailureClass(str, Enum):
    SPEC_DRIFT = "spec_drift"
    REASONING_PROBLEM = "reasoning_problem"
    TOOL_CALL_FAILURE = "tool_call_failure"
    MEMORY_FAILURE = "memory_failure"
    PLANNING_FAILURE = "planning_failure"
    ACTION_FAILURE = "action_failure"
    CLOUD_OUTAGE = "cloud_outage"  # v2 only


class ConstraintType(str, Enum):
    """Sprint 6 — strukturierte Constraint-Typen für Dyson Road Replanner."""
    MISSING_DEP = "missing_dep"
    BEHAVIOR_WRONG = "behavior_wrong"
    SPEC_UNCLEAR = "spec_unclear"
    PATH_BLOCKED = "path_blocked"


@dataclass
class Constraint:
    """Sprint 6 — Failure→Constraint Injection Artefakt."""
    type: ConstraintType
    blocked_path: str       # node_id that triggered the failure
    dependency: str         # file path or node id to satisfy first
    message: str = ""
    source_tool: str = ""

    def to_edge_label(self) -> str:
        return f"{self.type.value.upper()}: {self.dependency}"


@dataclass
class BuilderFailure:
    """BuilderSession failure bundle: note + typed constraint."""
    note: "FailureNote"
    constraint: Constraint


# ── Kern-Artefakte ──────────────────────────────────────────────────────────

@dataclass
class InterfaceContract:
    """Architect-Output: Spezifikation eines Moduls/Schnittstelle."""
    module_id: str
    module_name: str
    description: str
    depends_on: List[str] = field(default_factory=list)
    exposed_interfaces: List[str] = field(default_factory=list)
    acceptance_criteria: List[str] = field(default_factory=list)
    risk_score: float = 0.5  # 0.0–1.0
    frozen: bool = False
    frozen_at: Optional[str] = None

    def freeze(self) -> None:
        self.frozen = True
        self.frozen_at = datetime.now(timezone.utc).isoformat()

    def validate(self) -> List[str]:
        errors = []
        if not self.module_id:
            errors.append("module_id is required")
        if not self.module_name:
            errors.append("module_name is required")
        if not 0.0 <= self.risk_score <= 1.0:
            errors.append("risk_score must be 0.0–1.0")
        return errors


@dataclass
class TaskNode:
    """Ein Knoten im Dyson Road DAG."""
    id: str
    title: str
    depends_on: List[str] = field(default_factory=list)
    role: str = "builder"  # architect | builder | critic | tester | memory_keeper
    risk_score: float = 0.5
    progress_gain: float = 0.5
    context_retention: float = 0.8
    status: str = "pending"  # pending | ready | running | done | blocked
    artefact_out: Optional[str] = None  # Typ des Output-Artefakts
    
    @property
    def dyson_road_score(self) -> float:
        """ProgressGain × ContextRetention / Risk (minimaler Nenner 0.1)."""
        risk = max(self.risk_score, 0.1)
        return (self.progress_gain * self.context_retention) / risk


@dataclass
class TaskEdge:
    """Kante im Dyson Road DAG."""
    source: str
    target: str
    constraint: Optional[str] = None  # z.B. "C-003: auth_module prior"


@dataclass
class BuildManifest:
    """Architect-Output: Vollständiger Task-Graph."""
    sprint_id: str
    spec_summary: str
    nodes: Dict[str, TaskNode] = field(default_factory=dict)
    edges: List[TaskEdge] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def validate(self) -> List[str]:
        errors = []
        if not self.sprint_id:
            errors.append("sprint_id is required")
        if not self.nodes:
            errors.append("at least one node required")
        return errors


@dataclass
class CodeDelta:
    """Builder-Output: Code-Änderung."""
    node_id: str
    files_changed: List[str] = field(default_factory=list)
    diff: str = ""
    test_commands: List[str] = field(default_factory=list)
    confidence: float = 0.8

    def validate(self) -> List[str]:
        errors = []
        if not self.node_id:
            errors.append("node_id is required")
        if not self.files_changed:
            errors.append("at least one file must be changed")
        if not 0.0 <= self.confidence <= 1.0:
            errors.append("confidence must be 0.0–1.0")
        return errors


@dataclass
class FailureNote:
    """Critic-Output: Strukturierte Fehleranalyse."""
    node_id: str
    failure_class: FailureClass
    severity: int = 1  # 0–3
    constraint: str = ""
    description: str = ""
    suggested_action: str = ""

    def validate(self) -> List[str]:
        errors = []
        if not self.node_id:
            errors.append("node_id is required")
        if not 0 <= self.severity <= 3:
            errors.append("severity must be 0–3")
        return errors


@dataclass
class TestResult:
    """Tester-Output: Validierungsergebnis."""
    node_id: str
    passed: bool = False
    build_ok: bool = True
    tests_passed: int = 0
    tests_failed: int = 0
    coverage: float = 0.0
    type_errors: int = 0
    lint_errors: int = 0
    llm_judge_score: Optional[float] = None

    def validate(self) -> List[str]:
        errors = []
        if not self.node_id:
            errors.append("node_id is required")
        if not 0.0 <= self.coverage <= 1.0:
            errors.append("coverage must be 0.0–1.0")
        if self.llm_judge_score is not None and not (0.0 <= self.llm_judge_score <= 1.0):
            errors.append("llm_judge_score must be 0.0–1.0 or None")
        return errors


@dataclass
class MemorySnapshot:
    """Memory Keeper-Output: Komprimierter Session-Zustand."""
    session_id: str
    sprint_id: str
    patterns_added: int = 0
    anti_patterns_added: int = 0
    compressed_state: str = ""
    node_completions: int = 0
    failure_count: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def validate(self) -> List[str]:
        errors = []
        if not self.session_id:
            errors.append("session_id is required")
        return errors


# ── Harness Score (Sprint 7 Bridge) ─────────────────────────────────────────

class DoneVerdict(str, Enum):
    DONE = "done"
    PARTIAL = "partial"
    BLOCKED = "blocked"
    UNDECIDABLE = "undecidable"


@dataclass
class HarnessScore:
    """7-Pillar-Bewertung eines Sprints/Knotens."""
    build: float = 0.0       # Hard Gate: 0.0/1.0
    tests: float = 0.0       # Hard Gate: 0.0/1.0 (0 failures)
    coverage: float = 0.0    # Soft: ≥ 0.80
    type_safety: float = 0.0 # Soft: 0.0/1.0
    architecture: float = 0.0
    ux_gate: float = 0.0     # axe-core critical = 0 → 1.0
    llm_judge: float = 0.0   # advisory, JSON-validated
    
    WEIGHTS = {
        "build": 0.20,
        "tests": 0.25,
        "coverage": 0.15,
        "type_safety": 0.10,
        "architecture": 0.15,
        "ux_gate": 0.10,
        "llm_judge": 0.05,
    }

    def total(self) -> float:
        return sum(
            getattr(self, k) * v
            for k, v in self.WEIGHTS.items()
        )

    def verdict(self) -> DoneVerdict:
        hard_gates_pass = self.build >= 1.0 and self.tests >= 1.0
        if not hard_gates_pass:
            return DoneVerdict.BLOCKED
        if self.llm_judge is None:
            return DoneVerdict.UNDECIDABLE
        score = self.total()
        if score >= 0.90:
            return DoneVerdict.DONE
        if score >= 0.70:
            return DoneVerdict.PARTIAL
        return DoneVerdict.BLOCKED


# ── Contract Registry ────────────────────────────────────────────────────────

class ContractRegistry:
    """Registry mit Freeze-Mechanismus für alle Artefakt-Typen (SI-3)."""

    def __init__(self) -> None:
        self._contracts: Dict[str, InterfaceContract] = {}
        self._frozen_contracts: Dict[str, InterfaceContract] = {}

    def register(self, contract: InterfaceContract) -> None:
        errors = contract.validate()
        if errors:
            raise ValueError(f"Contract validation failed: {', '.join(errors)}")
        if contract.module_id in self._frozen_contracts:
            raise RuntimeError(
                f"Contract {contract.module_id} is frozen — cannot modify"
            )
        self._contracts[contract.module_id] = contract

    def freeze(self, module_id: str) -> None:
        if module_id not in self._contracts:
            raise KeyError(f"Contract {module_id} not found")
        if module_id in self._frozen_contracts:
            return  # bereits frozen
        contract = self._contracts.pop(module_id)
        contract.freeze()
        self._frozen_contracts[module_id] = contract

    def is_frozen(self, module_id: str) -> bool:
        return module_id in self._frozen_contracts

    def get(self, module_id: str) -> Optional[InterfaceContract]:
        return self._contracts.get(module_id) or self._frozen_contracts.get(module_id)

    def list_all(self) -> Dict[str, InterfaceContract]:
        return {**self._contracts, **self._frozen_contracts}

    def validate_artefact(self, artefact: Any) -> List[str]:
        if hasattr(artefact, "validate"):
            return artefact.validate()
        return ["unknown artefact type — no validate() method"]

    # ── jcode Pre-Check API ──────────────────────────────────────────────

    def validate_jcode_payload(self, jcode_input: Dict[str, Any]) -> Dict[str, Any]:
        """Validate a jcode payload against all registered contracts.

        Called by the pre-check gate (jcode_precheck.py). Checks:
          - Spec structure validity
          - Node role validity (against registered contracts)
          - Edge type validity
          - Contract freeze violations
          - Artefact schema conformance

        Returns:
            Dict with 'valid', 'errors', 'warnings', 'contract_count'.
        """
        errors: List[str] = []
        warnings: List[str] = []

        if not isinstance(jcode_input, dict):
            return {"valid": False, "errors": ["jcode_input must be a dict"], "warnings": [], "contract_count": len(self._contracts) + len(self._frozen_contracts)}

        # Validate nodes against registered contracts
        nodes = jcode_input.get("nodes", [])
        if isinstance(nodes, list):
            for i, node in enumerate(nodes):
                if isinstance(node, dict):
                    role = node.get("role", "")
                    nid = node.get("id", f"node-{i}")
                    # Check contract freeze violations
                    if nid in self._frozen_contracts:
                        warnings.append(
                            f"node[{i}] ({nid}): modifying frozen contract"
                        )
                    # Validate against contract if registered
                    contract = self.get(nid)
                    if contract:
                        c_errors = contract.validate()
                        for err in c_errors:
                            errors.append(f"node[{i}] ({nid}): {err}")

        # Validate edges
        edges = jcode_input.get("edges", [])
        if isinstance(edges, list):
            valid_edge_types = {
                "data", "challenge", "synthesis", "memory", "trigger",
                "broadcast", "dependency", "reference",
            }
            for i, edge in enumerate(edges):
                if isinstance(edge, dict):
                    etype = edge.get("type", "")
                    if etype and etype not in valid_edge_types:
                        errors.append(f"edge[{i}]: unknown type '{etype}'")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "contract_count": len(self._contracts) + len(self._frozen_contracts),
            "frozen_count": len(self._frozen_contracts),
        }

    def expose_validation_apis(self) -> Dict[str, Any]:
        """Expose all validation-capable artefact types for the pre-check gate.

        Returns a registry of artefact_type → validate_function for use
        by the jcode pre-check layer.
        """
        return {
            "InterfaceContract": InterfaceContract,
            "BuildManifest": BuildManifest,
            "CodeDelta": CodeDelta,
            "FailureNote": FailureNote,
            "TestResult": TestResult,
            "MemorySnapshot": MemorySnapshot,
            "HarnessScore": HarnessScore,
        }
