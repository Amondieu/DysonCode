<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# ok nächster

Die Ernte ist aussergewöhnlich dicht. Achse 4 hat den stärksten theoretischen Unterbau von allen.

***

# ACHSE 4 — Semantic Code Memory \& Pattern Library (Memory Keeper K2/K3)

## Das Kernproblem das diese Achse löst

Jede Session eines autonomen Coding-Agents beginnt auf Null. Kein Gedächtnis, welche Patterns funktioniert haben, welche Fehler bekannt sind, welche Abstractions bereits existieren. Das ist der **primäre Grund warum Completion Rates unter 1.0 bleiben** — nicht Code-Generierung, sondern Wissens-Amnesie zwischen Sessions. Achse 4 löst exakt das.

***

## Die zwei strukturellen Schichten des Memory Keepers

```
K2 — Pattern Library     → was hat in der Vergangenheit funktioniert?
K3 — Anti-Pattern Guard  → was hat in der Vergangenheit versagt?
```

Beide brauchen unterschiedliche Technologien. Das ist der entscheidende Punkt.

***

### TIER 1 — Direkte Memory Keeper Substrate

#### **CASS Memory System** *(Open Source, Bun/TypeScript CLI)*

**GitHub:** `Dicklesworthstone/cass_memory_system`

CASS ist die vollständigste Implementierung einer **persistenten, prozeduralen Gedächtnisarchitektur** für Coding-Agents. Drei Schichten:[^1][^2][^3]


| Schicht | Funktion | KORE-Mapping |
| :-- | :-- | :-- |
| **Short-Term** | aktuelle Session-Patterns | Builder-Knoten Kontext |
| **Procedural** | bewährte Lösungs-Heuristiken | K2 Pattern Library |
| **Long-Term** | cross-session, cross-agent Wissen | K3 Langzeit-Gedächtnis |

**Confidence Decay Model:** Patterns verlieren automatisch Relevanz wenn sie nicht bestätigt werden — verhindert dass veraltete Lösungen vorgeschlagen werden. Das ist direkt das **Renormalisierungs-Prinzip** aus Ω3: was bei jedem Zoom-Level überlebt, bleibt in der Library.[^2]

**Trauma Guard Safety System:** Blockiert Propagation von schädlichen Patterns aktiv — verhindert dass ein einmal gelernter Anti-Pattern ins nächste Projekt überträgt.[^3][^4]

**Integration in KORE:**

```
Memory Keeper erhält nach jedem Tester-Ergebnis:
  PASS  → cm reflect → extrahiert Pattern → K2 Library
  FAIL  → cm anti-pattern → K3 Guard + neue Constraint-Injection
  Session-End → cm snapshot → Memory-Snapshot für nächste Session
```


***

#### **ReGAL / REGAL** *(MIT, aktiv)*

**GitHub:** `esteng/regal_program_learning`
**Paper:** arXiv 2401.16467

REGAL (Refactoring for Generalizable Abstraction Learning) ist die eleganteste Lösung für das **Abstraktions-Extraktions-Problem**. Es refaktoriert Code ohne das Verhalten zu ändern und extrahiert dabei die gemeinsamen Sub-Strukturen als wiederverwendbare Library-Funktionen — gradient-frei, also kein Fine-Tuning nötig.[^5][^6]

**Warum das für KORE entscheidend ist:**

Nach Sprint 7 (Done Detector) hat KORE einen Corpus von funktionierendem Code. REGAL läuft einmal über diesen Corpus und extrahiert automatisch die **gemeinsamen Abstractions** — genau die Funktion die DreamCoder's Abstraction-Phase ausführt, aber als modernes LLM-kompatibles System.[^7][^8][^9]

**Konkret:**

```python
# REGAL extrahiert aus zwei Builder-Outputs:
# auth_module_v1.py + auth_module_v2.py
# → neue Library-Funktion: validate_jwt_token()
# → ab jetzt: Builder referenziert Library statt neu implementiert
```

Das ist die **Kolmogorov-Kompression des gesamten Projekt-Corpus** — Ω1 direkt.

***

#### **Qdrant** *(Apache 2.0, Open Source)*

**GitHub:** `qdrant/qdrant`

