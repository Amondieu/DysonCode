@echo off
cd /d C:\Users\Shadow\ShadowDrive\0.1.Ai\Grey-OS

python -c "
lines = open('agents/swarm.py', 'r').readlines()
new = []
skip_until = None
for i, line in enumerate(lines):
    if line.startswith('CLOUD_BURST_ALIASES'):
        new.append('CLOUD_BURST_ALIASES = frozenset({\"burst\", \"fast\", \"flash\", \"flash-k2\", \"mid\",\n')
        new.append('                                 \"joker\", \"judge\", \"flash-sn-think\", \"frontier\",\n')
        new.append('                                 \"critic-frontier\", \"abacus-free-c\", \"abacus-free-d\",\n')
        new.append('                                 \"abacus-free-f\"})\n')
        new.append('LOCAL_ONLY_ALIASES = frozenset({\"deep\", \"sage\", \"researcher\", \"scholar\", \"fast-draft\"})\n')
        new.append('CLOUD_MAP: dict[str, str] = {\n')
        new.append('    \"coder\": \"burst\",\n')
        new.append('    \"creative\": \"flash\",\n')
        new.append('    \"researcher\": \"fast\",\n')
        new.append('}\n')
        new.append('\n')
        new.append('# KORE Cloud-First Routing (v2)\n')
        new.append('KORE_CLOUD_FIRST_ALIASES: dict[str, list[str]] = {\n')
        new.append('    \"architect\":   [\"burst\", \"mid\", \"frontier\", \"deep\", \"coder\"],\n')
        new.append('    \"builder\":     [\"flash-k2\", \"mid\", \"abacus-free-c\", \"burst\", \"forge-base\"],\n')
        new.append('    \"critic\":      [\"flash-sn-think\", \"critic-frontier\", \"joker\", \"forge-base\"],\n')
        new.append('    \"tester\":      [\"judge\", \"abacus-free-d\", \"micro-coder\"],\n')
        new.append('    \"memory_keeper\": [\"fast-draft\"],\n')
        new.append('}\n')
        new.append('\n')
        new.append('MEMORY_KEEPER_ROLES = frozenset({\"memory_keeper\"})\n')
        skip_until = 142
        continue
    if skip_until and i < skip_until:
        continue
    new.append(line)

open('agents/swarm.py', 'w').writelines(new)
print('Patched successfully')
"
