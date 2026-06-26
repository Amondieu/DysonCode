# KORE Inner Circle v1 — Grey-OS Architektur-Dokument

**Datum:** 2026-06-23  
**Kontext:** Sprint 5–8 Backlog, Dateistruktur, Zustandsmodell, Prompt-Protokoll  
**Stack-Basis:** Grey-OS / Swarm-Pipeline / Forge-PIL / Vesica / LiteLLM  

---

## Executive Summary

Der KORE Dyson Coding Mode ist kein neuer Parallel-Stack — er ist ein **Alias-Mapping** auf die bestehende Grey-OS-Swarm-Pipeline. Die fünf Inner-Circle-Rollen (Architect, Builder, Critic, Tester, Memory Keeper) mappen direkt auf `ARCHITECT`/`HACKER` (Stage 4), Vesica/Compost (Critic), `judge`+pytest (Tester) und `fast-draft`+Headroom (Memory Keeper). Der größte Hebel für `selfCompletionRate → 1.0` liegt in **Orchestrierung**: Stage-4-Parallel, Vesica-Gap→Joker, Compost-Loop — nicht in neuen Modell-Familien.

---

## 1. Dateistruktur — Sprint 5–8

```
grey-os/
├── kore/                              # NEU: KORE Dyson Mode Kernel
│   ├── __init__.py
│   ├── orchestrator.py                # Sprint 5: Kern-Orchestrator
│   ├── role_engine.py                 # Sprint 5: Role Runtime
│   ├── task_graph.py                  # Sprint 5: DAG + Dyson Road
│   ├── contract_registry.py           # Sprint 5: Interface Contracts
│   ├── failure_classifier.py          # Sprint 6: Failure-Taxonomie
│   ├── constraint_injector.py         # Sprint 6: Failure → Constraint
│   ├── replanner.py                   # Sprint 6: Dyson Road Optimizer
│   ├── harness_engine.py              # Sprint 7: Scoring + Done Detector
│   ├── done_gate.py                   # Sprint 7: 4-State Verdict
│   └── ui/                            # Sprint 8: Mission Control
│       ├── mission_control.py         # FastAPI SSE Server
│       ├── events.py                  # AG-UI Event-Types
│       └── static/                    # agrex + ReactFlow Frontend
│
├── data/routes/
│   └── kore-inner-circle-v1.yaml      # NEU: Rollen-Routing-Config
│
├── agents/
│   └── swarm.py                       # BESTEHEND: Stage 4 erweitert
│
├── routing/
│   ├── vesica_router.py               # BESTEHEND: Critic-Layer
│   └── greyroute.py                   # BESTEHEND: DSL erweitert
│
├── forge/
│   ├── burst_dispatch.py              # BESTEHEND: Builder-PIL-Pool
│   └── compost.py                     # BESTEHEND: Failure-Recovery
│
├── memory/                            # BESTEHEND: Memory Keeper
│   └── headroom.py
│
└── infra/
    ├── litellm-config.yaml            # BESTEHEND: Alias-Registry
    └── litellm_hooks.py               # BESTEHEND: Token-Tracking
```

---

## 2. `data/routes/kore-inner-circle-v1.yaml`

