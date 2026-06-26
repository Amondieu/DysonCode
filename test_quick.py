import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kore'))

print("Starting Sprint 5 tests...", flush=True)

from contract_registry import *
print("  imports: contract_registry", flush=True)

# Test 1
reg = ContractRegistry()
c = InterfaceContract(module_id="test", module_name="Test", description="x")
reg.register(c)
assert reg.get("test") is not None
reg.freeze("test")
assert reg.is_frozen("test")
try:
    reg.register(c)
    assert False
except RuntimeError:
    pass
print("  [OK] contract_registry", flush=True)

# Test 2
manifest = BuildManifest(sprint_id="test", spec_summary="x")
manifest.nodes = {
    "a": TaskNode(id="a", title="A", risk_score=0.1, progress_gain=0.9, context_retention=0.9),
    "b": TaskNode(id="b", title="B", depends_on=["a"], risk_score=0.3, progress_gain=0.7),
}
manifest.edges = [TaskEdge(source="a", target="b")]
from task_graph import TaskGraph
tg = TaskGraph.from_manifest(manifest)
levels = tg.topological_generations()
assert len(levels) == 2
assert "a" in levels[0]
assert "b" in levels[1]
print("  [OK] task_graph", flush=True)

# Test 3
score = HarnessScore(build=1.0, tests=1.0, coverage=0.9, type_safety=1.0,
                     architecture=1.0, ux_gate=1.0, llm_judge=0.9)
assert score.total() >= 0.90
assert score.verdict() == DoneVerdict.DONE
print("  [OK] harness_score", flush=True)

# Test 4 - Full orchestrator
from role_engine import RoleEngine, RoutingMode, RoleConfig, RouteConfig
from orchestrator import DysonOrchestrator, DysonState

config = RouteConfig(
    name="test",
    routing_mode=RoutingMode.HYBRID_LOCAL,
    roles={
        "architect": RoleConfig(local="coder", cloud="burst"),
        "builder": RoleConfig(local="coder", cloud_primary="flash-k2"),
        "critic": RoleConfig(local="forge-base", cloud="flash-sn-think"),
        "tester": RoleConfig(local="micro-coder", cloud="judge"),
        "memory_keeper": RoleConfig(local="fast-draft", cloud_never=True),
    }
)
engine = RoleEngine(config)
orch = DysonOrchestrator(role_engine=engine)

sprint = orch.start_sprint("MODULE: auth\nMODULE: api depends: auth")
assert orch.current_sprint.state == DysonState.PLANNING
print("  [..] planning...", flush=True)

manifest = orch.execute_planning()
assert orch.current_sprint.state == DysonState.EXECUTING
print("  [..] executing...", flush=True)

node = orch.execute_next_node()
assert node is not None
print(f"  [..] Node: {node.id} (score: {node.dyson_road_score:.3f})", flush=True)

result = CodeDelta(node_id=node.id, files_changed=["auth.py"], confidence=0.8)
orch.complete_node(result)

node2 = orch.execute_next_node()
if node2:
    result2 = CodeDelta(node_id=node2.id, files_changed=["api.py"], confidence=0.9)
    orch.complete_node(result2)

# Finalize
orch.current_sprint.harness_score = score
verdict = orch.finalize_sprint()
assert verdict == DoneVerdict.DONE
print("  [OK] orchestrator: IDLE->PLANNING->EXECUTING->DONE", flush=True)

# Test 5 - Failure loop
from contract_registry import FailureNote, FailureClass
orch2 = DysonOrchestrator(role_engine=engine)
orch2.start_sprint("MODULE: auth")
orch2.execute_planning()
n = orch2.execute_next_node()

failure = FailureNote(
    node_id=n.id, failure_class=FailureClass.TOOL_CALL_FAILURE,
    severity=2, constraint="DB_REQUIRED", description="db missing",
)
orch2.fail_node(failure)
assert orch2.current_sprint.state == DysonState.HEALING
assert len(orch2.current_sprint.constraints) == 1
print("  [OK] failure->constraint->healing", flush=True)

print("\n*** ALL SPRINT 5 TESTS PASSED ***", flush=True)
