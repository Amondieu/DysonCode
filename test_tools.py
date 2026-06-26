"""Integrationstest: Alle Tool-Master-Map Tools prüfen."""
import sys, subprocess, importlib, os

TOOLS_PHASE1 = {
    "langgraph": ("langgraph.graph", "StateGraph"),
    "openhands": ("openhands", None),
    "ag2": ("autogen", None),
    "networkx": ("networkx", "DiGraph"),
    "pydantic_ai": ("pydantic_ai", "Agent"),
    "aider_chat": ("aider", None),
    "langgraph_viz": ("langgraph_viz", None),
}

TOOLS_PHASE2 = {
    "z3": ("z3", "Solver"),
    "qdrant_client": ("qdrant_client", "QdrantClient"),
}

TOOLS_PHASE3 = {
    "black": ("black", None),
    "mypy": ("mypy", None),
    "pytest": ("pytest", None),
    "bandit": ("bandit", None),
    "playwright": ("playwright", "sync_api"),
}

TOOLS_PHASE4 = {
    "fastapi": ("fastapi", "FastAPI"),
    "uvicorn": ("uvicorn", None),
}

PASS = 0
FAIL = 0

def check(name, module_path, symbol=None):
    global PASS, FAIL
    try:
        mod = importlib.import_module(module_path)
        if symbol and not hasattr(mod, symbol):
            raise ImportError(f"{module_path} has no {symbol}")
        print(f"  [OK] {name:25s} -> {module_path}.{symbol or '*'}")
        PASS += 1
    except Exception as e:
        if "No module named" in str(e):
            print(f"  [--] {name:25s} -> nicht installiert")
        else:
            print(f"  [??] {name:25s} -> {e}")
        FAIL += 1

print("== Tool-Master-Map: Installation Check ==\n")

print("Phase 1 — Orchestration:")
for name, (mod, sym) in TOOLS_PHASE1.items():
    check(name, mod, sym)

print("\nPhase 2 — Memory & Constraints:")
for name, (mod, sym) in TOOLS_PHASE2.items():
    check(name, mod, sym)

print("\nPhase 3 — Quality Gates:")
for name, (mod, sym) in TOOLS_PHASE3.items():
    check(name, mod, sym)

print("\nPhase 4 — Mission Control UI:")
for name, (mod, sym) in TOOLS_PHASE4.items():
    check(name, mod, sym)

# CLI-Tools prüfen
print("\nCLI Tools:")
cli_tools = {
    "black": ["black", "--version"],
    "mypy": ["mypy", "--version"],
    "pytest": ["pytest", "--version"],
    "bandit": ["bandit", "--version"],
    "node": ["node", "--version"],
    "npm": ["npm", "--version"],
}
for name, cmd in cli_tools.items():
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            print(f"  [OK] {name:25s} -> {r.stdout.strip()[:60]}")
            PASS += 1
        else:
            print(f"  [--] {name:25s} -> nicht verfuegbar")
            FAIL += 1
    except FileNotFoundError:
        print(f"  [--] {name:25s} -> nicht installiert")
        FAIL += 1

# KORE eigene Module
print("\nKORE Kernel (Eigenbau):")
kore_mods = [
    ("contract_registry", "ContractRegistry"),
    ("task_graph", "TaskGraph"),
    ("role_engine", "RoleEngine"),
    ("orchestrator", "DysonOrchestrator"),
    ("failure_classifier", "FailureClassifier"),
    ("constraint_store", "ConstraintStore"),
    ("dyson_road", "replan"),
    ("constraint_injector", "ConstraintInjector"),
    ("replanner", "Replanner"),
    ("harness_engine", "HarnessEngine"),
    ("done_gate", "DoneGate"),
    ("execution.adapter", "ToolCall"),
    ("execution.openhands_backend", "MockOpenHandsBackend"),
    ("execution.builder_session", "BuilderSession"),
    ("ui.events", "KOREEvent"),
    ("ui.mission_control", "KOREMissionControl"),
]
sys.path.insert(0, r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\kore')
for name, sym in kore_mods:
    check(f"kore.{name}", name, sym)

total = PASS + FAIL
print(f"\n== Ergebnis: {PASS}/{total} OK, {FAIL}/{total} nicht verfuegbar ==")