```yaml
# KORE Inner Circle v1 — Rollenbasiertes Routing auf Grey-OS-Aliase
# Passt in die bestehende GreyRoute DSL (routing/greyroute.py)

route:
  name: kore-inner-circle-v1
  version: 1
  description: >
    Dyson Mode Inner Circle — 5 Rollen, strukturierte Artefakt-Kommunikation.
    Kein neuer Modell-Stack: Mapping auf bestehende LiteLLM-Aliase.

  roles:

    architect:
      # Reasoning-Heavy: Spec-Zerlegung, DAG-Ableitung, Interface-Contracts
      local:          coder          # SET-A: Qwen2.5-Coder-14B Q8
      cloud:          burst          # deepseek-v4-pro (Key 1)
      fallback:       deep           # SET-C: Qwen2.5-Coder-32B Q4
      offline_gate:   true           # fällt auf SET-C wenn cloud nicht verfügbar
      thinking:       false          # kein SN-thinking für Architect
      max_tokens:     4096
      temperature:    0.1
      complexity_threshold: 0.5      # < 0.5 → creative (SET-D), ≥ 0.5 → coder/burst
      artefact_out:   BuildManifest  # typisierter PydanticAI Output

    builder:
      # Speed + Volume: Code-Impl, File-I/O, Tool-Calls
      local:          coder          # SET-A
      cloud_primary:  flash-k2       # deepseek-v4-flash (Key 2) — Forge PIL
      cloud_volume:   mid            # deepseek-v4-pro (Key 2) — PIL-Burst
      fallback:       forge-base     # Ring 0 lokal
      abacus_free:    abacus-free-c  # DeepSeek-V3.2 @ Abacus (Ring 1, $0)
      synergy_gate:   HYBRID_CD      # → erzwingt burst für komplexe Tasks
      max_tokens:     8192
      temperature:    0.1
      artefact_out:   CodeDelta      # typisierter Diff-Output

    critic:
      # Strukturierte Analyse: Spec-Drift-Detection, Overengineering-Check
      local:          forge-base     # Ring 0 — privat, schnell
      cloud:          flash-sn-think # SambaNova DeepSeek + thinking
      escalation:     critic-frontier  # o4-mini @ Abacus (50/day cap)
      joker_trigger:  0.20           # vesica_gap > 0.20 → joker
      compost_alias:  burst          # GREYOS_COMPOST_CRITIC_ALIAS
      max_tokens:     2048
      temperature:    0.1
      artefact_out:   FailureNote    # typisierter Critic-Output

    tester:
      # Deterministic First, LLM Advisory
      deterministic:  init.sh        # pytest + compileall + cargo check
      llm_judge:      judge          # SambaNova gpt-oss-120b — eval/tie-break
      schema_guard:   micro-coder    # CATALYST 1.5B CPU :8094
      max_tokens:     512
      temperature:    0.0            # deterministisch
      artefact_out:   TestResult     # Pass/Fail + Coverage-Score

    memory_keeper:
      # Kompression + Persistenz — NIE Cloud
      local:          fast-draft     # SET-D: Qwen2.5-7B Q8
      compress_hook:  headroom       # GREYOS_HEADROOM=1
      cloud:          never          # PII-safe: kein Cloud-Leak
      intent_bridge:  intent         # 3B router für Session-Lookup
      max_tokens:     1024
      temperature:    0.2
      artefact_out:   MemorySnapshot  # komprimierter State

  second_opinion:
    # Übereinanderliegende Routing-Mechanismen — KEIN lm-sys/RouteLLM pip
    complexity_scorer:  _complexity_score     # S7 in agents/swarm.py
    complexity_gate:    0.5                   # GREYOS_COMPLEXITY_THRESHOLD
    route_llm:          abacus-free-f         # Abacus auto-router (Ring 1)
    vesica_pair:        [c, d]               # flash + burst Consensus
    vesica_gap_gate:    0.20                  # gap > 0.20 → joker

  privacy_gates:
    local_only_aliases: [researcher, deep]    # Scholar + Sage NIE Cloud
    pii_fail_closed:    true                  # Cloud-Aliase blockiert bei PII
    key1_reserved:      true                  # flash + burst nicht in PIL-Volume
```

---

## 3. Zustandsmodell — Dyson Mode State Machine

