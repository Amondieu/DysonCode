<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# dann suche nach einander nach den optimalen tools und besten kombinationen sie sollten open source sein , starte mit der ersten richtung und schreibe am ende was als nächstes kommen sollte behalte immer den nächsten Prompt am ende vor um die Übersicht nicht zu verlieren

Perfekt — genug Signal für Achse 1. Jetzt kommt die vollständige Analyse.

***

# ACHSE 1 — Orchestration \& Multi-Agent Role Engine

## Tier-Klassifikation nach KORE-Kompatibilität

Die Frame-Analyse ergibt drei Tiers — nicht nach Popularität, sondern nach **struktureller Isomorphie** mit dem Inner Circle + Dyson Road.

***

### TIER 1 — Direkte Kernel-Kandidaten

#### **LangGraph** *(LangChain-Ecosystem, MIT-Lizenz)*

**GitHub:** `langchain-ai/langgraph`

LangGraph ist strukturell der nächste Verwandte des KORE-Orchestrators. Sein Modell ist ein **gerichteter Graph mit persistentem State** — exakt die Datenstruktur der Dyson Road. Jeder Knoten ist ein ausführbarer Agent-Step, Kanten sind Constraints, der State-Store ist der Kontext-Speicher.[^1][^2]

**Warum Tier 1:**

- Graph-Execution = Dyson Road nativ
- Persistenter State über Sessions = Memory Keeper Substrate
- Conditional Edges = Failure-to-Constraint Loop direkt modellierbar
- Human-in-the-Loop = Dyson Mode UX Gate
- Laut 2026-Vergleich: *"LangGraph wins for control and reliability — best for production systems with complex routing and explicit state audit trails"*[^2]

**Lücke:** Keine nativen Rollen-Constraints, kein Harness Scoring — das ist KORE's eigener Beitrag.

***

#### **OpenHands** *(ehemals OpenDevin, MIT-Lizenz)*

**GitHub:** `OpenHands/OpenHands`

OpenHands ist der vollständigste offene Autonome-Agent-Stack — mit **72% SWE-bench Verified** in aktuellen Benchmarks. Das Agent SDK ist ein composable Python-Library, das exakt als Substrate für den KORE Inner Circle verwendbar ist.[^3][^4][^5]

**Warum Tier 1:**

- Multi-Agent Coordination bereits eingebaut
- Sandboxed Code Execution (Docker) = sicherer Builder-Modus
- Agent-SDK als Python-Library = KORE kann darauf aufsetzen, nicht konkurrieren
- Koordiniert mit SWE-bench = Harness-Scoring Substrate vorhanden

**Integration-Strategie:** OpenHands als **Execution Layer** unter KORE's Inner Circle — KORE plant und routet, OpenHands führt aus.

***

#### **AutoGen / AG2** *(Microsoft Research → Community Fork AG2, MIT-Lizenz)*

**GitHub:** `microsoft/autogen` / `ag2ai/ag2`

AutoGen hat das stärkste **generate → execute → fix Loop** aller Frameworks. Der AssistantAgent generiert Code, UserProxyAgent führt aus, bei Fehler automatische Reparatur — das ist der Failure-to-Constraint Loop in Rohform.[^6][^2]

**Warum Tier 1 (als Innerer Loop-Motor):**

- Auto-Iteration bei Fehler = Selbstheilung nativ
- Code Execution in lokalem oder Docker-Sandbox
- Critic + Coder als separate Agents = Inner Circle Rohstruktur
- Best für: *"coding agents (write + execute + debug loop)"*[^2]

**Integration-Strategie:** AutoGen als **Inner Loop Engine** für Builder + Critic in KORE — der schnelle iterative Zyklus, während LangGraph den äußeren Orchestrations-Graph hält.

***

### TIER 2 — Ergänzende Spezialisten

#### **Aider** *(MIT-Lizenz)*

**GitHub:** `paul-gauthier/aider`

