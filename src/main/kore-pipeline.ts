/**
 * Kore Python Pipeline Bridge — spawns Python subprocess to run kore analysis stages.
 *
 * Handlers:
 *   kore:pipeline  — runs full 5-stage pipeline on text input
 *   kore:precheck  — runs PreCheck invariant gates on text input
 *
 * Falls back gracefully if Python is not available.
 * Uses temp file + exec to avoid shell escaping issues.
 */

import { ipcMain } from 'electron';
import { exec, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let pythonAvailable: boolean | null = null;

/**
 * Check if Python 3 is available on PATH.
 */
function checkPython(): boolean {
  if (pythonAvailable !== null) return pythonAvailable;
  try {
    execSync('python --version', { timeout: 3000 });
    pythonAvailable = true;
  } catch {
    try {
      execSync('python3 --version', { timeout: 3000 });
      pythonAvailable = true;
    } catch {
      pythonAvailable = false;
    }
  }
  return pythonAvailable;
}

/**
 * Execute a Python snippet that imports kore modules and returns JSON on stdout.
 * Uses a temp file for the script to avoid shell escaping issues.
 */
function runPythonScript(script: string, timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `kore_pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`
    );
    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');
      const pythonCmd = 'python';
      exec(`${pythonCmd} "${tmpFile}"`, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch {}
        if (err && !stdout) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    } catch (e) {
      try { fs.unlinkSync(tmpFile); } catch {}
      reject(e);
    }
  });
}

export function registerPipelineHandlers() {
  // ── kore:precheck — Run PreCheck invariant gates ──────────────────────
  ipcMain.handle('kore:precheck', async (_e: any, input: { text: string; repoPath?: string }) => {
    if (!checkPython()) {
      return { ok: false, error: 'Python not available on PATH' };
    }

    const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.resolve(__dirname, '../../kore'))})
try:
    from jcode_precheck import run_precheck
    result = run_precheck({"text": ${JSON.stringify(input.text.slice(0, 2000))}})
    print(json.dumps({"ok": True, "passed": result.passed, "gates": result.gates}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;

    try {
      const stdout = await runPythonScript(script);
      return JSON.parse(stdout);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // ── kore:pipeline — Run full 5-stage pipeline ─────────────────────────
  ipcMain.handle('kore:pipeline', async (_e: any, input: { text: string; repoPath?: string }) => {
    if (!checkPython()) {
      return { ok: false, error: 'Python not available on PATH' };
    }

    const script = `
import sys, json, time
sys.path.insert(0, ${JSON.stringify(path.resolve(__dirname, '../../kore'))})
try:
    from jcode_pipeline import run_pipeline
    from jcode_models import PreCheckResult
    t0 = time.time()
    precheck = PreCheckResult(passed=True, gates=[], score=1.0)
    result = run_pipeline({"text": ${JSON.stringify(input.text.slice(0, 2000))}}, precheck)
    elapsed = round((time.time() - t0) * 1000, 2)
    stages = []
    for s in result.stages:
        stages.append({
            "name": s.name.value if hasattr(s.name, "value") else str(s.name),
            "passed": s.passed,
            "score": s.score,
            "details": s.details[:200] if s.details else ""
        })
    print(json.dumps({
        "ok": True,
        "passed": result.passed,
        "fixpoint_passed": result.fixpoint_passed,
        "latency_ms": elapsed,
        "stages": stages,
        "fixpoint": {
            "score": result.fixpoint.score if result.fixpoint else None,
            "iterations": result.fixpoint.iterations if result.fixpoint else None
        }
    }))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;

    try {
      const stdout = await runPythonScript(script, 60000);
      return JSON.parse(stdout);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