```
KORE DYSON MODE — State Machine (kore/orchestrator.py)

                    ┌─────────────────┐
                    │   IDLE          │
                    │  (kein aktiver  │
                    │   Sprint)       │
                    └────────┬────────┘
                             │ start_sprint(spec)
                             ▼
                    ┌─────────────────┐
                    │  PLANNING       │ ← Architect: Spec → DAG
                    │  Architect zerlegt        BuildManifest
                    │  Spec in DAG    │
                    └────────┬────────┘
                             │ manifest_validated
                             ▼
          ┌──────────────────────────────────────┐
          │         EXECUTING                    │
          │  Dyson Road: Knoten für Knoten       │
          │                                      │
          │  ┌─────────────┐                     │
          │  │  NODE_READY │ ← nächster Knoten   │
          │  │  (Builder)  │   mit min. Risiko   │
          │  └──────┬──────┘                     │
          │         │                            │
          │         ▼                            │
          │  ┌─────────────┐                     │
          │  │  NODE_REVIEW│ ← Critic-Pass       │
          │  │  (Critic)   │   wenn complexity≥0.5│
          │  └──────┬──────┘                     │
          │         │                            │
          │         ▼                            │
          │  ┌─────────────┐                     │
          │  │  NODE_TEST  │ ← Tester: pytest +  │
          │  │  (Tester)   │   judge + schema     │
          │  └──────┬──────┘                     │
          │         │                            │
          │    ┌────┴──────┐                     │
          │    │           │                     │
          │  PASS        FAIL                    │
          │    │           │                     │
          │    ▼           ▼                     │
          │  NODE_DONE  BLOCKED ──→ HEALING      │
          └────────────────┬──────────────────── ┘
                           │
               ┌───────────┴───────────┐
               ▼                       ▼
          ┌─────────┐           ┌────────────┐
          │ HEALING │           │  DONE_GATE │
          │         │           │            │
          │ 1. Failure-         │ Score ≥0.90│ → SPRINT_DONE
          │    Classifier       │ Score<0.90 │ → PARTIAL
          │ 2. Constraint-      │ Hard-Gate  │
          │    Injection        │   failed   │ → BLOCKED
          │ 3. Z3 sat/unsat     │ UNDECIDABLE│ → HUMAN_GATE
          │ 4. Replanner        └────────────┘
          │    (neuer Pfad)
          └─────────┬───────────
                    │
              sat → EXECUTING (neuer Knoten)
              unsat → HUMAN_GATE

          ┌──────────────────┐
          │   HUMAN_GATE     │ ← PAUSE / REDIRECT / CANCEL
          │   (Mission       │   Autonomy Controls
          │    Control UI)   │
          └──────────────────┘

          ┌──────────────────┐
          │   SPRINT_DONE    │ ← Memory Keeper schreibt Snapshot
          │                  │   REGAL: Abstraction-Extraktion
          │                  │   K2 Pattern Library Update
          └──────────────────┘
```

### State-Enum (`kore/orchestrator.py`)

```python
from enum import Enum, auto

class DysonState(Enum):
    IDLE          = auto()
    PLANNING      = auto()
    EXECUTING     = auto()
    NODE_READY    = auto()
    NODE_REVIEW   = auto()
    NODE_TEST     = auto()
    NODE_DONE     = auto()
    HEALING       = auto()
    DONE_GATE     = auto()
    HUMAN_GATE    = auto()
    SPRINT_DONE   = auto()
    BLOCKED       = auto()

class DoneVerdict(Enum):
    DONE          = "score >= 0.90 AND all hard gates passed"
    PARTIAL       = "0.70 <= score < 0.90"
    BLOCKED       = "any hard gate failed"
    UNDECIDABLE   = "llm_judge=null OR z3=unsat OR timeout > 0.10"
```

---

## 4. Sprint 5–8 Backlog

### Sprint 5: Orchestrator Kernel

**Ziel:** KORE kann ein Projekt-Spec in graphische Arbeitseinheiten zerlegen und an getrennte Rollen verteilen.

**Artefakte:**

```
kore/orchestrator.py       — DysonOrchestrator: State Machine + LangGraph Graph
kore/role_engine.py        — RoleRuntime: Rolleninstanziierung aus YAML
kore/task_graph.py         — TaskGraph: NetworkX DAG + topological_generations()
kore/contract_registry.py  — ContractRegistry: PydanticAI Artefakt-Typen
data/routes/kore-inner-circle-v1.yaml
```

