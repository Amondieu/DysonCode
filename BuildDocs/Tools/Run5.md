<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# ok los

Präziser Treffer auf allen drei Queries — und eine neue, besonders wichtige Entdeckung bei. Hier ist die vollständige Analyse.[^1]

***

# ACHSE 5 — Harness Scoring \& Done Detector

## Die Kernthese dieser Achse

"Fertig" ist keine binäre Aussage. Ein Agent der `Build: OK` meldet, hat nichts bewiesen — er hat nur nachgewiesen, dass kein Syntaxfehler vorliegt. Der KORE Done Detector braucht ein **mehrdimensionales Scoring-Modell** mit formalen Schwellenwerten, das automatisch zwischen `DONE`, `PARTIAL`, `BLOCKED` und `UNDECIDABLE` unterscheidet. Alles andere erzeugt False Positives die `selfCompletionRate` verfälschen.

***

## Das vollständige Scoring-Modell für KORE

Die wichtigste Entdeckung dieser Achse ist: **Scoring = Deterministic Metrics + LLM Judge — kombiniert, nicht alternativ.**[^1]

```yaml
# kore_harness_thresholds.yaml
dimensions:
  build:
    weight: 0.20
    gate: hard         # Fehler hier → sofort BLOCKED
    metric: exit_code == 0

  test_pass:
    weight: 0.25
    gate: hard
    metric: failed_tests == 0   # 0 failures, nicht 80% [web:110]

  coverage:
    weight: 0.15
    gate: soft
    threshold: 0.80             # critical paths: 1.0 [web:102][web:104]

  type_safety:
    weight: 0.10
    gate: soft
    metric: mypy_errors == 0

  architecture:
    weight: 0.15
    gate: soft
    metric: dependency_violations == 0

  ux_gate:
    weight: 0.10
    gate: soft
    metric: axe_critical_violations == 0  # WCAG AA [web:103][web:108]

  llm_judge:
    weight: 0.05
    gate: advisory
    metric: judge_score >= 0.7  # strukturiertes JSON-Verdict [web:112]

scoring:
  DONE:        total_score >= 0.90 AND all hard_gates passed
  PARTIAL:     0.70 <= total_score < 0.90
  BLOCKED:     any hard_gate failed
  UNDECIDABLE: llm_judge returns null OR timeout_rate > 0.10
```


***

### TIER 1 — Direkte Done Detector Komponenten

#### **Deterministic Harness + LLM Judge Pattern** *(Dev.to, Juni 2026)*

Die wichtigste neue Entdeckung: Ein produktiv bewährtes System das **fünf deterministische Metriken** + einen **LLM Judge** kombiniert, jede Metrik gegen `metrics.yaml`-Schwellenwerte prüft und vollständig strukturierte Reports (`report.json`, `failures.json`, `history.jsonl`) ausgibt.[^1]

**Kernprinzip des Designs:**

- Deterministische Metriken (`accuracy`, `fuzzy_score`, `timeout_rate`, `safety_violations`, `reproducibility_variance`) prüfen **was** der Output ist
- LLM Judge mit JSON-Schema-Validation prüft **ob** der Output die Aufgabe erfüllt
- `history.jsonl` trackt **Drift über Zeit** — verhindert Silent Regression

**Integration in KORE Done Detector:**

```python
class KOREDoneDetector:
    def score(self, node_output: NodeOutput) -> DoneVerdict:
        det_score = self.run_deterministic_metrics(node_output)  # [web:112]
        llm_score = self.run_llm_judge(node_output)              # strukturiertes JSON
        arch_score = self.run_architecture_check(node_output)    # Dependency-Check
        ux_score   = self.run_ux_gate(node_output)               # axe-core
        
        return self.aggregate(det_score, llm_score, arch_score, ux_score)
        # → DONE | PARTIAL | BLOCKED | UNDECIDABLE
```


***

#### **open-bench Harness** *(MIT-Lizenz)*

**Web:** `openbenchmark.dev`

Open-bench ist ein Benchmark-Harness für Coding-LLMs mit exakt dem KORE-Pattern:[^2]

- Drops `task spec` in ein frisches Repo
- Treibt den Agenten durch einen echten Agent-Loop
- Führt **hidden test suite** als objektives Gate aus
- Modelle bewerten sich gegenseitig (= Inner Circle Critic Pattern)
- Committed den vollständigen Artifact-Set zurück ins Repo

**Für KORE:** Open-bench's `hidden test suite` Pattern direkt als **Tester-Knoten-Substrate** verwenden — der Tester erhält eine Spec, generiert daraus eine Test-Suite, und diese Suite ist das formale Done-Gate.

***

