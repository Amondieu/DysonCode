# KORE — Jcode Master Brief
**Datum:** 2026-06-23 | **Kontext:** Grey-OS / Dyson Coding Mode  
**Zweck:** Vollständige Übergabe an Jcode — komprimiert, ausführungsbereit

---

## 0. Die Kernformel

> **KORE ist kein Agent. Es ist ein autonomer Projekt-Kernel.**

```
Autonomie = Road Quality × Memory Continuity × Recovery Quality × Done Detection
```

Wenn einer der vier Faktoren → 0, fällt `selfCompletionRate` unabhängig von Modellqualität.

---

## 1. Dyson Levels D0–D4

| Level | Modus | Steuerung | Kernmechanismus | Done-Kriterium |
|---|---|---|---|---|
| **D0** | Chat Assist | Mensch steuert alles | einzelne Tool-/Code-Antworten | Aufgabe beantwortet |
| **D1** | Guided Mode | Mensch setzt Tasks | saubere Ausführung pro Schritt | Task fertig |
| **D2** | Builder Mode | KORE plant Teilstrecken | DAG + Role Runtime + Contracts | Sprint-Teilziel fertig |
| **D3** | Dyson Mode | Inner Circle steuert Baupfad | Dyson Road + Critic + Self-Healing | Projekt autonom nah an Done |
| **D4** | Blacksmith Mode | System führt Projekt selbstständig aus | Failure→Constraint + Harness + Done Gate + Mission Control | `selfCompletionRate → 1.0` |

**Zielmodus heute: D3.**  
D4 ist erreichbar, sobald Sprint 7–8 stabil läuft.

---

## 2. Die fünf Rollen — Inner Circle

Rollen kommunizieren **nur über typisierte Artefakte** — keine freie Prosa, keine Debatten.

| Rolle | Grey-OS Äquivalent | Artefakt-Out | Restriction |
|---|---|---|---|
| **Architect** | `ARCHITECT` Stage 4 | `BuildManifest` | redacted brief, PflichtInput |
| **Builder** | `HACKER` Stage 4 + Forge PIL | `CodeDelta` | nur aktueller Dyson-Knoten |
| **Critic** | Vesica Shadow + Compost + Joker | `FailureNote` | strukturiert, keine Debatte |
| **Tester** | init.sh / pytest + judge + micro-coder | `TestResult` | deterministisch first, LLM advisory |
| **Memory Keeper** | Memory Stack + fast-draft + Headroom | `MemorySnapshot` | **NIE Cloud** |

---

## 3. Dyson Road

Kein starres To-Do. Der Kernel wählt immer:

```
nächster_Knoten = argmax( Fortschritt / Risiko ) mit verfügbarem Kontext
```

**Impl:** NetworkX DAG + `topological_generations()` → parallele Execution-Levels  
**Datei:** `kore/task_graph.py`

---

## 4. State Machine (Kurzform)

```
IDLE → PLANNING (Architect: Spec → BuildManifest)
     → EXECUTING → NODE_READY → NODE_REVIEW (wenn complexity ≥ 0.5)
                              → NODE_TEST
                              → NODE_DONE ─────────────┐
                              → BLOCKED → HEALING ──── → EXECUTING (neuer Knoten)
                                          └─ unsat    → HUMAN_GATE
     → DONE_GATE → SPRINT_DONE / PARTIAL / BLOCKED / UNDECIDABLE

v2-Zusatz: CLOUD_DEGRADED, PII_HOLD
```

**Hard Gates:** `build == 1.0` AND `tests == 1.0` → Pflicht für `DONE`  
**Score:** ≥ 0.90 → DONE | 0.70–0.89 → PARTIAL | < 0.70 oder Hard-Gate-Fail → BLOCKED

---

## 5. Failure → Constraint Injection Loop

> Das ist der stärkste Hebel für hohe Completion Rates.

| Failure-Klasse | Constraint | Aktion |
|---|---|---|
| `SPEC_DRIFT` | Architect re-freeze | `run_architect()` neu |
| `REASONING_PROBLEM` | Builder CoT-Validation | Critic-Pass erzwingen |
| `TOOL_CALL_FAILURE` | Dependency Y zuerst | DAG-Edge umrouten |
| `MEMORY_FAILURE` | Recall aktivieren | `headroom` trigger |
| `PLANNING_FAILURE` | Preconditions inkonsistent | Z3 sat-check |
| `ACTION_FAILURE` | Alternativer Pfad | `compost` loop |
| `CLOUD_OUTAGE` | lokaler Notfallmodus | CLOUD_DEGRADED State |

**Z3:** `sat` → Replanner berechnet neuen Pfad | `unsat` → HUMAN_GATE

---

## 6. Harness Scoring — Was "Fertig" bedeutet

```python
WEIGHTS = {
    "build":        0.20,   # Hard Gate
    "tests":        0.25,   # Hard Gate (0 Failures)
    "coverage":     0.15,   # Soft: ≥ 0.80
    "type_safety":  0.10,   # mypy 0 errors
    "architecture": 0.15,   # dependency violations
    "ux_gate":      0.10,   # axe-core critical = 0
    "llm_judge":    0.05,   # advisory, JSON-validated
}
```