**Akzeptanzkriterien:**
- [ ] `orchestrator.py` nimmt `Spec` → gibt `BuildManifest` (DAG + Knoten-Liste) zurück
- [ ] `task_graph.py` berechnet `topological_generations()` → parallele Execution-Levels
- [ ] `contract_registry.py` validiert alle 5 Artefakt-Typen (PydanticAI Schema)
- [ ] `role_engine.py` liest `kore-inner-circle-v1.yaml` → instanziiert Rollen mit korrekten Aliassen
- [ ] State Machine traversiert: IDLE → PLANNING → EXECUTING → NODE_READY

**Build-Order Sprint 5:**
```
1. contract_registry.py     (Artefakt-Typen zuerst — keine Abhängigkeiten)
2. task_graph.py            (NetworkX DAG, unabhängig)
3. role_engine.py           (liest YAML + Contracts)
4. kore-inner-circle-v1.yaml (Routing-Config)
5. orchestrator.py          (integriert alle obigen)
```

---

### Sprint 6: Self-Healing — Failure-Constraint Loop

**Ziel:** Jeder Fehler wird automatisch als neue Planungsrestriktion in den Dyson Road Optimizer eingespeist.

**Artefakte:**

```
kore/failure_classifier.py  — 6-Klassen-Taxonomie (AgentDebug-kompatibel)
kore/constraint_injector.py — FailureNote → Constraint-Objekt → NetworkX Edge
kore/replanner.py           — Z3 sat/unsat + neuer Minimum-Energy-Pfad
forge/compost.py            — BESTEHEND: erweitert um Constraint-Feedback
```

**Failure-Taxonomie (6 Klassen):**

| Klasse | Constraint-Formul | Grey-OS-Aktion |
|--------|-------------------|----------------|
| `SPEC_DRIFT` | Architect re-freeze | `run_architect()` neu |
| `REASONING_PROBLEM` | Builder CoT-Validation | Critic-Pass erzwingen |
| `TOOL_CALL_FAILURE` | Dependency Y zuerst | DAG-Edge umrouten |
| `MEMORY_FAILURE` | Memory Keeper Recall | `headroom` trigger |
| `PLANNING_FAILURE` | Preconditions inkonsistent | Z3 sat-check |
| `ACTION_FAILURE` | Retry alternativer Pfad | `compost` loop |

**Akzeptanzkriterien:**
- [ ] Jeder Fehler erzeugt typisiertes `FailureNote`-Objekt (PydanticAI)
- [ ] `constraint_injector.py` fügt neue Edge in NetworkX-DAG ein
- [ ] `replanner.py`: Z3 `sat` → neuer Pfad, `unsat` → HUMAN_GATE
- [ ] `GREYOS_COMPOST_CRITIC=1` löst Critic-Pass bei jeder Action-Failure aus
- [ ] State Machine: BLOCKED → HEALING → EXECUTING (neuer Knoten)

---

### Sprint 7: Real Done — Harness Scoring + Done Detector

**Ziel:** "Fertig" bedeutet Zielerfüllung, Tests, UX-Gates und Architektur-Konsistenz — nicht nur Kompilierung.

**Artefakte:**

```
kore/harness_engine.py  — 4-Pillar-Scoring: Build + Tests + Coverage + UX
kore/done_gate.py       — 4-State-Verdict: DONE / PARTIAL / BLOCKED / UNDECIDABLE
```

**Scoring-Modell:**

```python
@dataclass
class HarnessScore:
    build:        float  # 0.0 / 1.0 (Hard Gate)
    tests:        float  # 0.0 / 1.0 (Hard Gate: 0 failures)
    coverage:     float  # 0.0–1.0 (Soft: ≥ 0.80)
    type_safety:  float  # 0.0 / 1.0 (mypy: 0 errors)
    architecture: float  # 0.0–1.0 (dependency violations)
    ux_gate:      float  # 0.0 / 1.0 (axe-core critical = 0)
    llm_judge:    float  # 0.0–1.0 (advisory, JSON-validated)

    WEIGHTS = {
        "build": 0.20, "tests": 0.25, "coverage": 0.15,
        "type_safety": 0.10, "architecture": 0.15,
        "ux_gate": 0.10, "llm_judge": 0.05
    }

    def verdict(self) -> DoneVerdict:
        hard_gates = [self.build == 1.0, self.tests == 1.0]
        if not all(hard_gates):
            return DoneVerdict.BLOCKED
        if self.llm_judge is None:
            return DoneVerdict.UNDECIDABLE
        score = sum(getattr(self, k) * w for k, w in self.WEIGHTS.items())
        if score >= 0.90:
            return DoneVerdict.DONE
        if score >= 0.70:
            return DoneVerdict.PARTIAL
        return DoneVerdict.BLOCKED
```