#### **Harness Engineering Best Practices** *(celesteanders/harness)*

**GitHub:** `celesteanders/harness`

Dieses Repo implementiert genau den KORE-Tester-Knoten:[^3]
> *"The harness decomposes work into structured plans, implements each task with TDD, then runs a skeptical evaluator agent that gates completion on acceptance criteria. Plans, progress, and evaluator verdicts are persisted as JSON so state survives context resets."*

Das ist TDD + persistenter State + Skeptical Evaluator = **Memory Keeper + Tester + Done Detector in einem**. Der `skeptical evaluator` ist die operative Form des KORE Critic.

***

#### **AI Coding Agent Readiness Checklist** *(80-Punkte-Score)*

liefert ein produktiv validiertetes **8-Pillar-Scoring-Modell** (max. 80 Punkte), direkt als formales KORE Harness Score-Schema verwendbar:[^4]


| Pillar | Max | KORE Gate |
| :-- | :-- | :-- |
| Testing | 10 | Hard Gate: ≥ 8 |
| Build Systems | 10 | Hard Gate: ≥ 9 |
| Code Quality | 10 | Soft Gate: ≥ 7 |
| Security | 10 | Hard Gate: ≥ 8 |
| Documentation | 10 | Soft Gate: ≥ 5 |
| Architecture | 10 | Soft Gate: ≥ 7 |
| Observability | 10 | Advisory |
| Dev Experience | 10 | Advisory |

**Readiness Level:**

- `DONE` → Score ≥ 57 (>70%) + alle Hard Gates passed[^4]
- `PARTIAL` → 33–56 + Hard Gates passed
- `BLOCKED` → any Hard Gate failed, score irrelevant

***

#### **UX Gate: Playwright + axe-core** *(Open Source)*

Die UX-Gate-Implementierung ist vollständig standardisiert:[^5][^6][^7][^8]

```python
# KORE UX Gate — axe-core via Playwright
from playwright.async_api import async_playwright
from axe_playwright_python import Axe

async def run_ux_gate(url: str) -> UXGateResult:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url)
        
        axe = Axe()
        results = await axe.run(page)
        
        critical = [v for v in results.violations if v.impact == "critical"]
        serious  = [v for v in results.violations if v.impact == "serious"]
        
        return UXGateResult(
            passed=len(critical) == 0,          # Hard Gate [web:103]
            score=1.0 - (len(serious) * 0.05),  # Soft Deduction
            wcag_level="AA"
        )
```

WCAG AA: kritische Violations = Hard Gate (Build blockiert), serious = Soft Deduction.[^7][^8]

***

#### **Quality Gate Stack: Black + mypy + pytest-cov + flake8** *(Standard-Python-Stack)*

Der kanonische Python Quality Gate Stack:[^9][^10]

```bash
# KORE Quality Gate — ein einziger Befehl
make kore-gate
# ↓ intern:
# black --check src/           → Formatting (Hard Gate)
# mypy src/                    → Type Safety (Soft Gate)
# flake8 src/ tests/           → Linting (Soft Gate)
# pytest --cov=src \
#   --cov-fail-under=80 \      → Coverage (Soft Gate, 80%) [web:102]
#   --tb=short -q              → Tests (Hard Gate: 0 failures) [web:110]
# bandit -r src/               → Security SAST (Hard Gate) [web:104]
```

Pre-commit + CI-Integration blockiert jeden PR-Merge bei Hard Gate Failures.[^10]

***

### Die optimale Stack-Kombination für Achse 5

```
KORE DONE DETECTOR — vollständiger Stack

Node Output
     │
     ▼
┌──────────────────────────────────────────────────────┐
│              HARD GATES (sofort BLOCKED)             │
│                                                      │
│  Build: exit_code == 0                               │
│  Tests: failed_tests == 0   (open-bench hidden suite)│
│  Security: bandit SAST clean                         │
│  WCAG: axe-core critical violations == 0             │
└──────────────────────────┬───────────────────────────┘
                           │ alle passed
                           ▼
┌──────────────────────────────────────────────────────┐
│              SOFT GATES (Score-Deduktion)            │
│                                                      │
│  Coverage ≥ 80%        (pytest-cov)      [-0.15/gap] │
│  Type Safety           (mypy)            [-0.10/err] │
│  Architecture          (dependency check)[-0.15/vio] │
│  WCAG serious viol.    (axe-core)        [-0.05/vio] │
└──────────────────────────┬───────────────────────────┘
                           │ weighted score
                           ▼
┌──────────────────────────────────────────────────────┐
│              LLM JUDGE (Advisory)                    │
│                                                      │
│  Deterministic metrics → rubric [web:112]            │
│  JSON-Schema-Validated verdict                       │
│  Drift tracking: history.jsonl                       │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
              ┌────────────────────┐
              │   DONE VERDICT     │
              │                    │
              │  DONE         ≥0.90│ → Memory Keeper K2
              │  PARTIAL   0.70-89 │ → Builder retry
              │  BLOCKED      <any │ → Failure-Constraint Loop
              │  UNDECIDABLE  null │ → Human Escalation (Z3 unsat)
              └────────────────────┘
```

