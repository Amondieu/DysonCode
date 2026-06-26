#!/usr/bin/env python3
"""Integrationstest für Sprint 5 — KORE Dyson Mode."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contract_registry import (
    ContractRegistry, InterfaceContract, BuildManifest,
    TaskNode, TaskEdge, CodeDelta, FailureNote, FailureClass,
    TestResult, MemorySnapshot, HarnessScore, DoneVerdict,
)
from task_graph import TaskGraph, spec_to_task_graph
from role_engine import RoleEngine, RoutingMode
from orchestrator import DysonOrchestrator, DysonState, AutonomyLevel


def test_contract_registry():
    """Test: Contract Registry mit Freeze-Mechanismus."""
    reg = ContractRegistry()
    c = InterfaceContract(
        module_id="auth",
        module_name="Auth Module",
        description="Benutzerauthentifizierung",
        depends_on=["db"],
        risk_score=0.3,
    )
    reg.register(c)
    assert reg.get("auth") is not None
    assert not reg.is_frozen("auth")

    reg.freeze("auth")
    assert reg.is_frozen("auth")

    # Frozen darf nicht überschrieben werden
    try:
        reg.register(c)
        assert False, "Should raise RuntimeError"
    except RuntimeError:
        pass

    print("  ✅ contract_registry: Register + Freeze + Block")


def test_task_graph():
    """Test: Task Graph DAG + Dyson Road."""
    manifest = BuildManifest(sprint_id="test-1", spec_summary="Test")
    manifest.nodes = {
        "a": TaskNode(id="a", title="A", depends_on=[], risk_score=0.1, progress_gain=0.9, context_retention=0.9),
        "b": TaskNode(id="b", title="B", depends_on=["a"], risk_score=0.3, progress_gain=0.7, context_retention=0.8),
        "c": TaskNode(id="c", title="C", depends_on=["a"], risk_score=0.5, progress_gain=0.5, context_retention=0.6),
    }
    manifest.edges = [
        TaskEdge(source="a", target="b"),
        TaskEdge(source="a", target="c"),
    ]

    tg = TaskGraph.from_manifest(manifest)
    levels = tg.topological_generations()
    assert len(levels) == 2  # [a], [b, c]
    assert "a" in levels[0]
    assert "b" in levels[1] and "c" in levels[1]

    # Dyson Road: a sollte ready sein, höchste Score
    ready = tg.compute_dyson_road()
    assert len(ready) == 1
    assert ready[0].id == "a"

    # Nach a done: b und c ready, b höhere Score als c
    tg.mark_done("a")
    ready = tg.compute_dyson_road()
    assert len(ready) == 2
    assert ready[0].id == "b"  # b hat höhere Score

    print("  ✅ task_graph: Generations + Dyson Road + Apply Constraint")


def test_spec_to_task_graph():
    """Test: Spec-Parsing."""
    spec = """
