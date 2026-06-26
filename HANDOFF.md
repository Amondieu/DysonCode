# DysonCode — Build Protocol & Handoff

**Date**: 2026-06-24 01:26 CEST
**Build**: `BT0-EV2j`
**Status**: 100% COMPLETE + PanelManager unified coordinator + FLOW cognitive upgrade pending

---

## Latest Change — Unified PanelManager

Replaced 4 independent per-panel coordinators with a single `PanelManager` (`src/main/panel-manager.ts`). One `updateVisibility()` gate controls all 4 WebContentsViews. Switching to CANVAS mode hides all views instantly.

**New files**: `src/main/panel-manager.ts`, `src/renderer/hooks/usePanelManager.ts`
**New IPC namespace**: `panels:*` (setActiveTab, setActivePanel, setBounds, browserNavigate, monacoOpen, streamSnapshot, etc.)
**Backward compat**: Old `browser:*`, `monaco:*`, `stream:*` methods in preload still work (route to `panels:*`)

---

## Project Overview

DysonCode is a full-featured AI coding cockpit built on Electron 33 + React 18 + TypeScript + Monaco + xterm.js + SQLite. It provides an Ask→Plan→Execute→Review workflow with dual-AI (Architect + Reviewer), a Python orchestrator backend (KORE), real file writes via BuilderSession, and 5 WebContentsView panels for browser, editor, stream monitoring, and full VS Code.

**Location**: `C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode`

---

## Quick Start

```powershell
# Build
npm run build

# Package
npm run pack

# Launch
.\release\win-unpacked\DysonCode.exe
```

**Prerequisites**:
- Python 3.12+ for MissionControl bridge
- DeepSeek API key in `.env` (auto-copied to `release\win-unpacked\.env`)
- Optional: code-server for VS Code tab, litellm for local proxy

---

## Architecture

```
src/
├── main/                          # Electron main process
│   ├── index.js                   # Entry: window + lifecycle
│   ├── preload.ts                 # contextBridge IPC (50+ channels incl panels:*)
│   ├── ipc-handlers.ts            # Core IPC handlers (panels:* in panel-manager.ts)
│   ├── panel-manager.ts           # ★NEW★ Unified WebContentsView coordinator
│   ├── agent-executor.ts          # LLM execution (DeepSeek fallback)
│   ├── db.ts                      # SQLite via better-sqlite3
│   ├── terminal-manager.ts        # node-pty lifecycle
│   ├── mission-control-manager.ts # MissionControl spawns Python bridge
│   ├── repo-context.ts            # Context primer (16 layers, 5 personas)
│   ├── browser-panel.ts           # WebContentsView browser (legacy, replaced by panel-manager)
│   ├── monaco-panel.ts            # WebContentsView Monaco (legacy)
│   ├── stream-panel.ts            # WebContentsView stream (legacy)
│   ├── code-server.ts             # VS Code serve-web child process
│   ├── graph-service.ts           # Graph CRUD
│   ├── vault-import.ts            # Prompt vault import
│   ├── intelligence/bridge.ts     # DysonSphere intelligence bus
│   └── intelligence/types.ts      # KnowledgeItem types
│
├── renderer/                      # React 18 UI
│   ├── App.tsx                    # Root layout + activeTab sync
│   ├── store/appStore.ts          # Zustand global state
│   ├── hooks/
│   │   ├── useIpc.ts              # IPC bridge hooks
│   │   ├── useBlueprint.ts        # Architect/Reviewer arbitration
│   │   └── usePanelManager.ts     # ★NEW★ Shared panel visibility hook
│   └── components/
│       ├── Sidebar.tsx            # Icon strip + compact sidebar
│       ├── BlueprintWorkspace.tsx  # Canvas mode (Ask/Plan/Execute/Review)
│       ├── ChatPanel.tsx          # Main chat with jcode toggle
│       ├── ChatMessage.tsx        # Markdown + role badges + outcome cards
│       ├── ReviewPanel.tsx        # Post-execution review (RC score + diffs)
│       ├── BrowserPanel.tsx       # Browser panel (uses usePanelManager hook)
│       ├── MonacoPanel.tsx        # Monaco editor panel
│       ├── CodeServerPanel.tsx    # VS Code panel
│       ├── StreamPanel.tsx        # Execution stream panel
│       ├── MissionControlPanel.tsx # MissionControl runner
│       ├── Terminal.tsx           # xterm.js terminal
│       ├── FileTree.tsx           # Recursive file browser
│       ├── RepoPicker.tsx         # Directory picker
│       ├── SessionList.tsx        # Session CRUD
│       ├── PromptVault.tsx        # Prompt vault
│       ├── flow/FlowCanvas.tsx    # ReactFlow DAG canvas (cognitive upgrade pending)
│       └── flow/nodes/            # AgentNode, RepoNode, VaultNode, TestNode
│
├── assets/
│   ├── monaco.html               # Self-contained Monaco bundle
│   └── stream.html               # Live execution stream HTML
│
├── kore/                          # Python orchestrator backend
│   ├── orchestrator.py           # State machine + sprint lifecycle
│   ├── role_engine.py            # Role runtime
│   ├── task_graph.py             # NetworkX DAG
│   ├── contract_registry.py      # PydanticAI artefact types
│   ├── failure_classifier.py     # 6-class failure taxonomy
│   ├── harness_engine.py         # Scoring + done detector
│   ├── done_gate.py              # 4-state verdict
│   ├── execution/builder_session.py  # Real file writes
│   ├── execution/router.py       # Backend routing (KoreExec vs OpenHands)
│   ├── ui/electron_bridge.py     # Python→Electron IPC bridge
│   └── ui/mission_control.py     # MissionControl server
│
├── kore-exec/                     # Rust executor binary (2.1 MB)
│   └── src/tools/                 # write_file, read_file, shell, grep, diff
│
└── plans/
    ├── dysoncode-complete-roadmap.md
    ├── dysoncode-full-implementation-plan.md
    └── flow-canvas-cognitive-upgrade.md  # ★NEW★ FLOW canvas redesign plan
```

