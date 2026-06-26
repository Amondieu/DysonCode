# FLOW Canvas — Cognitive Upgrade Plan
**Date**: 2026-06-24 01:25 CEST
**Build**: `BT0-EV2j` (PanelManager)
**Status**: Phase 1 ready for implementation

---

## ΣΚΟΠ Collapse

The FLOW canvas is currently an execution log with 4 undifferentiated node types (`agent`, `repo`, `vault`, `test`) and 3 edge types (`data`, `dependency`, `reference`). Every node is a generic prompt box. Connections carry no semantic meaning.

The upgrade transforms it into a **cognitive substrate** — a canvas where agent roles carrying cognitive frames compose into networks that execute, debate, create, and synthesize. Nodes have cognitive identity (frame/role). Edges have semantic type (data/challenge/synthesis/memory/trigger/broadcast).

---

## Module Taxonomy (30 modules, 7 categories)

### THINKING
| Module | Role | Frame | Function |
|--------|------|-------|----------|
| Architect | ROLLE I | IDEVA | Generates blueprints from intent |
| Critic | ROLLE IV | ΣΚΟΠ | Adversarial falsification |
| Inventor | — | INVENTIO | Expands possibility space |
| Tension Engine | — | Ω6 | Thesis/antithesis → synthesis |
| Compressor | — | Ω1 | Kolmogorov minimum description |
| Renorm | — | Ω3 | Zoom-level invariant features |

### COUNCIL
| Module | Function |
|--------|----------|
| Council | N agents debate → synthesized output |
| Socratic | Productive contradiction pairs |
| Ensemble | 3 parallel calls → best answer |
| Memory Council | Council output → Memory Keeper compression |

### DATA
| Module | Function |
|--------|----------|
| Browser Agent | URL navigation + content extraction |
| Search Agent | Web search → structured results |
| File Reader | Local file reading from repo/BuildDocs |
| API Call | HTTP request → structured response |
| RSS Feed | Feed monitoring, fires on new items |

### EXECUTION
| Module | Role | Function |
|--------|------|----------|
| Builder | ROLLE III | Writes files via kore-exec |
| Tester | ROLLE IV | Validation + cheap falsifiers |
| Shell | — | Bash command execution |
| kore-exec | — | Full Rust binary stream |

### CREATIVE
| Module | Function |
|--------|----------|
| Invention Factory | Intent → Tension → Inventor → Critic pipeline |
| Cross-Domain Bridge | Morphism finder across domains |
| Idea Mutator | 7 multiplicators → 7 mutations |
| Concept Synthesizer | Functor F: C → C' unifying N concepts |

### META
| Module | Function |
|--------|----------|
| Module Builder | Invents new module definitions |
| Graph Optimizer | Rewiring proposals |
| Paradigm Monitor | ΦΩΡGΕ Organ 7 quality tracking |
| Memory Keeper | ROLLE V — session compression |

---

## Edge Types (6 semantic types)

| Type | Color | Hex | Style | Meaning |
|------|-------|-----|-------|---------|
| Data | Blue | `#3b82f6` | Solid | Output flows to input |
| Challenge | Red | `#ef4444` | Animated pulse | Adversarial challenge |
| Synthesis | Green | `#22c55e` | Solid, thick | Two inputs merge |
| Memory | Purple | `#a855f7` | Dashed | Persisted → recalled |
| Trigger | Yellow | `#eab308` | Dashed, fast | Event, not data |
| Broadcast | White | `#ffffff` | Dotted fan | One → all connected |

---

## Phase 1 — Foundation (Now)

### 1a: Grid Snap + Node Min-Size
- `snapToGrid={true}` + `snapGrid={[20, 20]}` on ReactFlow
- Minimum node width 220px, height auto-expands
- File: [`FlowCanvas.tsx`](../src/renderer/components/flow/FlowCanvas.tsx)

### 1b: Edge Color Mapping
- Add `EDGE_COLORS` constant in FlowCanvas.tsx
- Update `mapGraphEdge()` to apply color + animation per semantic type
- Keep backward compat: `dependency` → blue, `reference` → dashed blue

### 1c: Node Frame Badges
- Add `frame` field to `CreateNodeArgs.data` and `GraphNode.data`
- Update `AgentNode` header to show frame badge as colored pill
- Create `MODULE_REGISTRY` — a const array of 30 module definitions
- Each entry: `{ id, category, role, frame, icon, color, inputPorts, outputPorts }`

### 1d: Right-Click → Add Module Palette
- Wire `onContextMenu` on ReactFlow
- Show searchable palette filtered from MODULE_REGISTRY
- Click module → `addNode()` at click position
- Position: `screenToFlowPosition` from ReactFlow instance

---

## Phase 2 — Node Identity
- Node anatomy redesign: header (role icon + name + frame badge) / input preview / output preview / status badge
- Connection handles with port type labels (16px, colored per type)
- Double-click node → full config panel

## Phase 3 — Preset Graphs
- Invention Factory, Research Council, Auto-Coder presets
- Drag-edge to empty space → suggests compatible modules
- Node grouping → sub-graphs with single I/O

---

## Data Model Changes

```typescript
// appStore.ts — GraphNode.data gains cognitive fields
interface CognitiveNodeData {
  frame?: 'IDEVA' | 'ΣΚΟΠ' | 'INVENTIO' | 'Ω1' | 'Ω2' | 'Ω3' | 'Ω6';
  role?: 'ROLLE_I' | 'ROLLE_III' | 'ROLLE_IV' | 'ROLLE_V';
  category?: 'thinking' | 'council' | 'data' | 'execution' | 'creative' | 'meta';
  persona?: string;       // Persona name from IdevaPersonas.md
  capabilities?: string[]; // e.g., ['blueprint', 'falsification', 'compression']
}

// GraphEdge.type gains semantic types
type EdgeSemanticType = 'data' | 'challenge' | 'synthesis' | 'memory' | 'trigger' | 'broadcast';
```

---

## Files to Modify (Phase 1)

| File | Change |
|------|--------|
| `src/renderer/components/flow/FlowCanvas.tsx` | Grid snap, edge colors, context menu |
| `src/renderer/components/flow/nodes/AgentNode.tsx` | Frame badge in header |
| `src/renderer/store/appStore.ts` | CognitiveNodeData type, EdgeSemanticType |
| `src/renderer/components/flow/ModulePalette.tsx` | **NEW** — searchable module palette |
| `src/renderer/data/module-registry.ts` | **NEW** — 30-module const array |