Aider ist terminal-first, git-nativ, BYOM (Bring Your Own Model) und hat einen eigenen **generate-test-repair Cycle**. Mit `--architect` Mode trennt es Planning von Execution — exakt die Architect/Builder-Rollentrennung.[^7][^8]

**KORE-Relevanz:** Aider als **CLI-Substrate für Builder-Knoten** — direkt von der Dyson Road aufgerufen, git-commit-fähig nach jedem Knoten, lokale Modelle (DeepSeek) nativ unterstützt.

**Besonderheit:** *"preferred choice for engineers who want full BYOM, run locally, keep output inside existing git workflow"*  — perfekt für Dyson Mode's autonome Execution ohne Cloud-Abhängigkeit.[^8]

***

#### **Sweep AI** *(Open Source, Apache 2.0)*

**GitHub:** `sweepai/sweep`

Sweep liest komplette Repositories via **Dependency Graph Analysis + Vector Search**, plant Code-Changes und öffnet PRs mit CI-Validierung. Das ist der Memory Keeper's K2-Pattern-Matching in Praxis-Form.[^9]

**KORE-Relevanz:** Sweep's Dependency Graph Analyzer direkt als Input für den **Dyson Road Optimizer** — Sweep analysiert, KORE routet. Sweep kann auch als autonomer PR-Generator nach Done-Detection verwendet werden.

***

#### **PydanticAI** *(MIT-Lizenz)*

**GitHub:** `pydantic/pydantic-ai`

PydanticAI bringt **type-safe Agent-Outputs** und strukturierte Artefakt-Kommunikation. Das ist exakt das, was der Inner Circle braucht: Rollen kommunizieren nicht frei, sondern über typisierte Artefakte (Spec, FailureNote, TestResult).[^10][^11]

**KORE-Relevanz:** PydanticAI als **Artefakt-Typisierungs-Layer** für alle Inner-Circle-Kommunikation — jedes Artefakt-Format (BuildManifest, FailureNote, MemorySnapshot) wird als Pydantic-Model definiert, Kommunikationsfehler werden compile-time erkannt.

***

#### **CrewAI** *(MIT-Lizenz)*

**GitHub:** `crewAIInc/crewAI`

CrewAI hat die einfachste Role-Definition und `allow_delegation=False` verhindert Infinite Loops  — relevant für den Critic, der nie eigenständig delegieren soll.[^6]

**KORE-Relevanz:** CrewAI als **schnelles Prototyping-Substrate** für Dyson Mode UI — die Role-Stream-Visualisierung kann auf CrewAI's Event-System aufsetzen, bevor ein eigener Runtime gebaut wird.

***

### Die optimale Stack-Kombination für KORE

```
KORE ORCHESTRATION STACK — Achse 1

┌─────────────────────────────────────────────────────┐
│  KORE Inner Circle (eigener Code)                   │
│  Architect | Builder | Critic | Tester | MemKeeper  │
│  Kommunikation: PydanticAI typisierte Artefakte     │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│   LangGraph    │   │  AutoGen AG2    │
│  (Outer Graph) │   │  (Inner Loop)   │
│  Dyson Road    │   │  Build→Test→Fix │
│  State+Memory  │   │  Failure Retry  │
└───────┬────────┘   └────────┬────────┘
        │                     │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │    OpenHands SDK    │
        │   (Execution Layer) │
        │  Sandboxed Runtime  │
        │  SWE-bench Harness  │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   Aider (CLI-Node)  │
        │  Git-native Builder │
        │  DeepSeek local     │
        └─────────────────────┘
```

**Ratchet-Score dieser Kombination:**

