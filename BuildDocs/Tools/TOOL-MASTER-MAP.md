# DysonCode — Tool-Karte & Integrations-Plan

**Datum:** 2026-06-23  
**Basis:** 6 Runs Perplexity-Tool-Research + KORE Sprint 5–8 Roadmap  
**Ziel:** Jedes Open-Source-Tool ist einem Sprint, Layer und Status zugeordnet

---

## 0. Überblick: 6 Runs → 35 Tools → 3 Tiers

```
Run 1:  Orchestration & Multi-Agent Role Engine  →  8 Tools
Run 2:  Dependency Graph & Minimum-Energy Path    →  7 Tools
Run 3:  Self-Healing & Failure-to-Constraint Loop →  7 Tools
Run 4:  Semantic Code Memory & Pattern Library     →  7 Tools
Run 5:  Harness Scoring & Done Detector            →  6 Tools
Run 6:  Mission Control UI & Visual Layer          →  7 Tools
                                                     ─────
                                                      42 Nennungen → 35 unique Tools
```

---

## 1. Vollständige Tool-Matrix

### TIER 1 — Direkte Kernel-Kandidaten (15 Tools)

| # | Tool | Lizenz | Layer | Sprint | Status | Integration |
|---|------|--------|-------|--------|--------|-------------|
| 1 | **LangGraph** | MIT | Orchestration | 5 | ✅ sofort | Dyson Road Graph nativ; `RetryPolicy` = Failure-Loop-Basis |
| 2 | **OpenHands** | MIT | Execution | 5 | ✅ sofort | Execution Layer unter KORE; Sandboxed Build |
| 3 | **AutoGen / AG2** | MIT | Inner Loop | 5 | ✅ sofort | Builder+Critic schneller Iterations-Loop |
| 4 | **NetworkX** | BSD | Planning/DAG | 5 | ✅ sofort | `topological_generations()` = Dyson Road Datenstruktur |
| 5 | **PydanticAI** | MIT | Contracts | 5 | ✅ sofort | Artefakt-Typisierung für alle 5 Rollen |
| 6 | **Temporal** | MIT | Durability | 5 | 📋 Sprint 6 | Durable Execution + State Persistence |
| 7 | **AgentDebug** | OS | Failure | 6 | 📋 Sprint 6 | 6-Klassen-Failure-Taxonomie + +24% Recovery |
| 8 | **Z3 SMT** | MIT | Constraint | 6 | 📋 Sprint 6 | `sat`/`unsat`-Constraint-Check für Replanner |
| 9 | **CASS Memory** | OS | Memory (K2/K3) | 6 | 📋 Sprint 6 | Procedural + Long-Term Memory; Trauma Guard |
| 10 | **REGAL** | MIT | Abstraction | 7 | 📋 Sprint 7 | Gradient-freie Abstraktionsextraktion |
| 11 | **Qdrant** | Apache 2.0 | Memory Store | 6 | 📋 Sprint 6 | Dense+Sparse Vektor-Store; 6ms p50 |
| 12 | **Playwright + axe-core** | Apache 2.0 | UX Gate | 7 | 📋 Sprint 7 | Accessibility Hard Gate |
| 13 | **agrex** | MIT | UI Graph | 8 | 📋 Sprint 8 | Echtzeit-DAG-Visualisierung |
| 14 | **AG-UI Protocol** | OS | UI Transport | 8 | 📋 Sprint 8 | Event-Standard für Agent↔UI-Kommunikation |
| 15 | **Minions** | OS | UI Runtime | 8 | 📋 Sprint 8 | Kanban + SSE + Escalation Gate |

### TIER 2 — Ergänzende Spezialisten (12 Tools)

