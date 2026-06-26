# 🍒 Cherry-Pick Build — restored-base

Dieser Ordner enthält Informationen zum **restored-base Build**.

## 📦 Die .exe

Die **ausführbare Datei** liegt lokal unter:
```
cherry-pick/DysonCode-restored-base.exe
```

> ⚠️ Die .exe ist ~189 MB groß und kann nicht auf GitHub hochgeladen werden (Limit: 100 MB).
> Sie liegt nur **lokal** auf deinem Rechner.

## 🚀 Ausführen

**Direkt (ohne Installation):**
```
cherry-pick\DysonCode-restored-base.exe
```

**Oder via Git (wenn Source geändert wurde):**
```bash
git checkout restored-base
npm install
npm run build
npx electron-builder --dir
```
Dann liegt die .exe unter `release\win-unpacked\DysonCode.exe`

## 🧪 Was wird getestet?

Dieser Build basiert auf dem ursprünglichen Stand (**Tailwind v3**, **Electron v33**, **electron-builder**) mit selektiv übernommenen UI-Fixes aus späteren Commits.

Im Vergleich zu `master`:
- **Kein** Tailwind v4 Upgrade (keine Breaking CSS Changes)
- **Kein** Electron v42 Upgrade
- **electron-builder** Config intakt
- **tsconfig paths** (`@/*`, `@renderer/*`) funktionieren

## Build-Info

Siehe [`BUILD_INFO.txt`](./BUILD_INFO.txt) für Timestamp und Details.