**Tool-Chain:** `black --check` + `mypy` + `pytest --cov` + `bandit` + `axe-core` + `judge` (SambaNova gpt-oss-120b)

---

## 7. Routing-Matrix: v1 vs v2

### v1 — Hybrid-Local (Default)

| Rolle | Lokal (primär) | Cloud (non-PII) | Fallback |
|---|---|---|---|
| Architect | `coder` SET-A | `burst` | `deep` SET-C |
| Builder | `coder` SET-A | `flash-k2` / `mid` | `forge-base` |
| Critic | `forge-base` Ring 0 | `flash-sn-think` | `critic-frontier` / `joker` |
| Tester (LLM) | `micro-coder` | `judge` advisory | — |
| Memory Keeper | `fast-draft` SET-D | **NEVER** | — |

### v2 — Cloud-First (Hochleistungsmodus)

| Rolle | Cloud (primär) | Lokal (nur Fallback) | Kostenprofil |
|---|---|---|---|
| Architect | `burst` → `mid` → `frontier` | `deep` / `coder` | mittel–hoch |
| Builder | `flash-k2` → `mid` → `abacus-free-c` → `burst` | `forge-base` | niedrig–mittel |
| Critic | `flash-sn-think` → `critic-frontier` → `joker` | `forge-base` | mittel–hoch |
| Tester (LLM) | `judge` standard | `micro-coder` | niedrig |
| Memory Keeper | `fast-draft` SET-D | **NEVER Cloud** | $0 |

### v1 vs v2 Entscheidungsregel

| Szenario | Wahl |
|---|---|
| Nightly Forge, Budget-bewusst, privacy-sensitiv | **v1** |
| Schwere Refactors, SWE-Bench-ähnliche Tasks | **v2** |
| PII-lastige Domänen (Recovery, Legal) | **v1** oder v2 nur mit Redaction-Gate |
| Air-gapped / Offline | **v1** |

**Pragmatisch:** v2 zuerst nur für Builder + Critic aktivieren. Architect eine Woche auf v1 lassen bis `ops/qa_provider_bench.py` grün.

---

## 8. Lokaler Modell-Stack (Grey-OS Gear-Sets)

| Set | Modell | Rolle | VRAM |
|---|---|---|---|
| SET-A | Qwen2.5-Coder-14B Q8 | Architect, Builder, ORACLE | ~16 GB |
| SET-B | Qwen2.5-14B Q6_K | Scholar (LOCAL_ONLY) | ~12 GB |
| SET-C | Qwen2.5-Coder-32B Q4 | SAGE / Deep synthesis | ~20 GB |
| SET-D | Qwen2.5-7B Q8 | Memory Keeper, trivial drafts | ~8 GB |
| Micro | 0.5B / 1.5B / 3B CPU | Router, Schema, Intent | CPU only |

**Kein zweiter Inference-Stack** (kein paralleles Ollama) — widerspricht Gear-Set-Philosophie und `parallel=1`.

---

## 9. Second Opinion Layer

Drei übereinanderliegende Mechanismen — kein externes RouteLLM-Paket nötig:

```
1. _complexity_score (S7)     → < 0.5: direct to Tester | ≥ 0.5: Critic-Pass
2. abacus-free-f route-llm    → Abacus Auto-Router (Ring 1, $0)
3. Vesica c↔d (flash + burst) → vesica_gap > 0.20 → joker
```

---

## 10. Privacy Gates (nicht verhandelbar)

```python
LOCAL_ONLY_ALIASES = ["researcher", "deep"]   # Scholar + Sage NIE Cloud
# PII detected → alle Cloud-Aliase blockiert
# Memory Keeper → cloud: never (harte Invariante beider Modi)
# Architect/Builder cloud-first → PFLICHT: scholar_redacted_brief() vor Cloud-Call
```

---

## 11. Dateistruktur

```
grey-os/
├── kore/
│   ├── orchestrator.py          Sprint 5  State Machine + LangGraph
│   ├── role_engine.py           Sprint 5  YAML → Rollen-Instanziierung
│   ├── task_graph.py            Sprint 5  NetworkX DAG + Dyson Road
│   ├── contract_registry.py     Sprint 5  PydanticAI Artefakt-Typen
│   ├── failure_classifier.py    Sprint 6  6-Klassen-Taxonomie
│   ├── constraint_injector.py   Sprint 6  FailureNote → DAG-Edge
│   ├── replanner.py             Sprint 6  Z3 + neuer Minimum-Energy-Pfad
│   ├── harness_engine.py        Sprint 7  7-Pillar-Scoring
│   ├── done_gate.py             Sprint 7  4-State-Verdict
│   └── ui/
│       ├── mission_control.py   Sprint 8  FastAPI SSE Server
│       ├── events.py            Sprint 8  AG-UI Event-Schema
│       └── static/              Sprint 8  agrex + ReactFlow Frontend
└── data/routes/
    ├── kore-inner-circle-v1.yaml           Hybrid-Local
    └── kore-inner-circle-v2-cloud.yaml     Cloud-First
```