| # | Tool | Lizenz | Layer | Sprint | Status | Integration |
|---|------|--------|-------|--------|--------|-------------|
| 16 | **Aider** | MIT | CLI Builder | 5 | ✅ sofort | Git-native Builder-Knoten; BYOM |
| 17 | **Sweep AI** | Apache 2.0 | Dependency Analysis | 5 | 📋 Sprint 6 | Dependency Graph Analyzer für Dyson Road Input |
| 18 | **CrewAI** | MIT | Role Prototyping | 5 | 🔬 Test | Role-Stream-Visualisierung; Delegation-lock |
| 19 | **Asimov** | OS | Graph Execution | 5 | 🔬 Test | Lua-Constraint-Routing; State Snapshotting |
| 20 | **Prefect** | Apache 2.0 | Sub-Task Orchestration | 5 | 🔬 Test | Sprint-interne Sub-Graphs; leichter als Temporal |
| 21 | **Self-Healing Framework** | Paper | Reliability | 6 | 📋 Sprint 7 | Reliability Assessment Model für K2 Scoring |
| 22 | **Dual-FAISS Memory** | Paper | Memory Retrieval | 6 | 🔬 Test | Code + Explanation parallele Indizes |
| 23 | **open-bench** | MIT | Harness | 7 | 📋 Sprint 7 | Hidden Test Suite Pattern |
| 24 | **Harness Best Practices** | OS | Harness | 7 | 📋 Sprint 7 | Skeptical Evaluator + TDD + persistenter State |
| 25 | **LLM Judge Pattern** | OS | Scoring | 7 | 📋 Sprint 7 | Deterministic Metrics + JSON-Verdict |
| 26 | **LangGraph Viz** | OS | Debug UI | 8 | ✅ sofort | Live X-Ray + Time-Travel + DVR |
| 27 | **LangGraph Studio V2** | OS | Dev IDE | 8 | ✅ sofort | Graph-Architektur visuell editieren |

### TIER 3 — Beobachten & Später Bewerten (8 Tools)

| # | Tool | Lizenz | Layer | Sprint | Integration |
|---|------|--------|-------|--------|-------------|
| 28 | **GAP-Pattern** | Paper | Planning | 5 | Bewiesen: parallele Graph-Execution → 33% weniger Iterationen |
| 29 | **TDP Framework** | Paper | Planning | 6 | Jan 2026: Supervisor-Self-Revision-Architektur |
| 30 | **Recursive Graph Executor** | OS | Planning | 6 | Knoten-spawnt-Sub-Graphen für komplexe Tasks |
| 31 | **sem** | MIT | Memory | 6 | Minimaler semantic code search; All-MiniLM |
| 32 | **DreamCoder** | Paper | Abstraction | 7 | Wake-Sleep-Pattern (konzeptuell für REGAL) |
| 33 | **AI Coding Readiness Checklist** | OS | Harness | 7 | 8-Pillar/80-Punkte-Score als Referenz |
| 34 | **FlowiseAI Pattern** | OS | UI | 8 | WebSocket Node-Status für Role Stream |
| 35 | **CrewForm** | AGPL-3.0 | UI Canvas | 8 | Vollständigste Open-Source Agent-UI-Plattform |

---

## 2. Sprint-Zuordnung: Welches Tool wird wann gebaut/aktiviert

### Sprint 5 — Orchestrator Kernel (JETZT AKTIV)

KORE-Eigencode (6 Dateien):
```
kore/orchestrator.py      — State Machine + Role Dispatch
kore/role_engine.py       — YAML → Rolleninstanziierung
kore/task_graph.py        — NetworkX DAG + Dyson Road
kore/contract_registry.py — PydanticAI Artefakt-Typen
data/routes/kore-inner-circle-v1.yaml
data/routes/kore-inner-circle-v2-cloud.yaml
```

**Sofort aktivierbare Open-Source-Tools (7):**
| Tool | Rolle in KORE | Befehl / Setup |
|---|---|---|
| **LangGraph** | Dyson Road Graph nativ | `pip install langgraph` |
| **OpenHands** | Execution Layer (Sandbox) | `pip install openhands` |
| **AutoGen** | Builder+Critic Inner Loop | `pip install ag2` |
| **NetworkX** | DAG-Datenstruktur | `pip install networkx` |
| **PydanticAI** | Artefakt-Typisierung | `pip install pydantic-ai` |
| **Aider** | CLI Builder (git-native) | `pip install aider-chat` |
| **Temporal** | Durable Execution | `pip install temporalio` + Docker `temporalite start` |

