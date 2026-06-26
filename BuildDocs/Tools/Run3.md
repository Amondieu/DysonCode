<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# ok nächster run

Exzellenter Ernte. Hier ist die vollständige Analyse von Achse 3 — der dichtesten und akademisch am besten unterstützten Achse bisher.

***

# ACHSE 3 — Self-Healing \& Failure-to-Constraint Loop

## Die wichtigste Entdeckung zuerst

**Drei Paper konvergieren auf denselben Befund:** ca. **30% aller autonomen Agent-Trajectories scheitern**. Das ist kein Edge-Case — das ist der Normalzustand. Self-Healing ist damit nicht eine optionale Erweiterung von KORE, sondern strukturell notwendig für `selfCompletionRate = 1.0`. Die drei Paper liefern gleichzeitig die **präziseste Failure-Taxonomie**, die als direktes Input-Schema für KOREs Failure-Classifier verwendbar ist.[^1][^2][^3]

***

## Die kanonische Failure-Taxonomie für KORE

Aus zwei komplementären Quellen  ergibt sich eine **Sechs-Klassen-Taxonomie**, die direkt in den KORE Failure Classifier eingebaut werden sollte:[^4][^2][^1]


| Klasse | Quelle | KORE Constraint-Formul |
| :-- | :-- | :-- |
| **Specification Drift** | [^2] | `CONSTRAINT: Spec-Scope hat sich verändert — Architect muss Re-Freeze auslösen` |
| **Reasoning Problems** | [^2] | `CONSTRAINT: LLM-Output inkonsistent — Builder-Knoten erfordert CoT-Validation` |
| **Tool Call Failures** | [^2] | `CONSTRAINT: Tool X blockiert — Dependency Y muss zuerst gebaut werden` |
| **Memory Failures** | [^4] | `CONSTRAINT: Kontext fehlt — Memory Keeper muss Snapshot-Recall auslösen` |
| **Planning Failures** | [^4] | `CONSTRAINT: Dyson Road-Knoten hat inkonsistente Preconditions` |
| **Action Failures** | [^4] | `CONSTRAINT: Execution fehlgeschlagen — Retry mit alternativem Pfad` |

Das ist das **Failure-Constraint-Mapping** — jede Klasse erzeugt eine präzise Planungsrestriktion statt nur einen Fehlerlog.[^5][^4]

***

### TIER 1 — Direkte Failure-Loop Implementierungen

#### **AgentDebug** *(UIUC, Open Source)*

**GitHub:** `ulab-uiuc/AgentDebug`
**Paper:** arXiv 2509.25370

AgentDebug ist der direkteste akademische Baustein für KOREs Failure-Constraint Loop. Das System isoliert Root-Cause-Failures auf Modul-Ebene, generiert korrigierende Feedback-Signale und ermöglicht iterative Recovery. Gemessene Ergebnisse: **+24% all-correct accuracy**, **+26% task success rate** durch iteratives Recovery über Failure-Feedback.[^6][^7]

**Warum Tier 1:**

- `AgentErrorTaxonomy` = die sechs Klassen oben — direkt als KORE Failure Classifier verwendbar
- `AgentErrorBench` = Benchmark-Suite zum Testen ob KORE selbst korrekt heilt
- `AgentDebug` Framework = Root-Cause-Isolation → Corrective Feedback → genau das ist die Failure-to-Constraint Loop

**Integration:** AgentDebug's Failure-Classifier als **Modul im KORE Critic** — der Critic ruft AgentDebug auf, erhält eine klassifizierte Failure Note, die direkt in den Constraint Injector geht.

***

#### **LangGraph Fault Tolerance + RetryPolicy** *(bereits Achse 1)*

LangGraph hat einen vollständig implementierten Fault-Tolerance-Stack:[^8][^9]

- `RetryPolicy(max_attempts=3, initial_interval=1.0)` pro Node konfigurierbar
- Exponential Backoff mit Jitter
- Nach Retry-Erschöpfung: State in Checkpoint persistiert → inspizierbar + manuell rekoverierbar
- `compensation_branch` Routing: bei Failure wird nicht abgebrochen, sondern ein alternativer Graph-Pfad aktiviert

