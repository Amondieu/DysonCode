
# DysonCode Tool Bridge Bootstrap
# Run this from: C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\
# PowerShell: Set-ExecutionPolicy Bypass -Scope Process; .\fix-toolbridge.ps1

$root = "C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode"
Set-Location $root

Write-Host "`n=== DysonCode Tool Bridge Bootstrap ===" -ForegroundColor Cyan

# ── 1. ipc-handlers.ts ──────────────────────────────────────────────────────
$ipcPath = "src\main\ipc-handlers.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $ipcPath) | Out-Null
@'
import { ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";

export function registerIpcHandlers() {
  ipcMain.handle("fs:readFile", async (_, filePath: string) => {
    try { return { ok: true, content: await fs.readFile(filePath, "utf-8") }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  });

  ipcMain.handle("fs:saveFile", async (_, filePath: string, content: string) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return { ok: true };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  });

  ipcMain.handle("fs:listDir", async (_, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return { ok: true, entries: entries.map(e => ({
        name: e.name, isDir: e.isDirectory(), path: path.join(dirPath, e.name)
      }))};
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  });

  ipcMain.handle("shell:exec", async (_, cmd: string) => {
    return new Promise(resolve => {
      exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, output: stdout || stderr || (err?.message ?? "") });
      });
    });
  });
}
'@ | Set-Content $ipcPath -Encoding UTF8
Write-Host "[OK] $ipcPath" -ForegroundColor Green

# ── 2. dsml-parser.ts ────────────────────────────────────────────────────────
$parserPath = "src\renderer\utils\dsml-parser.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $parserPath) | Out-Null
@'
export interface ToolCall { name: string; params: Record<string, string>; }
export interface Parsed { text: string; calls: ToolCall[]; }

export function parseDSML(raw: string): Parsed {
  const calls: ToolCall[] = [];
  const text = raw.replace(
    /<\|\|DSML\|\|tool_calls>([\s\S]*?)<\/\|\|DSML\|\|tool_calls>/g,
    (_, block) => {
      const inv = /<\|\|DSML\|\|invoke name="([^"]+)">([\s\S]*?)<\/\|\|DSML\|\|invoke>/g;
      const par = /<\|\|DSML\|\|parameter name="([^"]+)"[^>]*>([\s\S]*?)<\/\|\|DSML\|\|parameter>/g;
      let m: RegExpExecArray | null;
      while ((m = inv.exec(block)) !== null) {
        const params: Record<string,string> = {};
        let p: RegExpExecArray | null;
        const parCopy = new RegExp(par.source, par.flags);
        while ((p = parCopy.exec(m[2])) !== null) params[p[1]] = p[2].trim();
        calls.push({ name: m[1], params });
      }
      return "";
    }
  ).trim();
  return { text, calls };
}

export async function runTool(call: ToolCall): Promise<string> {
  const api = (window as any).api;
  try {
    if (call.name === "read") {
      const r = await api.readFile(call.params.filePath);
      return r.ok ? r.content : "ERROR: " + r.error;
    }
    if (call.name === "write") {
      const r = await api.saveFile(call.params.filePath, call.params.content);
      return r.ok ? "Written: " + call.params.filePath : "ERROR: " + r.error;
    }
    if (call.name === "list" || call.name === "listDir") {
      const r = await api.listDir(call.params.path ?? call.params.dirPath);
      return r.ok ? r.entries.map((e: any) => (e.isDir ? "[DIR] " : "[FILE] ") + e.name).join("\n") : "ERROR: " + r.error;
    }
    if (call.name === "shell") {
      const r = await api.shellExec(call.params.command ?? call.params.cmd);
      return r.output;
    }
    return "Unknown tool: " + call.name;
  } catch(e) { return "TOOL EXCEPTION: " + (e as Error).message; }
}
'@ | Set-Content $parserPath -Encoding UTF8
Write-Host "[OK] $parserPath" -ForegroundColor Green