### Sprint 6 — Self-Healing (6 Module)

KORE-Eigencode (3 Dateien):
```
kore/failure_classifier.py  — 6-Klassen-Taxonomie
kore/constraint_injector.py — FailureNote → DAG-Edge
kore/replanner.py           — Z3 + neuer Minimum-Energy-Pfad
```

**Tools (6):**
| Tool | Rolle | Befehl |
|---|---|---|
| **AgentDebug** | Failure Classifier + Error Taxonomy | `pip install agent-debug` |
| **Z3 SMT** | Constraint Satisfiability Check | `pip install z3-solver` |
| **CASS Memory** | Procedural + Long-Term Memory | `npx cass-memory` |
| **Qdrant** | K2/K3 Pattern Store | Docker `qdrant/qdrant` |
| **Sweep AI** | Dependency Graph Analysis | `pip install sweepai` |
| **Self-Healing Paper** | Reliability Model für Scoring | Code aus arXiv 2605.06737 |

### Sprint 7 — Real Done (2 Module)

KORE-Eigencode (2 Dateien):
```
kore/harness_engine.py  — 7-Pillar-Scoring
kore/done_gate.py       — 4-State-Verdict
```

**Tools (6):**
| Tool | Rolle | Befehl |
|---|---|---|
| **Playwright + axe-core** | UX Gate (Accessibility) | `pip install playwright` + `npx playwright install-deps` |
| **open-bench** | Hidden Test Suite Pattern | `pip install open-bench` |
| **REGAL** | Abstraktionsextraktion | `pip install regal` |
| **Black + mypy + pytest + bandit** | Quality Gate Stack | `pip install black mypy pytest pytest-cov bandit` |
| **LLM Judge Pattern** | JSON-validiertes Verdict | Eigenbau auf Basis `agents/swarm.py` |
| **AI Readiness Checklist** | Score-Referenz-Dimensionen | `kore/harness_thresholds.yaml` |

### Sprint 8 — Mission Control (3 Module)

KORE-Eigencode (3 Dateien):
```
kore/ui/mission_control.py  — FastAPI + SSE Server
kore/ui/events.py           — AG-UI Event-Schema
kore/ui/static/             — agrex + ReactFlow Frontend
```

**Tools (6):**
| Tool | Rolle | Befehl |
|---|---|---|
| **AG-UI Protocol** | Event-Standard für Agent↔UI | `pip install ag-ui` |
| **agrex** | Echtzeit-DAG-Visualisierung | `npm install agrex` |
| **LangGraph Viz** | Live X-Ray + Time-Travel | `pip install langgraph-viz` |
| **LangGraph Studio V2** | Dev IDE für Graph-Architektur | `pip install langgraph-studio` |
| **Minions** | Runtime Kanban + SSE + Escalation | `npx minions` |
| **CrewForm** | Vollständige UI-Plattform | Docker (self-hosted) |

---

## 3. Layer-Architektur — Alle Tools in einer Ansicht