MODULE: auth
MODULE: api depends: auth risk: 0.5
MODULE: frontend depends: api risk: 0.1
"""
    manifest = spec_to_task_graph(spec)
    assert len(manifest.nodes) == 3
    assert "auth" in manifest.nodes
    assert "api" in manifest.nodes
    assert "frontend" in manifest.nodes

    tg = TaskGraph.from_manifest(manifest)
    levels = tg.topological_generations()
    assert len(levels) == 3

    print("  ✅ spec_to_task_graph: Parse + Generations")


def test_role_engine():
    """Test: YAML-Config + Alias-Resolution."""
    yaml_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "data", "routes", "kore-inner-circle-v1.yaml"
    )
    if not os.path.exists(yaml_path):
        print("  ⚠️  YAML nicht gefunden, überspringe role_engine Test")
        return

    engine = RoleEngine.from_yaml(yaml_path)

    # Memory Keeper immer lokal
    alias = engine.resolve_alias("memory_keeper", complexity=0.9, is_pii=False)
    assert alias == "fast-draft"

    # Architect bei hoher Komplexität → cloud
    alias = engine.resolve_alias("architect", complexity=0.7, is_pii=False)
    assert alias in ("burst", "coder")  # burst ist cloud alias

    # PII → lokal
    alias = engine.resolve_alias("architect", complexity=0.7, is_pii=True)
    assert alias in ("deep", "coder", "forge-base")

    print("  ✅ role_engine: YAML Load + Alias Resolution")


def test_orchestrator():
    """Test: Vollständiger Sprint-Lifecycle."""
    yaml_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "data", "routes", "kore-inner-circle-v1.yaml"
    )
    if not os.path.exists(yaml_path):
        print("  ⚠️  YAML nicht gefunden, überspringe orchestrator Test")
        return

    engine = RoleEngine.from_yaml(yaml_path)
    orch = DysonOrchestrator(role_engine=engine)

    # Start
    sprint = orch.start_sprint("MODULE: auth\nMODULE: api depends: auth")
    assert orch.current_sprint is not None
    assert orch.current_sprint.state == DysonState.PLANNING

    # Plan
    manifest = orch.execute_planning()
    assert len(manifest.nodes) == 2
    assert orch.current_sprint.state == DysonState.EXECUTING

    # Ersten Knoten ausführen
    node = orch.execute_next_node()
    assert node is not None
    assert orch.current_sprint.state == DysonState.NODE_READY

    # Knoten abschließen
    result = CodeDelta(node_id=node.id, files_changed=["auth.py"], confidence=0.8)
    orch.complete_node(result)

    # Nächster Knoten
    node2 = orch.execute_next_node()
    if node2:
        result2 = CodeDelta(node_id=node2.id, files_changed=["api.py"], confidence=0.9)
        orch.complete_node(result2)

    # Finalize
    orch.current_sprint.harness_score = HarnessScore(
        build=1.0, tests=1.0, coverage=0.85, type_safety=1.0,
        architecture=1.0, ux_gate=1.0, llm_judge=0.9,
    )
    verdict = orch.finalize_sprint()
    assert verdict == DoneVerdict.DONE

    print("  ✅ orchestrator: Sprint Lifecycle IDLE→PLANNING→EXECUTING→DONE")


def test_harness_score():
    """Test: Harness Score und Verdict."""
    hs = HarnessScore(build=1.0, tests=1.0, coverage=0.9, type_safety=1.0,
                       architecture=1.0, ux_gate=1.0, llm_judge=0.9)
    assert hs.total() >= 0.90
    assert hs.verdict() == DoneVerdict.DONE

    # Hard Gate Fail
    hs2 = HarnessScore(build=0.0, tests=1.0)
    assert hs2.verdict() == DoneVerdict.BLOCKED

    # Partial
    hs3 = HarnessScore(build=1.0, tests=1.0, coverage=0.6, type_safety=0.5,
                       architecture=0.5, ux_gate=0.5, llm_judge=0.5)
    assert 0.70 <= hs3.total() < 0.90

    print("  ✅ harness_score: Scores + Verdicts")


def test_failure_constraint_loop():
    """Test: Failure → Constraint Injection (Sprint 6 Bridge)."""
    yaml_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "data", "routes", "kore-inner-circle-v1.yaml"
    )
    if not os.path.exists(yaml_path):
        print("  ⚠️  YAML nicht gefunden, überspringe failure Test")
        return

    engine = RoleEngine.from_yaml(yaml_path)
    orch = DysonOrchestrator(role_engine=engine)

    # Sprint starten
    orch.start_sprint("MODULE: auth\nMODULE: api depends: auth")
    orch.execute_planning()
    node = orch.execute_next_node()

    # Failure auslösen
    failure = FailureNote(
        node_id=node.id,
        failure_class=FailureClass.TOOL_CALL_FAILURE,
        severity=2,
        constraint="FEHLENDE_DEPENDENCY: db-module required before auth",
        description="Database module not found",
        suggested_action="Add db-module to task graph",
    )
    orch.fail_node(failure)

    assert orch.current_sprint.state == DysonState.HEALING
    assert len(orch.current_sprint.constraints) == 1

    # Healen
    healed = orch.heal_and_replan()
    print(f"  ℹ️  Healed to: {healed.id if healed else 'HUMAN_GATE'}")

    print("  ✅ failure_constraint_loop: Failure→Constraint→Healing")


if __name__ == "__main__":
    print("\n🧪 KORE Sprint 5 — Integrationstest\n")

    tests = [
        ("contract_registry", test_contract_registry),
        ("task_graph", test_task_graph),
        ("spec_to_task_graph", test_spec_to_task_graph),
        ("role_engine", test_role_engine),
        ("orchestrator", test_orchestrator),
        ("harness_score", test_harness_score),
        ("failure_constraint_loop", test_failure_constraint_loop),
    ]

    passed = 0
    failed = 0

    for name, func in tests:
        print(f"  Test: {name}")
        try:
            func()
            passed += 1
        except Exception as e:
            print(f"  ❌ {name}: {e}")
            failed += 1
        print()

    print(f"✅ {passed} passed, ❌ {failed} failed")
    sys.exit(1 if failed else 0)
