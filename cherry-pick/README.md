# 🍒 Cherry-Pick Build — restored-base

Dieser Ordner enthält einen **getesteten Build** des `restored-base` Branches.

## Was ist das?

Ein **selectiver Cherry-Pick** aus der Git-Historie:

- **Basis**: Commit [`b31db49`](https://github.com/Amondieu/DysonCode/commit/b31db49) `init-source-2026-06-26`
  - Tailwind v3.4.17 (statt v4)
  - Electron v33 (statt v42)
  - Original `electron-builder` Config
  - Original `tsconfig.json` mit Path-Aliases
- **Selektierte UI-Fixes** aus späteren Commits:
  - ChatPanel/MessageList scroll/layout fixes
  - Sidebar overflow fixes
  - FlowCanvas Syntax-Korrektur
  - DysonFrameModulator CSS fixes
  - Build-Skripte + app/ directory

## Build ausführen

```bash
git checkout restored-base
npm install
npm run build
npm start
```

## Build-Output

Der Build befindet sich in:
- `dist/renderer/` — React/Vite Frontend
- `dist/main/` — Electron Main + Preload

## Vergleich

| Aspekt | `master` | `restored-base` (dieser Build) |
|--------|----------|-------------------------------|
| Tailwind | v4.3.1 | **v3.4.17** |
| Electron | v42.x | **v33.x** |
| electron-builder | ❌ entfernt | **✅ vorhanden** |
| tsconfig paths | ❌ entfernt | **✅ @/*, @renderer/*, @main/*** |
| package build | ❌ fehlt | **✅ vollständig** |
| CSS Layout Patches | workarounds | **original + nur nötige Fixes** |
