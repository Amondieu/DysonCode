import sys
path = r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\kore\role_engine.py'
with open(path) as f:
    lines = f.readlines()
# Zeile 192 (Index 191): cloud_never
lines[191] = '                cloud_never=role_data.get("cloud", "") == "never"\n'
# Zeile 180 (Index 179): local
lines[179] = '                local=role_data.get("local") or role_data.get("local_only", "coder"),\n'
with open(path, 'w') as f:
    f.writelines(lines)
print('Patched OK')