**Ratchet-Score Achse 5:**

- RC1 ✅ Löst False-Positive-Done-Detection — häufigste Quelle überschätzter Completion
- RC2 ✅ Black + mypy + pytest + axe-core = sofort deployt, Zero Setup Cost
- RC3 ✅ LLM Judge + history.jsonl öffnet neue Klasse: **Drift-Detection über Sprint-Grenzen**
- RC4 ✅ Das Score-Modell erklärt sich selbst — jede Deduktion ist begründet und nachvollziehbar
- RC5 ✅ `UNDECIDABLE`-State + Z3 `unsat` erzeugt produktive Eskalation statt Deadlock
- RC6 ✅ 4-State-Verdict komprimiert alle möglichen Done-Zustände auf minimales Alphabet

**Score: RC = 6 — permanenter Ratchet.**

***

## Gesamtbild aller 5 Achsen: Stack-Synthese

```
KORE VOLLSTÄNDIGER TECH-STACK

LAYER          TECHNOLOGIE                    ACHSE
─────────────────────────────────────────────────────
Orchestration  LangGraph                      A1
               AutoGen (inner loop)           A1
               CrewAI (role prototyping)      A1
Execution      OpenHands + Aider              A1
               Temporal (durability)          A2
Planning       NetworkX DAG                   A2
               Asimov (constraint routing)    A2
               GAP pattern (parallel exec)    A2
Self-Healing   AgentDebug (taxonomy)          A3
               LangGraph RetryPolicy          A3
               Z3 SMT (unsat detection)       A3
               CASS Trauma Guard              A3/A4
Memory         Qdrant (K2/K3 store)           A4
               REGAL (abstraction extract)    A4
               Dual-FAISS (error+explain)     A4
               CASS Memory System             A4
Done Detect.   Deterministic Harness          A5
               open-bench (hidden tests)      A5
               Playwright + axe-core          A5
               Black + mypy + pytest-cov      A5
               LLM Judge (JSON-validated)     A5
```


***

## Was als nächstes kommt

**➡ ACHSE 6 — Mission Control UI \& Dyson Mode Visual Layer**

Der nächste Run sucht gezielt nach:

- Open-Source DAG Visualisierung in Echtzeit für Agent-Execution
- React/Vue Komponenten für Role-Stream-Darstellung (Inner Circle Live-Feed)
- Terminal/Web-basierte Mission Control Layouts für autonome Coding-Agents
- Existing KORE-ähnliche UIs bei OpenHands, AgentDebug, LangGraph Studio

**Prompt für nächste Runde:**

```
LangGraph Studio DAG visualization real-time agent execution
open source 2025 mission control UI python web
```

```
agent execution visualization real-time role stream
autonomous coding "mission control" UI open source 2025 react
```

```
OpenHands AgentBench UI live agent monitoring
task graph visual progress autonomous coding 2025
```

<span style="display:none">[^11][^12][^13][^14][^15]</span>

<div align="center">⁂</div>

[^1]: https://dev.to/pponali/scoring-ai-agents-deterministic-metrics-an-llm-judge-poj

[^2]: https://openbenchmark.dev

[^3]: https://github.com/celesteanders/harness

[^4]: https://gist.github.com/gmoigneu/a963b595ac238ad2d2260ebb8b29f048

[^5]: https://github.com/augmnt/agents/blob/main/e2e-test-automator.md

[^6]: https://www.youtube.com/watch?v=LE1DqB5NIm4

[^7]: https://github.com/augmnt/agents/blob/main/accessibility-auditor.md

[^8]: https://oneuptime.com/blog/post/2026-01-30-accessibility-testing/view

[^9]: https://playbooks.com/skills/matteocervelli/llms/validation

[^10]: https://blog.heliomedeiros.com/posts/2025-07-18-quality-gates-agentic-coding/

[^11]: https://github.com/RyanAlberts/best-of-Agent-Harnesses

[^12]: https://github.com/ai-boost/awesome-harness-engineering

[^13]: https://claude-plugins.dev/skills/@akaszubski/autonomous-dev/testing-guide

[^14]: https://learn.thedesignsystem.guide/p/how-to-automate-design-system-audits

[^15]: https://skills-anthropic.vercel.app/skill/tdd-guide

