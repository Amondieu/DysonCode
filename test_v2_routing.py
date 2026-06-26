"""Test KORE v2 Cloud-First Routing Integration."""
import sys
import os

# Import from KORE kernel
sys.path.insert(0, r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\kore')

from role_engine import RoleEngine, RoutingMode

print("=== KORE v2 Cloud-First Routing Test ===")

# Test 1: RoleEngine lädt v2-YAML
yaml_path = r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\data\routes\kore-inner-circle-v2-cloud.yaml'
engine = RoleEngine.from_yaml(yaml_path)
assert engine.config.routing_mode == RoutingMode.CLOUD_FIRST
print("[OK] v2 YAML geladen, routing_mode=cloud_first")

# Test 2: Memory Keeper immer lokal
alias = engine.resolve_alias("memory_keeper", complexity=1.0, is_pii=False)
assert alias == "fast-draft", f"Expected fast-draft, got {alias}"
print(f"[OK] Memory Keeper = {alias} (immer lokal)")

# Test 3: Cloud-First Architect
alias = engine.resolve_alias("architect", complexity=0.7, is_pii=False)
assert alias in ("burst", "mid", "frontier"), f"Expected cloud alias, got {alias}"
print(f"[OK] Architect (high complexity) = {alias} (cloud-first)")

# Test 4: Builder chain
alias = engine.resolve_alias("builder", complexity=0.5, is_pii=False)
print(f"[OK] Builder = {alias}")

# Test 5: PII -> local fallback
alias = engine.resolve_alias("builder", complexity=0.7, is_pii=True)
assert alias in ("forge-base", "coder", "deep"), f"Expected local on PII, got {alias}"
print(f"[OK] Builder (PII) = {alias} (fail-closed)")

# Test 6: Hybrid-local mode (default) -> lokales Modell ohne cloud_burst
engine_hl = RoleEngine.from_yaml(yaml_path)
engine_hl.config.routing_mode = RoutingMode.HYBRID_LOCAL
alias = engine_hl.resolve_alias("architect", complexity=0.5, is_pii=False)
print(f"[OK] Hybrid-local Architect = {alias}")

# Test 7: Alle 5 Rollen resolvable
for role in ["architect", "builder", "critic", "tester", "memory_keeper"]:
    a = engine.resolve_alias(role)
    assert a, f"Empty alias for {role}"
    print(f"  Rolle {role:15s} -> {a}")

# Test 8: smoke test - swarm.py resolve_kore_alias works
sys.path.insert(0, r'C:\Users\Shadow\ShadowDrive\0.1.Ai\Grey-OS')
from agents.swarm import resolve_kore_alias, KORE_CLOUD_FIRST_ALIASES, MEMORY_KEEPER_ROLES

alias_mem = resolve_kore_alias("memory_keeper")
assert alias_mem == "fast-draft"
print(f"[OK] swarm.resolve_kore_alias('memory_keeper') = {alias_mem}")

# Nur testen wenn cloud_burst aktiv
import os as _os
was_burst = _os.environ.get("GREYOS_CLOUD_BURST", "0")
_os.environ["GREYOS_CLOUD_BURST"] = "1"

alias_arch = resolve_kore_alias("architect", complexity=0.7)
print(f"[OK] swarm.resolve_kore_alias('architect', c=0.7) = {alias_arch}")

alias_build = resolve_kore_alias("builder", complexity=0.5)
print(f"[OK] swarm.resolve_kore_alias('builder', c=0.5) = {alias_build}")

_os.environ["GREYOS_CLOUD_BURST"] = was_burst

print()
print("=== ALL TESTS PASSED ===")
