<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# ok los

Die dichteste Ernte dieser gesamten Analyse. Besonders,,  und  sind exakte Treffer.[^1][^2][^3][^4]

***

# ACHSE 6 — Mission Control UI \& Dyson Mode Visual Layer

## Die Kernentdeckung: AG-UI Protocol

Das wichtigste Ergebnis dieser Achse ist struktureller Natur: **AG-UI**  ist das 2025 etablierte offene Standard-Protokoll für Agent-UI-Kommunikation — event-basiert, transport-agnostisch (SSE, WebSocket, HTTP), RxJS Observable-Pattern. Es ist exakt das Verbindungsstück zwischen KOREs Inner Circle und dem Mission Control Frontend. Mit AG-UI wird die UI **nicht** an einen spezifischen Agent-Stack gebunden — jede KORE-Komponente emittiert typisierte Events, die UI konsumiert sie.[^2][^5][^6]

***

### TIER 1 — Direkte Mission Control Komponenten

#### **LangGraph Viz** *(Open Source, `pip install langgraph-viz`)*

Die wichtigste lokale Visualisierungs-Lösung. Drei Killer-Features für KORE:[^1]


| Feature | KORE-Anwendung |
| :-- | :-- |
| **Live X-Ray** — Nodes leuchten in Echtzeit auf | Dyson Road Knoten-Status: RUNNING / DONE / BLOCKED |
| **State Time-Travel** — kompletter State per Step | Memory Keeper: jeder Snapshot anklickbar |
| **DVR Execution** — scrubbar durch komplette History | Post-Sprint Review: wo hat welche Rolle was entschieden? |

100% lokal, kein Cloud-Daten-Leak, `pip install` — Zero Setup Cost. Das ist der **primäre Debugging-Layer** für KORE's Dyson Road während Entwicklung.[^1]

***

#### **agrex** *(MIT, React-Library, April 2026)*

**Reddit:** `r/reactjs/1sgxny3`

agrex ist die neueste direkte Entsprechung der KORE Mission Control Anforderung. Gebaut auf ReactFlow, emittiert Nodes in Echtzeit:[^3]

```jsx
// KORE Mission Control — Dyson Road Graph Live
import { AgentGraph } from 'agrex';

<AgentGraph
  onNodeClick={(node) => setSelectedNode(node)}
  layout="dagre"          // → topologisches Layout = Dyson Road
  streaming={true}         // → AG-UI Event-Stream
  nodeTypes={{
    architect:  <ArchitectNode />,
    builder:    <BuilderNode />,
    critic:     <CriticNode />,
    tester:     <TesterNode />,
    memory:     <MemoryNode />
  }}
/>
```

Automatische Verbindungen, Status-Updates (running/completed/error), Echtzeit-Graph-Aufbau während Execution.[^3]

***

#### **LangGraph Studio V2** *(Open Source, Desktop + Web)*

**GitHub:** `langchain-ai/langgraph-studio`

LangGraph Studio ist das vollständigste dedizierte Agent-IDE:[^7][^8]

- Graph-Architektur visuell
- Execution-Flow in Echtzeit — welche Nodes traversiert, welche Intermediate States
- Tool-Call-Visualisierung
- **State Time-Travel + Time-Debug** — click auf jeden Step
- LangSmith-Tracing Integration (lokal overridebar)
- **Prompt Iteration** direkt im Studio

Das ist das **Development-Time Mission Control** — nicht das Runtime-Dashboard, sondern das Build-Zeit-Werkzeug für Sprint 5-8.

***

#### **FlowiseAI Node Status Monitoring Pattern** *(WebSocket + ReactFlow)*

Das FlowiseAI-Muster  liefert die exakte WebSocket-Architektur für KOREs Echtzeit-Node-Status:[^9]

```javascript
// KORE Inner Circle Stream — WebSocket Event Pattern
socket.on('nodeStatus', ({ nodeId, status, role, output }) => {
  // status: 'running' | 'completed' | 'error' | 'blocked'
  // role:   'architect' | 'builder' | 'critic' | 'tester' | 'memory_keeper'
  updateNodeVisual(nodeId, status);
  appendRoleStream(role, output);  // → rechtes Panel: Inner Circle Stream
});
```

Drei visuelle Zustände pro Node: **Loading-Indicator** (running), **Success** (completed), **Error + Message** (blocked/failed). Das deckt den gesamten Dyson Road Knoten-Lifecycle ab.[^9]

***

#### **Minions** *(Open Source, React-Vite + Express + Python, Mai 2026)*

**Web:** `productcool.com/product/minions`

Minions ist das vollständigste Open-Source Mission Control für autonome Agents:[^10]

