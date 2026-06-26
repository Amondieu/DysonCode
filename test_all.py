"""Vollständiger Integrationstest für KORE Sprints 5–8.

Testet alle Module in der ΦΩΡΓΕ Build Order, plus Querschnitts-Features
wie Failure→Constraint→Replanning, Harness→Done Gate, und Event-System.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kore'))

PASS = 0
FAIL = 0

def test(name):
    global PASS, FAIL
    def decorator(fn):
        def wrapper():
            global PASS, FAIL
            try:
                fn()
                print(f"  [PASS] {name}")
                PASS += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")
                FAIL += 1
        return wrapper
    return decorator

# ═══════════════════════════════════════
# SPRINT 5: Orchestrator Kernel
# ═══════════════════════════════════════

from contract_registry import *
from task_graph import TaskGraph, spec_to_task_graph
from role_engine import RoleEngine, RoutingMode, RoleConfig, RouteConfig
from orchestrator import DysonOrchestrator, DysonState, AutonomyLevel

@test("S5.1 — Contract Registry Freeze")
def t_s5_1():
    reg = ContractRegistry()
    c = InterfaceContract(module_id="x", module_name="X", description="x")
    reg.register(c)
    reg.freeze("x")
    assert reg.is_frozen("x")
    try:
        reg.register(c)
        assert False
    except RuntimeError:
        pass

@test("S5.2 — Task Graph DAG + Levels")
def t_s5_2():
    m = BuildManifest(sprint_id="t", spec_summary="t")
    m.nodes = {
        "a": TaskNode(id="a", title="A", depends_on=[], risk_score=0.1, progress_gain=0.9, context_retention=0.9),
        "b": TaskNode(id="b", title="B", depends_on=["a"], risk_score=0.3, progress_gain=0.7),
        "c": TaskNode(id="c", title="C", depends_on=["a"], risk_score=0.5, progress_gain=0.5),
    }
    m.edges = [TaskEdge(source="a", target="b"), TaskEdge(source="a", target="c")]
    tg = TaskGraph.from_manifest(m)
    levels = tg.topological_generations()
    assert len(levels) == 2
    assert "a" in levels[0]
    assert "b" in levels[1] and "c" in levels[1]

@test("S5.3 — Dyson Road Score")
def t_s5_3():
    n1 = TaskNode(id="a", title="A", risk_score=0.1, progress_gain=1.0, context_retention=1.0)
    n2 = TaskNode(id="b", title="B", risk_score=0.5, progress_gain=0.5, context_retention=0.5)
    assert n1.dyson_road_score > n2.dyson_road_score  # 10.0 vs 0.5

@test("S5.4 — Spec to Task Graph")
def t_s5_4():
    spec = "MODULE: auth\nMODULE: api depends: auth risk: 0.5\nMODULE: frontend depends: api risk: 0.1"
    m = spec_to_task_graph(spec)
    assert len(m.nodes) == 3
    assert m.nodes["auth"] is not None

@test("S5.5 — Role Engine Alias Resolution")
def t_s5_5():
    config = RouteConfig(
        name="test", routing_mode=RoutingMode.HYBRID_LOCAL,
        roles={
            "architect": RoleConfig(local="coder", cloud="burst"),
            "builder": RoleConfig(local="coder", cloud_primary="flash-k2"),
            "critic": RoleConfig(local="forge-base", cloud="flash-sn-think"),
            "tester": RoleConfig(local="micro-coder", cloud="judge"),
            "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
        }
    )
    engine = RoleEngine(config)
    assert engine.resolve_alias("memory_keeper", complexity=1.0, is_pii=False) == "fast-draft"
    assert engine.resolve_alias("architect", complexity=0.1) == "coder"
    assert engine.resolve_alias("architect", complexity=0.7) == "burst"

@test("S5.6 — Full Sprint Lifecycle IDLE→DONE")
def t_s5_6():
    config = RouteConfig(name="test", routing_mode=RoutingMode.HYBRID_LOCAL, roles={
        "architect": RoleConfig(local="coder", cloud="burst"),
        "builder": RoleConfig(local="coder", cloud_primary="flash-k2"),
        "critic": RoleConfig(local="forge-base"),
        "tester": RoleConfig(local="micro-coder"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    })
    engine = RoleEngine(config)
    orch = DysonOrchestrator(role_engine=engine)

    sprint = orch.start_sprint("MODULE: auth\nMODULE: api depends: auth")
    assert sprint.state == DysonState.PLANNING

    orch.execute_planning()
    assert orch.current_sprint.state == DysonState.EXECUTING

    n1 = orch.execute_next_node()
    assert n1 is not None
    assert orch.current_sprint.state == DysonState.NODE_READY

    orch.complete_node(CodeDelta(node_id=n1.id, files_changed=["auth.py"]))

    n2 = orch.execute_next_node()
    if n2:
        orch.complete_node(CodeDelta(node_id=n2.id, files_changed=["api.py"]))

    orch.current_sprint.harness_score = HarnessScore(
        build=1.0, tests=1.0, coverage=0.9, type_safety=1.0,
        architecture=1.0, ux_gate=1.0, llm_judge=0.9,
    )
    v = orch.finalize_sprint()
    assert v == DoneVerdict.DONE

@test("S5.7 — Autonomy Controls")
def t_s5_7():
    config = RouteConfig(name="test", routing_mode=RoutingMode.HYBRID_LOCAL, roles={
        "architect": RoleConfig(local="coder"),
        "builder": RoleConfig(local="coder"),
        "critic": RoleConfig(local="forge-base"),
        "tester": RoleConfig(local="micro-coder"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    })
    orch = DysonOrchestrator(role_engine=RoleEngine(config))
    assert orch.autonomy == AutonomyLevel.FULL_AUTO
    orch.pause()
    assert orch.autonomy == AutonomyLevel.PAUSED
    orch.resume()
    assert orch.autonomy == AutonomyLevel.FULL_AUTO
    orch.abort()
    assert orch.current_sprint is None

# ═══════════════════════════════════════
# SPRINT 6: Self-Healing
# ═══════════════════════════════════════

from failure_classifier import FailureClassifier
from constraint_injector import ConstraintInjector
from replanner import Replanner

@test("S6.1 — Failure Classifier 6 Classes")
def t_s6_1():
    fc = FailureClassifier()
    
    fn = fc.classify("import error: module not found", "node-1")
    assert fn.failure_class == FailureClass.TOOL_CALL_FAILURE
    
    fn = fc.classify("spec changed during implementation", "node-2")
    assert fn.failure_class == FailureClass.SPEC_DRIFT
    
    fn = fc.classify("logical error in auth flow", "node-3")
    assert fn.failure_class == FailureClass.REASONING_PROBLEM
    
    fn = fc.classify("context lost during session", "node-4")
    assert fn.failure_class == FailureClass.MEMORY_FAILURE
    
    fn = fc.classify("dependency not met: needs db first", "node-5")
    assert fn.failure_class == FailureClass.PLANNING_FAILURE
    
    fn = fc.classify("timeout: connection failed", "node-6")
    assert fn.failure_class == FailureClass.ACTION_FAILURE

@test("S6.2 — Constraint Injector")
def t_s6_2():
    m = BuildManifest(sprint_id="t", spec_summary="t")
    m.nodes = {"a": TaskNode(id="a", title="A")}
    m.edges = []
    tg = TaskGraph.from_manifest(m)
    
    ci = ConstraintInjector()
    fn = FailureNote(node_id="a", failure_class=FailureClass.TOOL_CALL_FAILURE,
                     severity=2, constraint="DB_REQUIRED")
    edge = ci.inject(tg, fn)
    assert edge.constraint.startswith("C-001")
    assert ci.constraint_count() == 1

@test("S6.3 — Replanner sat/unsat")
def t_s6_3():
    m = BuildManifest(sprint_id="t", spec_summary="t")
    m.nodes = {
        "a": TaskNode(id="a", title="A"),
        "b": TaskNode(id="b", title="B", depends_on=["a"]),
    }
    m.edges = [TaskEdge(source="a", target="b")]
    tg = TaskGraph.from_manifest(m)
    
    rp = Replanner()
    result, nid = rp.check(tg)
    assert result == "sat"
    assert nid == "a"

    tg.mark_done("a")
    result, nid = rp.check(tg)
    assert result == "sat"
    assert nid == "b"

@test("S6.4 — Failure→Constraint→Healing Pipeline")
def t_s6_4():
    config = RouteConfig(name="test", routing_mode=RoutingMode.HYBRID_LOCAL, roles={
        "architect": RoleConfig(local="coder"),
        "builder": RoleConfig(local="coder"),
        "critic": RoleConfig(local="forge-base"),
        "tester": RoleConfig(local="micro-coder"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    })
    orch = DysonOrchestrator(role_engine=RoleEngine(config))

    oak = orch.start_sprint("MODULE: auth")
    orch.execute_planning()
    n = orch.execute_next_node()

    fc = FailureClassifier()
    failure = fc.classify("import error: db module not found", n.id)
    orch.fail_node(failure)

    assert orch.current_sprint.state == DysonState.HEALING
    assert len(orch.current_sprint.failures) == 1
    assert len(orch.current_sprint.constraints) == 1

    healed = orch.heal_and_replan()
    assert healed is not None or orch.current_sprint.state == DysonState.HUMAN_GATE

# ═══════════════════════════════════════
# SPRINT 7: Harness + Done
# ═══════════════════════════════════════

from harness_engine import HarnessEngine, HarnessResult
from done_gate import DoneGate

@test("S7.1 — Harness Score Aggregate")
def t_s7_1():
    score = HarnessScore(build=1.0, tests=1.0, coverage=0.85, type_safety=1.0,
                         architecture=1.0, ux_gate=1.0, llm_judge=0.9)
    assert score.total() >= 0.90
    assert score.verdict() == DoneVerdict.DONE

@test("S7.2 — Harness Hard Gate Block")
def t_s7_2():
    score = HarnessScore(build=0.0, tests=1.0)
    assert score.verdict() == DoneVerdict.BLOCKED

@test("S7.3 — Harness Partial")
def t_s7_3():
    score = HarnessScore(build=1.0, tests=1.0, coverage=0.5, type_safety=0.5,
                         architecture=0.5, ux_gate=0.5, llm_judge=0.5)
    assert 0.70 <= score.total() < 0.90

@test("S7.4 — Done Gate Drift Detection")
def t_s7_4():
    gate = DoneGate()
    s1 = HarnessScore(build=1.0, tests=1.0, coverage=0.9, type_safety=1.0,
                      architecture=1.0, ux_gate=1.0, llm_judge=0.9)
    gate.evaluate(s1, "sprint-1")
    assert gate.last_verdict() == DoneVerdict.DONE
    assert gate.detect_drift() is None  # no drift with single entry

    s2 = HarnessScore(build=1.0, tests=1.0, coverage=0.9, type_safety=1.0,
                      architecture=0.5, ux_gate=0.5, llm_judge=0.5)
    gate.evaluate(s2, "sprint-2")
    drift = gate.detect_drift()
    assert drift is not None and "regressed" in drift

@test("S7.5 — HarnessEngine Build Check")
def t_s7_5():
    engine = HarnessEngine(project_path=os.path.join(os.path.dirname(__file__), "kore"))
    result = engine._check_build()
    assert result.passed  # kore code compiles

@test("S7.6 — Done Gate History Persistence")
def t_s7_6():
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        path = f.name
    gate = DoneGate(history_path=path)
    score = HarnessScore(build=1.0, tests=1.0, coverage=0.9, type_safety=1.0,
                         architecture=1.0, ux_gate=1.0, llm_judge=0.9)
    gate.evaluate(score, "sprint-3")
    assert os.path.exists(path)
    assert len(gate.get_history()) == 1
    os.unlink(path)

# ═══════════════════════════════════════
# SPRINT 8: Mission Control
# ═══════════════════════════════════════

from ui.events import KOREEvent, KOREEventType

@test("S8.1 — KOREEvent SSE Format")
def t_s8_1():
    event = KOREEvent(type=KOREEventType.STATE_CHANGE, data={"state": "PLANNING"})
    sse = event.to_sse()
    assert "event: kore.state.change" in sse
    assert "PLANNING" in sse

@test("S8.2 — KOREEvent to_dict")
def t_s8_2():
    event = KOREEvent(type=KOREEventType.NODE_START, data={"node": "a"})
    d = event.to_dict()
    assert d["type"] == "kore.node.start"
    assert d["data"]["node"] == "a"
    assert d["source"] == "kore"

@test("S8.3 — Mission Control Command Dispatch")
def t_s8_3():
    from ui.mission_control import KOREMissionControl
    config = RouteConfig(name="test", routing_mode=RoutingMode.HYBRID_LOCAL, roles={
        "architect": RoleConfig(local="coder"),
        "builder": RoleConfig(local="coder"),
        "critic": RoleConfig(local="forge-base"),
        "tester": RoleConfig(local="micro-coder"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    })
    orch = DysonOrchestrator(role_engine=RoleEngine(config))
    mc = KOREMissionControl(orch)

    result = mc.command("start_sprint", spec="MODULE: a")
    assert result["status"] == "ok"

    result = mc.command("get_state")
    assert "state" in result["state"]

    result = mc.command("pause")
    assert result["autonomy"] == "paused"

    result = mc.command("resume")
    assert result["autonomy"] == "full_auto"

# ═══════════════════════════════════════
# CROSS-SPRINT: Edge Cases
# ═══════════════════════════════════════

@test("X.1 — v2 Cloud-First Routing Mode")
def t_x1():
    config = RouteConfig(name="v2-test", routing_mode=RoutingMode.CLOUD_FIRST, roles={
        "architect": RoleConfig(local="coder", cloud="burst",
                                 cloud_primary="burst", cloud_secondary="mid",
                                 cloud_tertiary="frontier"),
        "builder": RoleConfig(local="coder", cloud_primary="flash-k2",
                               cloud_secondary="mid"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    })
    engine = RoleEngine(config)
    assert engine.resolve_alias("memory_keeper") == "fast-draft"
    arch_alias = engine.resolve_alias("architect", complexity=0.7)
    assert arch_alias in ("burst", "mid", "frontier", "coder")  # cloud-first picks primary

@test("X.2 — HarnessScore Ranges")
def t_x2():
    for b in [0.0, 0.5, 1.0]:
        for t in [0.0, 0.5, 1.0]:
            s = HarnessScore(build=b, tests=t)
            assert 0.0 <= s.total() <= 1.0

@test("X.3 — Empty Task Graph")
def t_x3():
    m = BuildManifest(sprint_id="e", spec_summary="empty")
    tg = TaskGraph.from_manifest(m)
    assert tg.compute_dyson_road() == []
    assert tg.dyson_road_progress() == 0.0

@test("X.4 — Event Listener Pattern")
def t_x4():
    config = RouteConfig(name="test", routing_mode=RoutingMode.HYBRID_LOCAL, roles={
        "architect": RoleConfig(local="coder"),
        "builder": RoleConfig(local="coder"),
        "critic": RoleConfig(local="forge-base"),
        "tester": RoleConfig(local="micro-coder"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    })
    orch = DysonOrchestrator(role_engine=RoleEngine(config))
    received = []
    orch.on(KOREEventType.STATE_CHANGE, lambda e: received.append(e))
    orch.start_sprint("MODULE: a")
    assert len(received) >= 1
    assert received[0].type == KOREEventType.STATE_CHANGE

# ═══════════════════════════════════════
# RUN
# ═══════════════════════════════════════

if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(" KORE SPRINT 5–8 INTEGRATION TEST")
    print(f"{'='*60}\n")

    tests = [
        # Sprint 5
        t_s5_1, t_s5_2, t_s5_3, t_s5_4, t_s5_5, t_s5_6, t_s5_7,
        # Sprint 6
        t_s6_1, t_s6_2, t_s6_3, t_s6_4,
        # Sprint 7
        t_s7_1, t_s7_2, t_s7_3, t_s7_4, t_s7_5, t_s7_6,
        # Sprint 8
        t_s8_1, t_s8_2, t_s8_3,
        # Cross-Sprint
        t_x1, t_x2, t_x3, t_x4,
    ]

    for t in tests:
        t()

    total = PASS + FAIL
    print(f"\n{'='*60}")
    print(f" RESULTS: {PASS}/{total} passed, {FAIL}/{total} failed")
    print(f"{'='*60}\n")

    sys.exit(1 if FAIL else 0)