Qdrant ist aktuell der leistungsstärkste Open-Source-Vektor-Store für Code-Memory. **6ms p50-Latenz**, hybride Dense+Sparse-Suche nativ, payload-basiertes Filtering, läuft als lokaler In-Memory-Store oder persistent.[^10][^11][^12]

**Benchmark 2026 Entscheidung**:[^11]


| Store | Insert (1000 vecs) | Query p50 | Filter | KORE-Eignung |
| :-- | :-- | :-- | :-- | :-- |
| **Qdrant** | schnell | **6ms** | nativ | ✅ Production |
| **ChromaDB** | sehr schnell | 12ms | via BM25 | ✅ Prototyping |
| **pgvector** | moderat | 18ms | SQL-nativ | ✅ wenn Postgres vorhanden |

**Für KORE:** Qdrant als primärer K2/K3-Store — jeder Memory-Eintrag hat Payload:

```python
PointStruct(
  id=pattern_hash,
  vector=codebert_embedding,
  payload={
    "type": "pattern",          # oder "anti-pattern"
    "confidence": 0.87,         # decays über Zeit
    "constraint_class": "tool_failure",  # aus Achse 3 Taxonomie
    "sprint": 5,
    "last_confirmed": "2026-06-23"
  }
)
```


***

#### **Episodic Dual-FAISS Memory** *(aus RANLP 2025 Paper)*

Das Paper  implementiert **zwei parallele FAISS-Indizes** — einer für Code-Error-Embeddings, einer für Developer-Explanation-Embeddings. Beim Auftreten eines neuen Fehlers sucht der Agent in beiden Indizes gleichzeitig: findet er eine ähnliche Error-Embedding-Signatur, ruft er die zugehörige Erklärung ab.[^13]

**Warum das besser ist als ein einzelner Index:** Code-Struktur und natürlichsprachliche Erklärung liegen in unterschiedlichen Embedding-Räumen. Nur durch **Dual-Index** erreicht man vollständige Retrieval-Coverage. Das ist direkt das Memory-Keeper-Pattern für KORE.

```
Failure Event
     │
     ├─→ FAISS Index 1 (CodeBERT)    → ähnliche Code-Fehler
     └─→ FAISS Index 2 (MiniLM)      → ähnliche Erklärungen
                    ↓
          Merged: "Dieser Fehler = bekannt, Lösung: ..."
                    ↓
          Constraint-Injection → Dyson Road Optimizer
```


***

### TIER 2 — Ergänzende Spezialisten

#### **sem** *(MIT-Lizenz)*

**GitHub:** `Jonathanvwersch/sem`

Minimales Semantic Code Search Tool — `all-MiniLM-L6-v2` Embeddings + FAISS, lokal. Ideal als **leichtgewichtiger K2-Search** innerhalb eines einzelnen Projekts, bevor KORE-übergreifende Patterns relevant werden.[^14]

***

#### **DreamCoder Architektur** *(konzeptuelles Substrate)*

DreamCoder  ist kein direkt verwendbares Produktionssystem — aber seine **Wake-Sleep-Loop-Architektur** ist das konzeptuelle Substrat für KOREs Memory-Evolution:[^15][^8][^7]

```
Wake Phase:   KORE löst Tasks mit aktueller Library
Sleep Phase:  REGAL komprimiert gelöste Tasks → neue Abstractions
              → Memory Keeper updated K2 Library
              → nächste Wake Phase startet mit reicherer Library
```

Das ist autopoietische Wissensakkumulation — nach Ω4.

***

### Die optimale Stack-Kombination für Achse 4

```
KORE MEMORY KEEPER — vollständiger Stack

            ┌──────────────────────────────────────┐
            │        K2 Pattern Library             │
            │                                       │
            │  Qdrant (Dense+Sparse, 6ms p50)       │
            │  CodeBERT embeddings pro Funktion     │
            │  Dual-FAISS: Code + Explanation       │
            │  Confidence Decay via CASS-Modell     │
            └─────────────────┬────────────────────┘
                              │
            ┌─────────────────▼────────────────────┐
            │        K3 Anti-Pattern Guard          │
            │                                       │
            │  CASS Trauma Guard Layer              │
            │  Failure-Klasse aus Achse 3 Taxonomie │
            │  Blockiert bekannte Fehler-Patterns   │
            └─────────────────┬────────────────────┘
                              │
            ┌─────────────────▼────────────────────┐
            │     Abstraction Extractor             │
            │                                       │
            │  REGAL: gradient-frei, post-Sprint    │
            │  Komprimiert Corpus → neue Library    │
            │  Wake-Sleep nach DreamCoder-Pattern   │
            └──────────────────────────────────────┘

        Session Start → cm context query → relevante K2/K3 Patterns
        Node Complete → cm reflect → Pattern-Extraktion
        Failure       → cm anti-pattern → K3 Guard + Constraint
        Sprint End    → REGAL run → Abstraction-Update
```

