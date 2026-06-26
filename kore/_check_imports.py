import sys
sys.path.insert(0, 'kore')

try:
    from contract_registry import HarnessScore, DoneVerdict
    print('contract_registry: OK')
except Exception as e:
    print(f'contract_registry: FAIL - {e}')

try:
    from task_graph import TaskGraph, spec_to_task_graph
    print('task_graph: OK')
except Exception as e:
    print(f'task_graph: FAIL - {e}')

try:
    from role_engine import RoleEngine, RoutingMode
    print('role_engine: OK')
except Exception as e:
    print(f'role_engine: FAIL - {e}')

try:
    from orchestrator import DysonOrchestrator, DysonState
    print('orchestrator: OK')
except Exception as e:
    print(f'orchestrator: FAIL - {e}')