**Akzeptanzkriterien:**
- [ ] `harness_engine.py` führt: `black --check` + `mypy` + `pytest --cov` + `bandit` + `axe-core`
- [ ] `judge`-Alias (SambaNova gpt-oss-120b) liefert JSON-Schema-validiertes Verdict
- [ ] `done_gate.py` gibt exakt einen der 4 States zurück — kein ambiguous Return
- [ ] `history.jsonl` trackt Score-Drift über Sprint-Grenzen
- [ ] State Machine: NODE_TEST → DONE_GATE → SPRINT_DONE / PARTIAL / BLOCKED

---

### Sprint 8: Dyson Mode UX — Mission Control

**Ziel:** Autonomer Betriebszustand sichtbar machen ohne Mikromanagement.

**Artefakte:**

```
kore/ui/mission_control.py  — FastAPI + SSE Server (AG-UI Events)
kore/ui/events.py           — Typed Event-Schema (AG-UI Protocol)
kore/ui/static/             — agrex + ReactFlow Frontend
```

**Mission Control Layout:**

```
┌──────────────┬──────────────────────────┬──────────────────────┐
│  LEFT PANEL  │     CENTER CANVAS        │    RIGHT PANELS      │
│              │                          │                      │
│  Project     │  Dyson Road Graph        │  Inner Circle        │
│  Spec        │  (agrex + ReactFlow)     │  Role Stream (SSE)   │
│              │  Live-Knoten-Status:     │                      │
│  Interface   │  RUNNING / DONE /        │  Architect: ...      │
│  Contracts   │  BLOCKED / HEALING       │  Builder: ...        │
│              │                          │  Critic: ...         │
│  Constraint  │  [PAUSE] [REDIRECT]      │                      │
│  Registry    │  [CANCEL]                │  Harness Score       │
│              │                          │  Build:  ✅          │
│  Memory      │  Current Node: B2        │  Tests:  ✅          │
│  Snapshots   │  Role: Builder           │  Cover:  78% ⚠️      │
│              │  Risk: 0.12 LOW          │  Score:  0.87        │
│              │  Alias: flash-k2         │  PARTIAL             │
│              │                          │                      │
│              │  Progress: ████░░ 78%    │  [DONE GATE]         │
└──────────────┴──────────────────────────┴──────────────────────┘
```

**AG-UI Events (`kore/ui/events.py`):**

```python
from enum import Enum

class KOREEvent(str, Enum):
    NODE_START   = "kore.node.start"    # { nodeId, role, alias, risk }
    NODE_DONE    = "kore.node.done"     # { nodeId, verdict, score }
    NODE_BLOCKED = "kore.node.blocked"  # { nodeId, failureClass, constraint }
    ROLE_STREAM  = "kore.role.stream"   # { role, token, artefactType }
    ROAD_UPDATE  = "kore.road.update"   # { newEdges, removedEdges, reason }
    SCORE_UPDATE = "kore.score.update"  # { HarnessScore }
    HUMAN_GATE   = "kore.human.gate"    # { reason, z3Result, options }
    SPRINT_DONE  = "kore.sprint.done"   # { finalScore, verdict, duration }
```

**Akzeptanzkriterien:**
- [ ] FastAPI SSE-Endpoint `/kore/events` emittiert alle KOREEvent-Typen
- [ ] agrex-Graph updated Knoten-Status in Echtzeit (≤ 500ms Latenz)
- [ ] PAUSE / REDIRECT / CANCEL über WebSocket-Commands
- [ ] `GREYOS_CLOUD_BURST=1` + `GREYOS_STAGE4_PARALLEL=1` sichtbar in UI
- [ ] Mission Control läuft vollständig lokal (kein Cloud-UI-Dependency)

