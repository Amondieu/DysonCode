import py_compile
try:
    py_compile.compile(
        r'C:\Users\Shadow\ShadowDrive\0.1.Ai\Grey-OS\agents\swarm.py',
        doraise=True
    )
    print('Syntax OK')
except py_compile.PyCompileError as e:
    print(f'Syntax Error: {e}')