- RC1 ✅ Löst Kontextverlust, Deadlock, Dependency-Drift
- RC2 ✅ Alle Open Source, Zero Reproduction Cost
- RC3 ✅ Öffnet neue Problemklassen durch Composition
- RC4 ✅ LangGraph-Docs + OpenHands-SDK lehren durch Nutzung
- RC5 ✅ LangGraph/AutoGen haben verschiedene State-Modelle → produktive Spannung
- RC6 ✅ PydanticAI komprimiert Artefakt-Kommunikation
- RC7 ✅ Stack läuft lokal, auf GPU, auf Cloud — substrat-unabhängig

***

## Was als nächstes kommt

**➡ ACHSE 2 — Dependency Graph \& Minimum-Energy Path Planner**

Der nächste Search-Run sucht spezifisch nach:

- Task-Graph-Engines mit dynamischem Replanning
- Constraint-Propagation-Libraries für Python
- Graph-Optimizer die mit LLM-Feedback lernen
- Konkrete Repos: `networkx` Extensions, `prefect`, `airflow` (zu schwer?), `hamilton`, neuere Graph-Planner für AI-Workflows

**Prompt für nächste Runde:**

```
"task graph" "dynamic replanning" AI agent python 2025 github
"constraint propagation" code planning LLM-driven open source
site:github.com OR site:arxiv.org
```

```
"dependency-aware" code planning autonomous agent 
"topological sort" "critical path" python library 2024 2025
```

```
hamilton OR prefect OR "temporal workflows" 
AI agent task orchestration "replanning" failure recovery 2025
```

<span style="display:none">[^12][^13][^14][^15][^16][^17][^18][^19][^20][^21][^22][^23][^24][^25][^26][^27][^28][^29][^30]</span>

<div align="center">⁂</div>

[^1]: https://www.youtube.com/watch?v=thn2KRGn50A

[^2]: https://dev.to/agdex_ai/crewai-vs-autogen-vs-langgraph-which-multi-agent-framework-in-2026-51m6

[^3]: https://github.com/OpenHands/OpenHands

[^4]: https://github.com/Decentralised-AI/OpenHands-FKA-OpenDevin

[^5]: https://tech-for-dev.vercel.app/articles/3879969

[^6]: https://www.meta-intelligence.tech/en/insight-ai-agent-frameworks

[^7]: https://arxiv.org/html/2604.03515v2

[^8]: https://theagenticreview.xyz/articles/openhands-aider-continue-open-source-coding-stack/

[^9]: https://aicoolies.com/tools/sweep

[^10]: https://github.com/vstorm-co/awesome-pydantic-ai

[^11]: https://github.com/pydantic/pydantic-ai/blob/main/AGENTS.md

[^12]: https://github.com/AnnasMustafaDev/Multi-Agent-Research-Assistant-Langgraph

[^13]: https://github.com/AI-App/OpenDevin.OpenDevin

[^14]: https://alt.qa/kb/testing-crewai-autogen-agents.php

[^15]: https://github.com/sushmitanandi/langgraph-multi-agent

[^16]: https://arxiv.org/abs/2407.16741v1

[^17]: https://aaia.app/research/crewai-autogen-best-practices

[^18]: https://github.com/botextractai/ai-langgraph-multi-agent

[^19]: https://xwang.dev/blog/2024/opendevin-codeact-1.0-swebench/

[^20]: https://github.com/aws-samples/langgraph-multi-agent

[^21]: https://benchgecko.ai/agent/swe-agent

[^22]: https://devtoollab.com/ai-tools/sweep-ai

[^23]: https://swe-agent.com/latest/background/

[^24]: https://sourceforge.net/projects/openhands.mirror/

[^25]: https://arxiv.org/abs/2405.15793

[^26]: https://github.com/sweepai

[^27]: https://github.com/ketan1741/OpenHands-MultiAgent-Workflows

[^28]: https://tom-doerr.github.io/repo_posts/2025/09/04/stanfordnlp-dspy.html

[^29]: https://www.youtube.com/watch?v=RoebbTo8PJE

[^30]: https://arsum.com/blog/posts/ai-agent-frameworks/