---

## 5. Prompt-Protokoll pro Rolle

### Architect — `BuildManifest` Prompt

```
SYSTEM: Du bist der Architect im KORE Inner Circle.
Deine Aufgabe: Zerlegung des Projekt-Specs in einen Dependency-Graphen.

REGELN:
- Output ist ausschließlich ein BuildManifest (JSON, PydanticAI-Schema)
- Keine freie Prosa — nur strukturierte Artefakte
- Jeder Knoten hat: id, title, depends_on[], risk_score (0.0–1.0), role
- Minimum-Energy-Pfad: höchster Fortschritt bei niedrigstem Risiko zuerst
- Bei complexity_score < 0.5: verwende creative (SET-D), nicht coder
- Bei Spec-Ambiguität: erzeuge UNDECIDABLE-Flag → Human Gate

INPUT: {project_spec}
OUTPUT FORMAT: BuildManifest { nodes: [...], edges: [...], critical_path: [...] }
```

### Builder — `CodeDelta` Prompt

```
SYSTEM: Du bist der Builder im KORE Inner Circle.
Deine Aufgabe: Implementierung exakt des nächsten Knotens auf der Dyson Road.

REGELN:
- Implementiere NUR den zugewiesenen Knoten — kein Scope-Creep
- Output ist CodeDelta: { files_changed: [...], diff: "...", test_commands: [...] }
- Bei fehlender Dependency: erzeuge ToolCallFailure → Constraint-Injection
- Keine Erklärungen — nur Code + Diff
- forge-base als lokaler Fallback wenn flash-k2 nicht verfügbar

INPUT: { node: TaskNode, contracts: InterfaceContract[], memory_context: Pattern[] }
OUTPUT FORMAT: CodeDelta { files_changed, diff, test_commands, confidence }
```

### Critic — `FailureNote` Prompt

```
SYSTEM: Du bist der Critic im KORE Inner Circle.
Deine Aufgabe: Strukturierte Fehleranalyse — keine freie Debatte.

REGELN:
- Output ist ausschließlich FailureNote (JSON) oder PASS-Signal
- Prüfe auf: Spec-Drift, Overengineering, falsche Abhängigkeiten, Reasoning-Probleme
- Bei vesica_gap > 0.20: eskaliere zu joker-Alias
- Bei Debatte ohne Konvergenz: erzeuge SPEC_UNCLEAR-Constraint → Architect re-freeze
- flash-sn-think nur wenn enable_thinking in extra_body konfiguriert

INPUT: { code_delta: CodeDelta, original_spec: Spec, constraint_history: Constraint[] }
OUTPUT FORMAT: FailureNote { class: FailureClass, constraint: str, severity: 0–3 } | PASS
```

### Tester — `TestResult` Prompt

```
SYSTEM: Du bist der Tester im KORE Inner Circle.
Deine Aufgabe: Validierung von Verhalten, Build, Typen und Regressionen.

REGELN (Priorität-Reihenfolge):
1. DETERMINISTISCH ZUERST: pytest + compileall + mypy + bandit (init.sh)
2. LLM-ADVISORY: judge (gpt-oss-120b) — nur wenn deterministischer Layer passed
3. SCHEMA: micro-coder (1.5B) — JSON-Output-Validierung
4. HarnessScore generieren → done_gate.py übergeben
5. Bei 0 Failures deterministisch: LLM Judge = advisory (kein Hard Gate)

INPUT: { code_delta: CodeDelta, test_commands: [...] }
OUTPUT FORMAT: TestResult { passed: bool, coverage: float, score: HarnessScore }
```

### Memory Keeper — `MemorySnapshot` Prompt

