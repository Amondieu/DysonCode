# DysonCode — Full Implementation Plan
**Date**: 2026-06-24 00:18 CEST  
**Build**: `Cpm_pxx6`  
**Status**: 80% complete — 27 slices landed tonight  

---

## Phase 1: Persona Completion (P0 — Highest Leverage)

The Inner Circle has 5 roles defined in `BuildDocs/IdevaPersonas.md`. Only Architect (ROLLE I) and Reviewer (ROLLE II) are harvested and injected into the prompt chain. Three personas remain.

### Slice 1.1 — Builder Persona (ROLLE III)
**File**: `src/main/repo-context.ts`  
**Pattern**: Identical to Architect/Reviewer harvesting.

```typescript
// Add 'builderPersona' field to RepoContextSnapshot
// Extract: ROLLE III — DER BUILDER section from IdevaPersonas.md
// Regex: /ROLLE III\s*[-–—]*\s*DER BUILDER([\s\S]*?)(?=ROLLE IV|## ROLLE IV|$)/i
// Compress to ≤2000 chars, strip markdown
```

**Injection points**:
- `buildPrimer()` — add `builderPersona` to context primer
- `mission-control-manager.ts` — pass builder persona as context when spawning builder nodes
- `electron_bridge.py` — inject into BuilderSession context

**Files changed**: `repo-context.ts` (add field + extract + inject into primer)

### Slice 1.2 — Critic/Tester Persona (ROLLE IV)
**File**: `src/main/repo-context.ts`  
**Pattern**: Same as above.

```typescript
// Add 'criticPersona' field
// Extract: ROLLE IV — DER CRITIC / TESTER section
// Regex: /ROLLE IV\s*[-–—]*\s*DER (?:CRITIC|TESTER)([\s\S]*?)(?=ROLLE V|## ROLLE V|$)/i
```

**Injection points**:
- Review mode — inject critic persona when computing RC re-score
- `sendPlanChat()` — inject as alternative reviewer context
- Post-build validation in `mission-control-manager.ts`

### Slice 1.3 — Memory Keeper Persona (ROLLE V)
**File**: `src/main/repo-context.ts`

```typescript
// Add 'memoryKeeperPersona' field
// Extract: ROLLE V — DER MEMORY KEEPER section
// Regex: /ROLLE V\s*[-–—]*\s*DER MEMORY KEEPER([\s\S]*?)$/i
```

**Injection points**:
- Session end — generate session summary using Memory Keeper persona
- Context staleness guard — when re-harvesting, append memory snapshot

---

## Phase 2: Routing Variants (P1)

### Slice 2.1 — v1/v2 Routing UI Toggle
**Files**: `BlueprintWorkspace.tsx`, `agent-executor.ts`

Current state: routing mode is an env var (`KORE_ROUTING_MODE`). No UI toggle.

**Change**: Add a v1/v2 toggle in the BlueprintWorkspace floating window or mode bar:
- v1 (Hybrid-Local): routes architect through local models first, cloud as fallback
- v2 (Cloud-First): routes through cloud models first, local as emergency fallback

```typescript
// BlueprintWorkspace.tsx — add to floating window
<button onClick={() => setRoutingVariant('v1')}>v1 Hybrid</button>
<button onClick={() => setRoutingVariant('v2')}>v2 Cloud</button>
```

The `agent-executor.ts` reads `KORE_ROUTING_MODE` env var. The toggle would override this via the routing mode prefix (`local:` / `cloud:`) already supported.

---

## Phase 3: Chat→Jcode Bridge (P1)

### Slice 3.1 — Chat Auto→Execution
**Files**: `ChatPanel.tsx`, `agent-executor.ts`, `mission-control-manager.ts`

Current state: ⚡ jcode button manually sends last AI message to jcode. No automatic detection of executable intent.

**Change**: When jcode mode is ON in ChatPanel, AI responses containing code blocks or build instructions auto-trigger execution:

```typescript
// ChatPanel.tsx — after receiving assistant response
if (jcodeMode && /```|build|implement|create file|write|patch/i.test(assistantContent)) {
  await ipc.sendToJcode(assistantContent, repoPath);
}
```

**New IPC**: `jcode:execute` — takes message + repoPath, parses actionable intent, feeds to MissionControl.

---

## Phase 4: Console Tab Bar (P2)

### Slice 4.1 — Console Views
**Files**: `TerminalPanel.tsx` (modify), new `ConsoleTabBar.tsx`

Current state: Console is TerminalPanel only, with a show/hide toggle.

**Change**: Add a small tab bar above the terminal area:
- **Terminal** — existing node-pty terminal
- **Output** — build output / MissionControl stream
- **Problems** — error summary from builds
- **Debug** — future debug console

```tsx
// ConsoleTabBar.tsx
const tabs = ['terminal', 'output', 'problems', 'debug'] as const;
// Render small pill buttons, persist active tab in localStorage
```

---

## Phase 5: code-server (P2)

### Slice 5.1 — Full VS Code in Cockpit
**Files**: `main/code-server.ts` (new), `MonacoPanel.tsx` (modify), `App.tsx` (modify)

**Pattern**: Same WebContentsView pattern as Browser/Monaco/Stream panels.

```typescript
// main/code-server.ts
import { spawn } from 'child_process';

export function startCodeServer(workspaceRoot: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('code-server', ['--port', '0', '--auth', 'none', workspaceRoot], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Parse port from stdout, return when ready
    proc.stdout.on('data', (data) => {
      const match = data.toString().match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(parseInt(match[1]));
    });
  });
}
```

The Monaco VSCode tab switches URL to `http://localhost:<port>` when code-server is ready.

---

## Phase 6: Browser Split Sharing (P3)

### Slice 6.1 — Layout URL Hash
**Files**: `App.tsx`, `BrowserPanel.tsx`

**Change**: Encode split ratios in URL hash:
```
#splits=browser:0.6,chat:0.4,console:120
```

On page load, parse hash and restore layout. "Copy Share Link" button in the mode bar.

---

## Dependency-Safe Build Order

```
Phase 1 (Personas) — zero dependencies, can start immediately
  ├── Slice 1.1: Builder persona (0.5h)
  ├── Slice 1.2: Critic persona (0.5h)
  └── Slice 1.3: Memory Keeper persona (1h)

Phase 2 (Routing) — depends: none
  └── Slice 2.1: v1/v2 UI toggle (0.5h)

Phase 3 (Jcode Bridge) — depends: Phase 1 (Builder persona)
  └── Slice 3.1: Chat→jcode auto-execute (2h)

Phase 4 (Console) — depends: none
  └── Slice 4.1: Console tab bar (1h)

Phase 5 (code-server) — depends: WebContentsView pattern (done)
  └── Slice 5.1: Full VS Code (2h)

Phase 6 (Share) — depends: none
  └── Slice 6.1: Layout hash (0.5h)
```

## Total Remaining Effort
| Phase | Slices | Est. Effort |
|---|---|---|
| Personas | 3 | 2h |
| Routing | 1 | 0.5h |
| Jcode Bridge | 1 | 2h |
| Console | 1 | 1h |
| code-server | 1 | 2h |
| Share | 1 | 0.5h |
| **Total** | **8** | **8h** |

## Parallel Execution Map
```
Session A:        Session B:          Session C:
Phase 1 (2h)      Phase 4 (1h)        Phase 6 (0.5h)
Phase 2 (0.5h)    Phase 5 (2h)
Phase 3 (2h)
─────────────────────────────────────────────────
Total: 4.5h       Total: 3h           Total: 0.5h
                  Parallel max: 4.5h calendar
```