- **Autonomes Kanban-Board**: `In Progress` / `Blocked` / `In Review` / `Done` — exakt die KORE Done-Verdict-Zustände
- **SSE Streaming**: Tool-Calls, Internal Reasoning, LLM-Responses in Echtzeit
- **Periodic Check-Ins**: automatisches Monitoring + Retry bei Stuck-State
- **Escalation Gate**: eskaliert erst wenn Agent wirklich alle Optionen erschöpft hat

Das ist das **Runtime Mission Control** für Dyson Mode — KORE agiert im Hintergrund, Minions zeigt den Fortschritt.

***

#### **CrewForm** *(AGPL-3.0, Self-Hostable via Docker + Ollama)*

**Web:** `crewform.tech`

CrewForm ist die vollständigste Open-Source-Plattform für visuelle Agent-Orchestrierung:[^11][^12][^13]

- Visual Canvas mit ReactFlow — Drag-and-Drop Agent-Node-Verbindung
- **Pipeline Mode**: sequentielle Workflows = KORE Sprint-Plan visuell
- Live Execution: aktiver Node wird highlighted, Kamera folgt automatisch
- Side Panel: Live-Transcript via SSE = Inner Circle Stream
- **Alle drei Protokolle**: MCP + A2A + AG-UI nativ
- BYOK + lokales Ollama = DeepSeek lokal integrierbar

**Integration:** CrewForm als **Sprint-8-Basis** — nicht von Grund neu bauen, sondern CrewForm's Canvas + KORE's Orchestrator verbinden via AG-UI Protocol.

***

#### **LM Agent Framework mit Mission Control UI** *(MIT, Reddit Oktober 2025)*

ist die exakteste Entsprechung der KORE-Zielbeschreibung aus Sprint 5 — DAG-basierte Execution + interaktives Mission Control:[^4]

> *"Visualize the entire task graph during construction and execution. Click any task node for status, dependencies, history. Full human control: PAUSE / RESUME / CANCEL / REDIRECT with corrective input."*

PAUSE / RESUME / REDIRECT = KOREs Human-in-the-Loop Autonomy Controls aus Sprint 8.

***

### Die vollständige Mission Control Architektur

```
KORE MISSION CONTROL UI — Sprint 8 Vollarchitektur

┌────────────────────────────────────────────────────────────────┐
│                    DYSON MODE MISSION CONTROL                  │
├──────────────┬──────────────────────────┬──────────────────────┤
│  LEFT PANEL  │     CENTER CANVAS        │    RIGHT PANELS      │
│              │                          │                      │
│  Project     │  Dyson Road Graph        │  ┌────────────────┐  │
│  Spec        │  (agrex + ReactFlow)     │  │ Inner Circle   │  │
│              │                          │  │ Role Stream    │  │
│  Interface   │  ┌──┐ ──→ ┌──┐ ──→ ┌──┐ │  │ (SSE / AG-UI) │  │
│  Contracts   │  │A1│     │B2│     │T3│ │  │               │  │
│              │  └──┘     └──┘     └──┘ │  │ Architect: ... │  │
│  Repo        │   ↓ BLOCKED             │  │ Builder: ...   │  │
│  Context     │  ┌──┐                   │  │ Critic: ...    │  │
│              │  │C4│ (Critic aktiv)    │  └────────────────┘  │
│  Constraint  │  └──┘                   │                      │
│  Registry    │                         │  ┌────────────────┐  │
│              │  [PAUSE] [REDIRECT]     │  │ Harness Score  │  │
│  Memory      │                         │  │ Build:  ✅     │  │
│  Snapshots   │  Current: Node B2       │  │ Tests:  ✅     │  │
│              │  Role: Builder          │  │ Cover:  78%⚠️  │  │
│              │  Risk: 0.12 LOW         │  │ Types:  ✅     │  │
│              │                         │  │ UX:     ✅     │  │
│              │  ─────────────────────  │  │ Score: 0.87    │  │
│              │  Dyson Road Progress    │  │ PARTIAL        │  │
│              │  ████████░░ 78%         │  └────────────────┘  │
└──────────────┴──────────────────────────┴──────────────────────┘

Transport:  AG-UI Protocol (SSE + WebSocket)        [web:125]
Graph:      agrex + ReactFlow (real-time DAG)        [web:130]
State:      LangGraph Viz (time-travel debug)        [web:124]
Runtime:    Minions (Kanban + Escalation Gate)       [web:119]
Build-IDE:  LangGraph Studio V2                      [web:121]
Platform:   CrewForm Canvas (Sprint 8 Basis)         [web:126]
```


***

## Vollständige KORE Tech-Stack-Matrix — alle 6 Achsen