**Das ist die Dyson Road Failure-to-Constraint Loop nativ in LangGraph.** Der `compensation_branch` ist der alternative Pfad der nach Constraint-Injection berechnet wird.[^8]

```python
# KORE Failure-Constraint Loop in LangGraph
workflow.add_conditional_edges(
    "builder_node",
    failure_classifier,  # AgentDebug → gibt Constraint-Klasse zurück
    {
        "spec_drift": "architect_node",      # → Architect re-freezes
        "tool_failure": "dependency_node",   # → fehlende Dependency zuerst
        "reasoning_problem": "critic_node",  # → Critic mit CoT-Validation
        "memory_failure": "memory_keeper",   # → Memory Keeper Recall
        "done": "tester_node"
    }
)
```


***

#### **Self-Healing Framework (arXiv 2605.06737, Mai 2026)** *(aktuellstes Paper)*

Das neueste relevante Paper: *"A Self-Healing Framework for Reliable LLM-Based Autonomous Agents"*, Mai 2026. Drei Kernkomponenten:[^5]

1. **Failure Detection** — Identifiziert abnormales Agent-Verhalten durch Execution-Pattern-Analyse + Output-Consistency-Check
2. **Reliability Assessment Model** — Quantitatives Scoring wie zuverlässig ein Agent auf einem Knoten-Typ war (direkt für Harness Score verwendbar)
3. **Adaptive Replanning** — Dynamisches Recovery durch Constraint-basiertes Neuberechnen des Plans

**Integration in KORE:** Die Reliability Assessment Component geht direkt in den **Memory Keeper K2 Pattern Library** — erfolgreiche Knoten erhalten höheren Reliability Score, zukünftige Dyson Road bevorzugt Pfade durch High-Reliability-Knoten. Das ist der Ω2-Fitness-Landscape-Inverter angewendet auf Execution-Pfade.

***

#### **Self-Healing Code mit LangGraph + PydanticAI** *(Produktion-Pattern)*

Das produktiv bewährteste Pattern:[^10]

```
Execution → Validation (PydanticAI Schema) → Reflection → Correction
     ↑_______________________________________________|
```

Vier Phasen mit einer kritischen Sicherheitsregel: **`max_retries` + Human-in-the-Loop als Escape-Hatch** wenn der Agent nach N Versuchen nicht konvergiert. Das ist der `UNDECIDABLE`-State aus dem Tester-Protokoll — strukturell korrekte Eskalation, kein Versagen.[^10]

***

### TIER 2 — Spezialisierte Constraint-Solver

#### **Z3 SMT-Solver** *(Microsoft Research, MIT-Lizenz)*

**GitHub:** `Z3Prover/z3`

Z3 ist der stärkste formale Constraint-Solver — kann prüfen ob eine Constraint-Menge `sat` (erfüllbar), `unsat` (widersprüchlich) oder `unknown` ist. Für KORE relevant wenn der Failure-Constraint Loop **Widersprüche** im Constraint-Graph erzeugt — Z3 detektiert exakt welche Constraints kollidieren.[^11][^12]

**Konkrete KORE-Anwendung:**

```python
from z3 import Solver, Bool, And, Not

s = Solver()
s.add(dependency_constraint_C003)
s.add(new_failure_constraint_C011)
result = s.check()
# sat → Dyson Road kann neu berechnet werden
# unsat → Architekt muss Constraint-Konflikt auflösen → Eskalation
```

Das ist der **Gödel-Bridge-Mechanismus** aus dem Tester-Protokoll: `unsat` = `UNDECIDABLE`-State, strukturell korrekte Eskalation an den Menschen.

***

#### **Self-Healing AI System** *(Open Source)*

**GitHub:** `trivedikavya/Self-Healing-AI-System`

Drei-Agenten-System: **Crash-Agent → AI Mechanic (Diagnose) → AI Surgeon (Code Rewrite)**. Das ist der minimale Selbstheilungs-Loop in reinem Python — als Referenzimplementierung und Test-Substrate nützlich.[^13]

***

### Die optimale Stack-Kombination für Achse 3