---

## IPC Channels (50+ channels)

**Sessions**: createSession, getAllSessions, getSessionById, updateSessionTitle, deleteSession, getLastSessionWithMessages

**Messages**: insertMessage, getMessagesBySession

**Terminal**: create, write, resize, kill, list, terminal:data, terminal:exit

**FS**: selectDirectory, listFiles, readFile, saveFile, isDirectory

**Vault**: create, getAll, search, incrementUse

**Repos**: create, getAll

**Events**: insert, getBySession

**Graph**: createNode, getNodes, createEdge, getEdges

**Summary**: upsert, get

**MissionControl**: start, stop, getState, getStatus, snapshot events

**Repo Context**: getContext, refreshContext

**DysonSphere Intelligence**: getIntelligence, refreshIntelligence

**Panel Manager** (panels:*): setActiveTab, setActivePanel, setBounds, browserNavigate, browserGoBack, browserGoForward, browserReload, browserSetZoom, browserGetZoom, monacoOpen, monacoSave, streamSnapshot, streamEvent, streamClear, codeserverSetUrl

**Legacy Browser** (backward compat): navigate, goBack, goForward, reload, setZoom, getZoom, urlChanged

**Legacy Monaco**: open, save

**Legacy Stream**: clear

**Jcode**: send

**App**: getVersion, openBrowser, openVSCode, openCursor, openEmbeddedBrowser

---

## State Management (Zustand)

```typescript
interface AppState {
  // Sessions
  sessions: SessionInfo[];
  activeSessionId: number | null;
  messages: MessageInfo[];
  lastSessionData: SessionData | null;

  // UI
  activePanel: 'chat' | 'flow' | 'canvas' | 'mesh';
  sidebarOpen: boolean;
  sidebarModule: 'explorer' | 'browser' | 'vault';
  sidebarWidth: number;

  // Files
  repoPath: string | null;
  fileTree: FileEntry[];

  // Terminals
  terminals: TerminalInfo[];
  activeTerminalId: string | null;

  // Mission Control
  missionControl: MissionControlSnapshot | null;
  missionControlStatus: MissionControlStatus;
  missionControlSpec: string;

  // Chat
  chatDraft: string;

  // Graph
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
}
```

---

## Context Primer Chain (12 layers)

