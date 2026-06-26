path = r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\kore\role_engine.py'
with open(path) as f:
    lines = f.readlines()
lines[191] = '                cloud_never=role_data.get("cloud", "") == "never" or role_data.get("local_only", "") != "",\n'
with open(path, 'w') as f:
    f.writelines(lines)
print('Fixed')