```
KORE FAILURE-CONSTRAINT LOOP — vollständiger Stack

Failure Event
      │
      ▼
┌─────────────────────┐
│  AgentDebug         │  ← Root-Cause-Isolation
│  Failure Classifier │    6-Klassen-Taxonomie
│  (ulab-uiuc)        │    +24% recovery accuracy
└──────────┬──────────┘
           │ Klasse + Confidence
           ▼
┌─────────────────────┐
│  Constraint         │  ← Failure → neue Planungsrestriktion
│  Formulator         │    PydanticAI: typisiertes Constraint-Objekt
│  (KORE eigener Code)│    Z3: Satisfiability-Check
└──────────┬──────────┘
           │ sat / unsat / unknown
     ┌─────┴─────┐
     ▼           ▼
 [sat]        [unsat/unknown]
 LangGraph     Human-in-Loop
 Replanning    Eskalation
 compensation  (Tester: UNDECIDABLE)
 _branch
     │
     ▼
Dyson Road Optimizer
(NetworkX: neuer Minimum-Energy-Pfad)
```

**Ratchet-Score Achse 3:**

- RC1 ✅ Löst 30% Failure-Rate in autonomen Agents direkt
- RC2 ✅ AgentDebug + LangGraph RetryPolicy = sofort einsetzbar
- RC4 ✅ AgentErrorTaxonomy lehrt durch Nutzung was schiefläuft
- RC5 ✅ Z3 `unsat` erzeugt produktive Widersprüche → zwingt Architektur-Evolution
- RC6 ✅ 6-Klassen-Taxonomie komprimiert alle möglichen Fehler auf minimale Beschreibung
- RC7 ✅ Substrat-unabhängig: lokal, Docker, Cloud

***

## Was als nächstes kommt

**➡ ACHSE 4 — Semantic Code Memory \& Pattern Library (Memory Keeper K2/K3)**

Der nächste Run sucht gezielt nach:

- Vector Stores für strukturelle Code-Ähnlichkeit (nicht nur semantic similarity)
- Library Learning Systeme die Abstractions aus gelösten Problemen extrahieren
- DreamCoder / LAPS Implementierungen
- Code-Embedding Modelle die Constraint-Signaturen erfassen

**Prompt für nächste Runde:**

```
"library learning" "program synthesis" abstraction extraction
code patterns python open source 2024 2025 github "DreamCoder" OR "LAPS"
```

```
"semantic code search" structural similarity embedding
vector store code patterns "constraint signature" python 2025
```

```
"code memory" agent "past solutions" retrieval pattern reuse
autonomous coding python 2024 2025 github open source
```

<span style="display:none">[^14][^15][^16][^17][^18][^19]</span>

<div align="center">⁂</div>

[^1]: https://openreview.net/attachment?id=gJ9pQ8xLs0\&name=pdf

[^2]: https://openreview.net/forum?id=gJ9pQ8xLs0

[^3]: https://rzem.guru/ai-agents-of-the-week-papers-you-should-know-about-feb-22-2026

[^4]: https://huggingface.co/papers/2509.25370

[^5]: https://arxiv.org/abs/2605.06737v1

[^6]: https://x.com/jiqizhixin/status/1988714418423648523

[^7]: https://github.com/ulab-uiuc/AgentDebug

[^8]: https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph

[^9]: https://deepwiki.com/langchain-ai/langgraph/3.8-error-handling-and-retry-policies

[^10]: https://tekko.id/en/blog/building-self-healing-ai-langgraph-and-pydanticai-workflows

[^11]: https://ece.uwaterloo.ca/~agurfink/stqam.w19/assets/pdf/W04-UsingZ3.pdf

[^12]: https://stackoverflow.com/questions/60417149/z3-planning-problems-and-blocks-world/60420118

[^13]: https://github.com/trivedikavya/Self-Healing-AI-System

[^14]: https://github.com/Pradeepkarra1/Self-Healing-Data-Pipelines

[^15]: https://github.com/NirDiamant/GenAI_Agents/blob/main/all_agents_tutorials/self_healing_code.ipynb

[^16]: https://github.com/coco-robotics/planning_by_SMT

[^17]: https://github.com/tmgthb/Autonomous-Agents

[^18]: https://www.calibreos.com/learn/genai-agent-failure-modes

[^19]: https://arxiv.org/pdf/2509.25370.pdf

