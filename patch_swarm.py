"""Patch swarm.py: add KORE cloud-first aliases and constants."""
import sys

SWARM_PATH = r"C:\Users\Shadow\ShadowDrive\0.1.Ai\Grey-OS\agents\swarm.py"

with open(SWARM_PATH, 'r') as f:
    content = f.read()

OLD = (
    'CLOUD_BURST_ALIASES = frozenset({"burst", "fast", "flash"})\n'
    'LOCAL_ONLY_ALIASES = frozenset({"deep", "sage", "researcher", "scholar"})\n'
    'CLOUD_MAP: dict[str, str] = {\n'
    '    "coder": "burst",\n'
    '    "creative": "flash",\n'
    '    "researcher": "fast",\n'
    '}'
)

NEW = (
    'CLOUD_BURST_ALIASES = frozenset({"burst", "fast", "flash", "flash-k2", "mid",\n'
    '                                 "joker", "judge", "flash-sn-think", "frontier",\n'
    '                                 "critic-frontier", "abacus-free-c", "abacus-free-d",\n'
    '                                 "abacus-free-f"})\n'
    'LOCAL_ONLY_ALIASES = frozenset({"deep", "sage", "researcher", "scholar", "fast-draft"})\n'
    'CLOUD_MAP: dict[str, str] = {\n'
    '    "coder": "burst",\n'
    '    "creative": "flash",\n'
    '    "researcher": "fast",\n'
    '}\n'
    '\n'
    '# KORE Cloud-First Routing (v2)\n'
    'KORE_CLOUD_FIRST_ALIASES: dict[str, list[str]] = {\n'
    '    "architect":   ["burst", "mid", "frontier", "deep", "coder"],\n'
    '    "builder":     ["flash-k2", "mid", "abacus-free-c", "burst", "forge-base"],\n'
    '    "critic":      ["flash-sn-think", "critic-frontier", "joker", "forge-base"],\n'
    '    "tester":      ["judge", "abacus-free-d", "micro-coder"],\n'
    '    "memory_keeper": ["fast-draft"],\n'
    '}\n'
    '\n'
    'MEMORY_KEEPER_ROLES = frozenset({"memory_keeper"})'
)

if OLD not in content:
    print("ERROR: OLD block not found in file!")
    sys.exit(1)

content = content.replace(OLD, NEW)

with open(SWARM_PATH, 'w') as f:
    f.write(content)

print("Patched swarm.py successfully")
