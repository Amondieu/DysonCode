"""Patch role_engine.py: support v2 YAML format (local_only, cloud: never)."""
with open(r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\kore\role_engine.py', 'r') as f:
    content = f.read()

old = (
    '                cloud_never=role_data.get("cloud", "never") == "never",\n'
    '                local=role_data.get("local", "coder"),'
)
new = (
    '                cloud_never=role_data.get("cloud", "") == "never"\n'
    '                           or role_data.get("local_only", "") != "",\n'
    '                local=role_data.get("local") or role_data.get("local_only", "coder"),'
)

if old not in content:
    print("ERROR: old block not found!")
    print(f"Looking for: {repr(old[:50])}")
    sys.exit(1)

content = content.replace(old, new)

with open(r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\kore\role_engine.py', 'w') as f:
    f.write(content)

print("Patched role_engine.py OK")