```
1. SYSTEM_PROMPT
2. Repository Context           (repo-context.ts — modules, docs, sprints)
3. API Surface                  (exports extracted from TS/TSX)
4. Architect Persona            (IdevaPersonas.md ROLLE I)
5. Reviewer Persona             (IdevaPersonas.md ROLLE II)
6. Builder Persona              (IdevaPersonas.md ROLLE III)
7. Critic/Tester Persona        (IdevaPersonas.md ROLLE IV)
8. Memory Keeper Persona        (IdevaPersonas.md ROLLE V)
9. DysonSphere Knowledge        (intelligence/bridge.ts — ~/.jcode/bus/)
10. kore-exec-spec              (BuildDocs/kore-exec-spec.md)
11. TOOL-MASTER-MAP             (BuildDocs/Tools/TOOL-MASTER-MAP.md)
12. Intent (raw or transformed) + Constraints
```

---

## Canvas Mode — Mode Pills

| Pill | Function |
|---|---|
| 💬 Ask | Free chat with Architect |
| 🗺 Plan | Architect + Reviewer build blueprint |
| ⚡ Execute | Auto-triggers jcode/MissionControl with blueprint |
| 🔍 Review | RC score + diffs + outcome card |

---

## Intent Transformation Engine

7 frames in floating window:
- ΣΚΟΠ (Constraint Collapse) · IDEVA (Compression) · INVENTIO (Possibility) · ΦΩΡGΕ (Tension) · Ω1 (Kolmogorov) · Ω2 (Fitness) · Ω6 (Dialectic)

Fuse toggle chains frames: `activeFrames.join(' → ')` → meta-LLM → transformed intent → Architect prompt.

---

## Build History

| Build | What |
|---|---|
| `DAHIGUHe` | Context Primer Pipeline |
| `C8oQuzmE` | DysonSphere Intelligence Bridge |
| `CoTQSuE7` | IDEVA Persona harvesting |
| `D93Fi0C9` | Canvas redesign |
| `DSxhGu6Z` | Left panel overhaul |
| `BH3gJVZM` | WebContentsView browser |
| `7WrJhq5P` | Monaco panel |
| `BBI7Ax_-` | Stream panel + ResizeObserver |
| `VN0zqOQY` | Intent Transformer |
| `swzEOJPD` | Plan→Execute auto-trigger |
| `Cpm_pxx6` | Review mode |
| `C239Gx25` | All 5 personas |
| `qsvQ8peQ` | v1/v2 routing + jcode bridge |
| `D7XENbcB` | Console tab bar + code-server + browser split |
| `Ddn0sx0z` | BrowserPanel z-order fix (setVisible + zoom) |
| `BT0-EV2j` | ★ Unified PanelManager (4→1 coordinator) |

---

## Remaining (Post-100%)

| Priority | Item |
|---|---|
| P3 | Harvest `DysonAutoCode.md`, `IdevaCoding1.md`, `KatalystUndMetaBlocksMemoryKeep.md` |
| P3 | Harvest `Run1.md`–`Run6.md` |
| P4 | Browser split hash live update |
| P4 | Console Output/Problems views |
| P4 | code-server auto-start |
| **P0** | **FLOW Canvas Cognitive Upgrade — Phase 1** (grid snap + edge colors + frame badges + module palette) — see `plans/flow-canvas-cognitive-upgrade.md` |

---

## Known Issues & Workarounds

1. **winCodeSign fails on Windows** — symlink permission error on `.dylib` files. Affects code signing only; `app.asar` still updates. Launch exe directly.
2. **`.env` wiped by `npm run pack`** — electron-builder clears `release/win-unpacked/`. Fix: copy `.env` after pack or use `extraResources` config.
3. **`d3dcompiler_47.dll` locked by running app** — close DysonCode.exe before repacking.
4. **WebContentsView bounds** — React sends coordinates to main process via IPC only. Never manipulate views from renderer.
5. **code-server** — requires `code-server` installed globally. Falls back gracefully if not found.

---

## NPM Scripts

```json
{
  "dev": "tsc -p tsconfig.main.json && vite",
  "build": "tsc -p tsconfig.main.json && vite build && copy /Y src\\main\\index.js dist\\main\\index.js",
  "pack": "electron-builder --dir",
  "start": "electron ."
}
```
