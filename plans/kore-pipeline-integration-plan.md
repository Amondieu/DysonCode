# Kore Python Pipeline Integration Plan

## Current State vs. Target

| Layer | Currently | Target |
|---|---|---|
| LLM agent loop | ✅ Working (callLLM → parseDSML → runTool → loop) | Same, unchanged |
| Electron IPC fallback | ✅ Working | Same, unchanged |
| kore-exec Rust binary | ✅ Working (ENOENT fallback active) | Same, unchanged |
| kore Python pipeline | ❌ Never called | Spawn as subprocess, show stage results as badges |
| Memory graph | ❌ Never used | Track turns, inject hot nodes as context |

## Architecture — Python Subprocess Bridge

```
JcodePanel
  ├─ [tool loop] ──► runTool() ──► kore-exec (Rust) / IPC fallback
  ├─ [precheck] ──► python:precheck ──► python kore/jcode_precheck.py
  ├─ [pipeline] ──► python:pipeline ──► python kore/jcode_pipeline.py
  └─ [memory]   ──► memory:*          ──► SQLite/JSON store
```

Python is spawned as a subprocess (like kore-exec). JSON on stdin, JSON on stdout. Graceful fallback if Python isn't available.

## Files to Create (2)

### 1 — [`src/main/kore-pipeline.ts`](src/main/kore-pipeline.ts) ⬤ NEW

IPC handlers for Python subprocess:

```typescript
// kore:pipeline input: { text: string, repoPath?: string }
// kore:pipeline output: { ok: boolean, stages: StageResult[], latencyMs: number }
//
// Actually spawns: python -c "import sys,json;sys.path.insert(0,'kore');from kore.jcode_pipeline import run_pipeline; ..."

ipcMain.handle('kore:pipeline', async (_, input) => { ... });
ipcMain.handle('kore:precheck', async (_, input) => { ... });
```

- Checks `python --version` on first call
- Writes input JSON to temp file (avoids shell escaping issues)
- Spawns `python` with inline script that imports kore modules
- Reads stdout JSON, returns to renderer
- Falls back: `{ ok: false, error: 'Python not available' }`

### 2 — [`src/main/kore-memory.ts`](src/main/kore-memory.ts) ⬤ NEW

IPC handlers for memory graph (lightweight JSON store — no Python needed):

```typescript
// memory:storeNode — stores a memory node (turn, decision, etc.)
// memory:getHotNodes — returns recent hot/warm nodes for context
// memory:clearSession — clears memory for new session

ipcMain.handle('memory:storeNode', async (_, node) => { ... });
ipcMain.handle('memory:getContext', async (_, sessionId) => { ... });
```

- Backed by existing SQLite DB (reuses `kore/memory/persistent_store.py` concepts but in TS)
- Or simpler: JSON file `memory.json` in workspace root

## Files to Modify (3)

### 3 — [`src/main/ipc-handlers.ts`](src/main/ipc-handlers.ts) ⬤ MODIFY

Register the new handlers:

```typescript
import { registerPipelineHandlers } from './kore-pipeline';
import { registerMemoryHandlers } from './kore-memory';

// Inside registerIpcHandlers():
registerPipelineHandlers();
registerMemoryHandlers();
```

### 4 — [`src/main/preload.ts`](src/main/preload.ts) ⬤ MODIFY

Add new bridge methods:

```typescript
const pipelineShim = {
  run: (input) => ipcRenderer.invoke('kore:pipeline', input),
  precheck: (input) => ipcRenderer.invoke('kore:precheck', input),
  memory: {
    store: (node) => ipcRenderer.invoke('memory:storeNode', node),
    getContext: (sessionId) => ipcRenderer.invoke('memory:getContext', sessionId),
  },
};
contextBridge.exposeInMainWorld('pipeline', pipelineShim);
```

### 5 — [`src/renderer/components/JcodePanel.tsx`](src/renderer/components/JcodePanel.tsx) ⬤ MODIFY

Add pipeline badges to the streaming UI:

- Before agent loop starts: call `precheck` → show badge with stages
- After agent loop completes: call `pipeline` → show badges
- Memory injection: load hot nodes via `memory.getContext` → prepend to LLM context

Pipeline badge type (reuses existing ToolBadge pattern):

```typescript
interface PipelineStage {
  name: string;        // Manifold Detection, Gap Geometry, etc.
  passed: boolean;
  score: number;
  details: string;
}
```

The badge appears as a special "pipeline" tool call badge with the Φ icon.

## Dependency

Requires Python 3.x with kore dependencies:
```
pip install pydantic fastapi uvicorn  # optional — only needed for mission_control
```

The base pipeline modules (`jcode_pipeline.py`, `jcode_models.py`, `jcode_precheck.py`) use only stdlib imports — no external deps!

## Execution Order

1. Create `src/main/kore-pipeline.ts` — Python subprocess bridge
2. Create `src/main/kore-memory.ts` — Lightweight memory store  
3. Modify `src/main/ipc-handlers.ts` — Register handlers
4. Modify `src/main/preload.ts` — Expose APIs
5. Modify `src/renderer/components/JcodePanel.tsx` — Wire into agent loop
6. Rebuild + repackage
7. Test: run a task, verify pipeline badges appear

## Non-breaking

- If Python not available: `precheck` returns `{ ok: false }` badges, agent loop continues
- If memory store fails: empty context, agent loop continues
- All existing functionality (LLM loop, tool badges, kore-exec) unchanged