---

## 12. Sprint 5–8 Build-Order

### Sprint 5 — Orchestrator Kernel
**Build-Order (Abhängigkeiten beachten):**
```
1. contract_registry.py     ← keine Abhängigkeiten; alle anderen importieren dies
2. task_graph.py            ← NetworkX DAG, unabhängig
3. role_engine.py           ← liest YAML + Contracts
4a. kore-inner-circle-v1.yaml
4b. kore-inner-circle-v2-cloud.yaml  (nach role_engine.py)
5. orchestrator.py          ← integriert alle obigen
```
**Akzeptanz:** `IDLE → PLANNING → EXECUTING → NODE_READY` läuft durch.

### Sprint 6 — Self-Healing
```
1. failure_classifier.py    ← 6 + 1 (CLOUD_OUTAGE) Klassen
2. constraint_injector.py   ← FailureNote → NetworkX Edge
3. replanner.py             ← Z3 sat/unsat + neuer Pfad
4. compost.py erweitern     ← Constraint-Feedback-Loop
```
**Akzeptanz:** `BLOCKED → HEALING → EXECUTING` (neuer Knoten) läuft durch.

### Sprint 7 — Real Done
```
1. harness_engine.py        ← 7-Pillar, Hard Gates, Tool-Chain
2. done_gate.py             ← 4-State-Verdict, DoneVerdict Enum
```
**Akzeptanz:** `NODE_TEST → DONE_GATE → SPRINT_DONE/PARTIAL/BLOCKED` läuft durch.

### Sprint 8 — Mission Control
```
1. events.py                ← KOREEvent Enum (8 Event-Typen)
2. mission_control.py       ← FastAPI + SSE /kore/events
3. static/                  ← agrex + ReactFlow (3-Panel-Layout)
```
**Akzeptanz:** Live-Knoten-Status + PAUSE/REDIRECT/CANCEL + CLOUD/LOCAL/DEGRADED-Badge.

---

## 13. Sofort-Aktivierung (PowerShell — minimaler Eingriff)

```powershell
# v1 Hybrid (Default — heute aktivierbar)
$env:GREYOS_STAGE4_PARALLEL     = "1"
$env:GREYOS_CLOUD_BURST         = "1"
$env:GREYOS_COMPOST_CRITIC      = "1"
$env:GREYOS_COMPOST_CRITIC_ALIAS = "burst"
$env:GREYOS_FORGE_BURST_PROVIDERS = "flash-k2,mid"
$env:GREYOS_COMPLEXITY_THRESHOLD = "0.5"
$env:GREYOS_SCHEMA_GUARD        = "1"

# v2 Cloud-First (zusätzlich)
$env:GREYOS_KORE_ROUTING_MODE   = "cloud_first"
$env:GREYOS_KORE_ROUTE          = "kore-inner-circle-v2-cloud"
$env:GREYOS_MEMORY_LOCAL_ONLY   = "1"
$env:GREYOS_SCHOLAR_REDACT_CLOUD = "1"
```

**NICHT aktivieren ohne Bench:** `flash-sn2` (provisional), `fast`→SN-1 (pending).

---

## 14. Mission Control Layout

```
┌──────────────┬──────────────────────────┬──────────────────────┐
│  LEFT PANEL  │     CENTER CANVAS        │    RIGHT PANELS      │
│  Project Spec│  Dyson Road Graph        │  Inner Circle Stream │
│  Contracts   │  (agrex + ReactFlow)     │  Architect: ...      │
│  Constraints │  RUNNING/DONE/BLOCKED    │  Builder: ...        │
│  Memory Snap │  [PAUSE][REDIRECT][CANCEL│  Critic: ...         │
│              │  Node: B2 | Risk: 0.12   │  ──────────────────  │
│              │  Role: Builder           │  Harness Score       │
│              │  Alias: flash-k2         │  Build:  ✅          │
│              │  CLOUD/LOCAL/DEGRADED    │  Tests:  ✅          │
│              │  Progress: ████░░ 78%    │  Score:  0.87 PARTIAL│
└──────────────┴──────────────────────────┴──────────────────────┘
```

---

## 15. Kernformel (nochmals — zum Einprägen)

```
KORE = Orchestrator
     + Role Engine (5 Rollen, typisierte Artefakte)
     + Task Graph (Dyson Road: min. Energie, max. Fortschritt)
     + Contract Registry (PydanticAI, keine Debatten)
     + Failure → Constraint Loop (Fehler werden Planungs-Constraints)
     + Harness Done Gate (7 Pillar, 4 States, 2 Hard Gates)
     + Mission Control (Sehen ohne Mikromanagen)

v1 = hybrid-local   (lokal primär, Cloud bei Bedarf)
v2 = cloud-first    (Cloud primär, lokal nur Degraded + Memory Keeper)
Memory Keeper = immer lokal — in beiden Modi, keine Ausnahme
```