```
                    KORE MISSION CONTROL (Sprint 8)
                    agrex + AG-UI + Minions + LangGraph Studio
                              │
                    ┌─────────▼──────────┐
                    │  AG-UI Protocol     │  ← Event-Transport (SSE/WS)
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  KORE ORCHESTRATOR  │  ← Sprint 5 Eigenbau
                    │  LangGraph (Graph)  │
                    │  Temporal (Durable) │
                    └─────────┬──────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  ARCHITECT     │  │   BUILDER      │  │    CRITIC      │
│  (Role Engine) │  │  OpenHands     │  │  AgentDebug    │
│  PydanticAI    │  │  AutoGen Loop  │  │  CASS Memory   │
│  NetworkX DAG  │  │  Aider CLI     │  │  Z3 Constraint │
└────────────────┘  └────────────────┘  └────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│    TESTER      │  │ MEMORY KEEPER  │  │   DONE GATE    │
│  pytest/mypy   │  │  Qdrant (K2)   │  │  HarnessScore  │
│  Playwright    │  │  CASS (K3)     │  │  4-State       │
│  open-bench    │  │  REGAL (Abstr) │  │  LLM Judge     │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## 4. Aktivierungs-Reihenfolge

### Phase 1 — Sofort (Heute aktivierbar, Sprint 5)
```powershell
# Python-Tools
pip install langgraph openhands ag2 networkx pydantic-ai aider-chat langgraph-viz

# Node-Tools (optional für UI-Prototyping)
npm install agrex

# Docker-Tools (optional für Durability)
docker run -d --name temporalite temporalio/temporalite:latest start-ns default
```

### Phase 2 — Sprint 6 (Nach Failure-Classifier fertig)
```powershell
pip install agent-debug z3-solver qdrant-client
npx cass-memory init
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

### Phase 3 — Sprint 7 (Nach Harness Engine fertig)
```powershell
pip install playwright black mypy pytest pytest-cov bandit regal open-bench
playwright install
playwright install-deps
```

### Phase 4 — Sprint 8 (Nach Mission Control fertig)
```powershell
pip install ag-ui langgraph-studio
npx minions init
docker run -d --name crewform crewform/crewform:latest
```

---

## 5. Key-Entscheidungen aus den Runs

### Was NICHT gebaut wird
| Tool | Grund |
|---|---|
| **RouteLLM pip package** | `abacus-free-f` + Vesica + S7 decken Routing ab |
| **Ollama DeepSeek** | Widerspricht Gear-Set-Philosophie (`parallel=1`) |
| **Standalone LM-Sys** | Bereits in `agents/swarm.py` integriert |
| **Neues Router-Framework** | GreyRoute DSL + LiteLLM Config reichen |

### Was ersetzt wurde
| Run-Ergebnis | Ersetzt |
|---|---|
| GAP-Pattern (Paper) → bewiesen dass parallele Graph-Execution 33% schneller | Bestätigt Dyson Road Design |
| AgentDebug Taxonomy → 6 Klassen | Ersetzt ad-hoc Failure-Handling |
| CASS Memory → K2/K3 + Trauma Guard | Ersetzt einfaches Vector Store Pattern |
| REGAL → gradient-freie Abstraktion | Ersetzt DreamCoder (zu heavy) |
| AG-UI Protocol → Event-Standard | Ersetzt proprietäre WebSocket-Protokolle |

### Offene Entscheidungen (bis Bench)
| Tool | Entscheidung wann |
|---|---|
| Temporal vs. Prefect | Sprint 5 Ende — wenn Durable Execution nötig |
| CrewForm vs. Eigenbau UI | Sprint 8 Start — wenn AG-UI nicht reicht |
| Self-Healing Framework Paper | Sprint 6 — Reliability Model Code verfügbar |
| TDP Framework | Sprint 6 — wenn Replanner zu langsam |

---

## 6. Zusammenfassung: DysonCode in 2 Minuten

```
DysonCode = 
  LangGraph (Graph)
  + OpenHands (Execution) 
  + AutoGen (Inner Loop)
  + NetworkX (DAG)
  + PydanticAI (Artefakte)
  + Temporal (Durability)
  + AgentDebug (Failure)
  + Z3 (Constraint)
  + CASS+Qdrant (Memory)
  + REGAL (Abstraction)
  + Playwright+open-bench (Testing)
  + agrex+AG-UI+LangGraph Studio (UI)
  ────────────────────────────────────────
  = 15 Kern-Tools, 35 evaluiert, 7 sofort aktivierbar
```

**Nächster Schritt:** `pip install langgraph openhands ag2 networkx pydantic-ai aider-chat` — dann Sprint 5 starten.