```
SYSTEM: Du bist der Memory Keeper im KORE Inner Circle.
Deine Aufgabe: Kompression und Persistenz des Session-Zustands.

REGELN:
- NIE Cloud — ausschließlich fast-draft (SET-D) lokal
- Nach jedem erfolgreichen Knoten: Pattern in K2 Library (Qdrant)
- Nach jedem Failure: Anti-Pattern in K3 Guard (CASS Trauma Guard)
- MemorySnapshot muss vollständig genug sein dass neue Session den Zustand rekonstruiert
- Headroom-Hook: GREYOS_HEADROOM=1 aktiviert automatische Kompression
- Confidence Decay: Pattern-Relevanz sinkt ohne Bestätigung

INPUT: { node_result: NodeResult, constraint_history: [...], prior_snapshot: MemorySnapshot }
OUTPUT FORMAT: MemorySnapshot { patterns_added: int, anti_patterns_added: int, compressed_state: str }
```

---

## 6. Aktivierungsreihenfolge (minimaler Eingriff)

Für sofortige Nutzung ohne neue Dateien:

```powershell
# Stage 4 parallel — Builder + Architect gleichzeitig
$env:GREYOS_STAGE4_PARALLEL = "1"

# Cloud-Eskalation für non-PII Architect/Builder
$env:GREYOS_CLOUD_BURST = "1"

# Critic-Pipeline
$env:GREYOS_COMPOST_CRITIC = "1"
$env:GREYOS_COMPOST_CRITIC_ALIAS = "burst"

# Complexity-Router
$env:GREYOS_COMPLEXITY_THRESHOLD = "0.5"
$env:GREYOS_SCHEMA_GUARD = "1"

# Builder-Pool (Forge PIL)
$env:GREYOS_FORGE_BURST_PROVIDERS = "flash-k2,mid"
```

**Nicht aktivieren ohne Bench:**
- `flash-sn2` — provisional bis `ops/qa_provider_bench.py` ✅
- `fast` → SambaNova-Swap — SN-1 pending in `litellm-config.yaml`

---

## 7. Abweichungen von KORE-Original

| KORE-Vorschlag | Grey-OS-Realität | Entscheidung |
|---|---|---|
| Ollama DeepSeek R1/V3 | llama-swap Qwen Gear-Sets | Gear-Sets behalten — ein GPU-Stack |
| `litellm.fallbacks` global | Per-Alias `litellm-config.yaml` + Vesica | Erweitern, nicht ersetzen |
| RouteLLM pip package | `abacus-free-f` + Vesica + S7 | Kein zweites Router-Framework |
| DeepAgent API | Nicht konfiguriert | `flash-k2`/`mid`/`burst` Pool |
| 5 isolierte Agent-Prozesse | LangGraph Swarm + Forge Stage 4 | Mapping auf Stage 4 + Forge |
| Thinking budget 4096 | SN: `enable_thinking` in extra_body | Nur `flash-sn-think`, nicht global |
| Standalone Z3 per Query | Z3 nur bei PLANNING_FAILURE + unsat | Gezielt, kein globaler Overhead |

---

## 8. Gesamtarchitektur

```
LITELLM :4000  (einziger Client-Pfad, ADR-001)
PiiGuard → Headroom → Alias-Routing
│
├── LOKAL (llama-swap :8080)
│   SET-A Architect/Builder │ SET-B Scholar │ SET-C Sage
│   SET-D Memory │ Micro: router / intent / micro-coder
│
├── CLOUD POOL (non-PII, GREYOS_CLOUD_BURST=1)
│   Builder:   flash-k2, mid
│   Architect: burst
│   Critic:    flash-sn-think, critic-frontier, joker
│   Tester:    judge
│   Free:      abacus-free-a..f (Ring 1, $0)
│
├── SECOND OPINION
│   S7 complexity │ Vesica c↔d │ abacus-free-f route-llm
│
└── KORE INNER CIRCLE (kore/)
    Orchestrator → Role Engine → Task Graph → Contract Registry
    Failure Classifier → Constraint Injector → Replanner
    Harness Engine → Done Gate
    Mission Control UI (agrex + AG-UI + FastAPI SSE)
```