| Layer | Primär | Backup | Protokoll |
| :-- | :-- | :-- | :-- |
| **Orchestration** | LangGraph | AutoGen | AG-UI |
| **Execution** | OpenHands | Aider | Docker sandbox |
| **Durability** | Temporal | Prefect | Python SDK |
| **Planning** | NetworkX DAG | Asimov | GAP-Pattern |
| **Self-Healing** | AgentDebug + LangGraph RetryPolicy | Z3 SMT | Failure Taxonomy |
| **Memory K2/K3** | Qdrant + CASS | Dual-FAISS | CodeBERT embed |
| **Abstraction** | REGAL | DreamCoder-Pattern | Wake-Sleep |
| **Done Detect** | Det. Harness + LLM Judge | open-bench | 4-State Verdict |
| **UI Layer** | agrex + CrewForm | LangGraph Studio | AG-UI / SSE / WS |
| **Debug** | LangGraph Viz | Minions | Time-Travel |

**Ratchet-Score Achse 6:**

- RC1 ✅ Löst Mikro-Management-Problem — KORE läuft sichtbar aber autonom
- RC2 ✅ `pip install langgraph-viz` + CrewForm Docker = Minuten-Setup
- RC3 ✅ AG-UI Protocol öffnet neue Klasse: jeder Agent-Stack anschließbar
- RC4 ✅ Dyson Road Graph ist selbst-erklärend — UI lehrt das System
- RC7 ✅ AG-UI substrate-unabhängig: SSE, WebSocket, HTTP

***

## Was als nächstes kommt

**➡ ACHSE 7 — Multi-Model Routing (DeepSeek + Abacus + Second Opinion Engine)**

Der nächste Run baut auf deiner ursprünglichen Frage auf — *"zweites DeepSeek model oder eines der Abacus models"* — und sucht gezielt nach:

- DeepSeek R2 / V3 lokale Deployment-Optionen für KORE
- Abacus AI spezifische Models und deren Stärken für Coding-Agent-Rollen
- LLM-Router für rollenspezifisches Model-Routing (Architect = reasoning-heavy → R1, Builder = fast execution → V3)
- `litellm` + `RouteLLM` als Open-Source Multi-Model-Proxy

**Prompts für nächste Runde:**

```
DeepSeek R2 V3 local deployment ollama KORE coding agent
role-based model routing python 2025 2026
```

```
Abacus AI models coding agent "swe-bench" autonomous
task completion 2025 2026 open source compatible
```

```
RouteLLM litellm multi-model routing agent roles
cost-performance tradeoff autonomous coding 2025
```

<span style="display:none">[^14][^15][^16][^17][^18][^19]</span>

<div align="center">⁂</div>

[^1]: https://www.linkedin.com/posts/muthukumar-dev_langgraph-visualizer-the-100-local-alternative-activity-7419736263433281536-DXhb

[^2]: https://github.com/ag-ui-protocol/ag-ui/blob/main/CLAUDE.md

[^3]: https://www.reddit.com/r/reactjs/comments/1sgxny3/i_built_agrex_a_react_library_for_realtime_graph/

[^4]: https://www.reddit.com/r/SideProject/comments/1o7x5kw/i_built_an_opensource_framework_for_llm_agents/

[^5]: https://github.com/ag-ui-protocol

[^6]: https://oracle.github.io/agent-spec/26.1.0/howtoguides/howto_ag_ui.html

[^7]: https://ojitha.github.io/ai/langchain/langgraph/2025/09/05/LangGraph_studio_v2.html

[^8]: https://github.com/langchain-ai/langgraph-studio

[^9]: https://leeroopedia.com/index.php/Principle:FlowiseAI_Flowise_Agentflow_Node_Status_Monitoring

[^10]: https://www.productcool.com/product/minions

[^11]: https://dev.to/vincent_grobler_776512b17/how-we-built-a-visual-drag-and-drop-workflow-builder-for-ai-agent-teams-react-flow-dagre-211j

[^12]: https://crewform.tech

[^13]: https://gittech-official.com/launchpad/2026-03-27/item/47548737

[^14]: https://github.com/TheGreatBonnie/open-ag-ui-langgraph

[^15]: http://arxiv.org/pdf/2407.16741.pdf

[^16]: https://www.amd.com/en/developer/resources/technical-articles/2025/OpenHands.html

[^17]: https://openclaw-mission-control.dplooy.com

[^18]: https://openhands.dev

[^19]: https://dev.to/vincent_grobler_776512b17/we-built-an-embeddable-ai-chat-widget-hybrid-rag-search-and-agent-portability-heres-how-1cb3