# ── 3. Detect and patch main entry ──────────────────────────────────────────
$mainCandidates = @("src\main\index.ts","src\main\main.ts","src\main\index.js","src\main\main.js")
$mainFile = $mainCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($mainFile) {
  $content = Get-Content $mainFile -Raw
  if ($content -notmatch "registerIpcHandlers") {
    $import = 'import { registerIpcHandlers } from "./ipc-handlers";'
    $call   = '  registerIpcHandlers();'
    # Inject import at top
    $content = $import + "`n" + $content
    # Inject call inside whenReady
    $content = $content -replace '(app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{)', "`$1`n$call"
    Set-Content $mainFile $content -Encoding UTF8
    Write-Host "[OK] Patched $mainFile" -ForegroundColor Green
  } else {
    Write-Host "[SKIP] $mainFile already has registerIpcHandlers" -ForegroundColor Yellow
  }
} else {
  Write-Host "[WARN] Could not find main entry file - patch manually" -ForegroundColor Red
  Write-Host "       Add: import { registerIpcHandlers } from './ipc-handlers';" -ForegroundColor Yellow
  Write-Host "       And: registerIpcHandlers(); inside app.whenReady()" -ForegroundColor Yellow
}

# ── 4. Detect and patch preload ──────────────────────────────────────────────
$preloadCandidates = @("src\preload\index.ts","src\preload.ts","src\preload\preload.ts")
$preloadFile = $preloadCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($preloadFile) {
  $content = Get-Content $preloadFile -Raw
  if ($content -notmatch "readFile.*ipcRenderer") {
    $apiLines = @"
    readFile:  (p: string) => ipcRenderer.invoke("fs:readFile", p),
    saveFile:  (p: string, c: string) => ipcRenderer.invoke("fs:saveFile", p, c),
    listDir:   (p: string) => ipcRenderer.invoke("fs:listDir", p),
    shellExec: (cmd: string) => ipcRenderer.invoke("shell:exec", cmd),
"@
    # Insert before the closing of exposeInMainWorld object
    $content = $content -replace '(\}\s*\)\s*;?\s*$)', "$apiLines`n`$1"
    Set-Content $preloadFile $content -Encoding UTF8
    Write-Host "[OK] Patched $preloadFile" -ForegroundColor Green
  } else {
    Write-Host "[SKIP] $preloadFile already has readFile" -ForegroundColor Yellow
  }
} else {
  Write-Host "[WARN] Could not find preload file - add these 4 lines manually:" -ForegroundColor Red
  Write-Host '       readFile:  (p) => ipcRenderer.invoke("fs:readFile", p),' -ForegroundColor Yellow
  Write-Host '       saveFile:  (p,c) => ipcRenderer.invoke("fs:saveFile", p, c),' -ForegroundColor Yellow
  Write-Host '       listDir:   (p) => ipcRenderer.invoke("fs:listDir", p),' -ForegroundColor Yellow
  Write-Host '       shellExec: (cmd) => ipcRenderer.invoke("shell:exec", cmd),' -ForegroundColor Yellow
}

# ── 5. Verify ────────────────────────────────────────────────────────────────
Write-Host "`n=== File Check ===" -ForegroundColor Cyan
@($ipcPath, $parserPath) | ForEach-Object {
  if (Test-Path $_) { Write-Host "[EXISTS] $_" -ForegroundColor Green }
  else { Write-Host "[MISSING] $_" -ForegroundColor Red }
}

Write-Host "`n=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. If ChatPanel.tsx has not been updated yet: wrap send handler with parseDSML loop" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Open DevTools (Ctrl+Shift+I) and test:" -ForegroundColor White
Write-Host '   window.api.readFile("C:\\Users\\Shadow\\ShadowDrive\\0.1.Ai\\DysonCode\\core\\config.py").then(r=>console.log(r))' -ForegroundColor Yellow
Write-Host "`nDone." -ForegroundColor Cyan