**Ratchet-Score Achse 4:**

- RC1 ✅ Löst Session-Amnesie — die häufigste Quelle von Completion-Rate-Einbrüchen
- RC2 ✅ CASS + Qdrant = Zero Reproduction Cost einmal aufgesetzt
- RC3 ✅ REGAL öffnet neue Problem-Klasse: automatische Library-Evolution
- RC4 ✅ Wake-Sleep-Mechanismus lehrt durch Nutzung — das System wird smarter
- RC5 ✅ Dual-FAISS erzeugt Spannung zwischen Code-Raum und Erklärungsraum → bessere Retrieval-Coverage
- RC6 ✅ REGAL = direkte Kolmogorov-Kompression des Projekt-Corpus
- RC7 ✅ lokal, Docker, Cloud — substrat-unabhängig

**Score: RC = 7 — erster vollständiger Ratchet dieser Analyse.**

***

## Was als nächstes kommt

**➡ ACHSE 5 — Harness Scoring \& Done Detector**

Der nächste Run sucht gezielt nach:

- Test-Harness-Frameworks die über `pytest passed` hinausgehen
- UX-Gate-Implementierungen (Playwright, Accessibility-Checks)
- Architektur-Konsistenz-Validierung (Dependency-Check, Type-Coverage)
- "Done"-Definition als formales Scoring-Modell

**Prompt für nächste Runde:**

```
"harness scoring" "done detector" autonomous agent
code quality gate LLM "task completion" formal verification python 2025
```

```
pytest coverage type checking architecture validation
autonomous coding agent "release gate" "done criteria" 2025
```

```
playwright accessibility UX gate automated testing
"completion criteria" autonomous software agent 2025
```

<span style="display:none">[^16][^17][^18][^19][^20]</span>

<div align="center">⁂</div>

[^1]: https://github.com/Dicklesworthstone/cass_memory_system

[^2]: https://lobehub.com/es/skills/dicklesworthstone-cass_memory_system

[^3]: https://mcpmarket.com/ja/tools/skills/cass-memory-system

[^4]: https://agentskill.sh/@aiskillstore/cm

[^5]: https://github.com/esteng/regal_program_learning

[^6]: https://huggingface.co/papers/2401.16467

[^7]: https://ml4code.github.io/publications/ellis2021dreamcoder/

[^8]: https://www.youtube.com/watch?v=NYIeP1hns6A

[^9]: https://arxiv.org/html/2506.11058v2

[^10]: https://dev.to/pooyagolchian/rag-pipelines-in-production-vector-database-benchmarks-chunking-strategies-and-hybrid-search-data-gbl

[^11]: https://jangwook.net/en/blog/en/vector-db-comparison-2026-qdrant-chroma-pgvector/

[^12]: https://github.com/qdrant/qdrant-client

[^13]: https://acl-bg.org/proceedings/2025/RANLP 2025/pdf/2025.ranlp-1.70.pdf

[^14]: https://github.com/Jonathanvwersch/sem

[^15]: https://github.com/liqing-ustc/dreamcoder/blob/master/docs/software-architecture.md

[^16]: https://blog.milvus.io/ai-quick-reference/how-do-i-implement-semantic-search-for-code-repositories

[^17]: https://github.com/ViralV00d00/claude-code-memory

[^18]: https://dev.to/midas126/building-your-own-google-maps-for-codebases-a-guide-to-semantic-code-search-with-llms-579d

[^19]: https://lobehub.com/bg/skills/johnlindquist-claude-cass-memory

[^20]: https://southnlp.github.io/southnlp2024/papers/southnlp2024-poster-43.pdf

