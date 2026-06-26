import pathlib
lines = pathlib.Path(r'C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\src\renderer\components\ChatPanel\MessageList.tsx').read_text().splitlines()
for i in range(394, min(400, len(lines))):
    print(f'{i+1}: {lines[i]!r}')
