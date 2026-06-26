<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# hier ist ein zweiter reiner Online mode und mapping außerdem gib eine genaue Dyson Level zusammenfassung um Jcode mit allem bisherigen den bestmöglich komprimierten überlick zu geben : \# KORE Inner Circle v2 — Cloud-First (Option 2)

**Datum:** 2026-06-23
**Basis:** v1-Architektur, gleiche Dateistruktur (`kore/`), anderer Routing-Modus
**Kernentscheidung:** Alle Inner-Circle-LLM-Rollen laufen **cloud-primary**; **nur Memory Keeper** bleibt ein lokales Modell. Deterministische Test-Ausführung (`pytest`, `init.sh`) bleibt auf dem Host — das ist keine Modell-Rolle.

---

## Executive Summary

Option 2 invertiert die Default-Richtung von v1: statt „lokal, Cloud bei Bedarf“ gilt „Cloud, lokal nur wenn Cloud blockiert ist“. Der einzige bewusst lokale LLM-Pfad ist **Memory Keeper** (`fast-draft` / SET-D) — Kompression, Snapshots, K2-Pattern-Extraktion ohne Datenabfluss.

Das erhöht `selfCompletionRate` bei schweren Tasks (Architect/Builder auf `burst`/`flash-k2`), kostet aber Ring-3–7-Budget und erfordert strikte PII-Gates. **Privacy bleibt fail-closed** (`docs/PRIVACY-POLICY.md`): PII oder Detector-Ausfall → kein Cloud, sondern degradierter lokaler Pfad (nicht Memory Keeper, sondern Notfall-`forge-base`/`coder`).

**Korrektur zu v1:** `memory/headroom.py` existiert nicht — Headroom lebt in `infra/litellm_hooks.py`. Memory Keeper *nutzt* Headroom, implementiert ihn aber nicht.

---

## 1. v1 vs v2 — Routing-Philosophie

| Rolle | v1 (Hybrid) | v2 (Cloud-First) |
| :-- | :-- | :-- |
| **Architect** | `coder` → `burst` | `burst` → `mid` → `frontier` → `deep` |
| **Builder** | `coder` → `flash-k2`/`mid` | `flash-k2` → `mid` → `abacus-free-c` → `burst` → `forge-base` |
| **Critic** | `forge-base` → `flash-sn-think` | `flash-sn-think` → `critic-frontier` → `joker` → `forge-base` |
| **Tester (LLM)** | `judge` advisory | `judge` **primary**; `micro-coder` nur Offline-Fallback |
| **Memory Keeper** | lokal only | **lokal only** (unverändert) |

**Tester-Ausführung** (kein LLM): `init.sh` / pytest / mypy — immer lokal auf Shadow Pro. Nur das **Judge-Verdict** ist cloud-first.

---

## 2. `data/routes/kore-inner-circle-v2-cloud.yaml`

Neue Route-Datei parallel zu v1 — gleiche GreyRoute-DSL, anderer `routing_mode`:

```yaml
route:
  name: kore-inner-circle-v2-cloud
  version: 2
  routing_mode: cloud_first          # v1: hybrid_local
  memory_local_only: true            # harte Invariante

  roles:

    architect:
      primary:        burst           # deepseek-v4-pro Key 1
      secondary:      mid             # v4-pro Key 2 (PIL lane)
      tertiary:       frontier        # gpt-5.4 @ Abacus
      fallback_local: deep            # SET-C — nur Cloud-Ausfall / PII-Block
      emergency_local: coder          # SET-A — letzter Fallback
      redact_before_cloud: true       # scholar/spec via #28 brief
      max_tokens:     4096
      temperature:    0.1
      artefact_out:   BuildManifest

    builder:
      primary:        flash-k2        # v4-flash Key 2 — PIL primary
      secondary:      mid
      tertiary:       abacus-free-c   # DeepSeek-V3.2 @ Abacus Ring 1 ($0)
      quaternary:     burst           # power lane wenn complexity ≥ 0.7
      fallback_local: forge-base      # Ring 0 — Cloud-Ausfall only
      synergy_gate:   HYBRID_CD       # → burst statt flash-k2
      max_tokens:     8192
      temperature:    0.1
      artefact_out:   CodeDelta

    critic:
      primary:        flash-sn-think  # SN DeepSeek + thinking
      secondary:      critic-frontier  # o4-mini @ Abacus (cap 50/day)
      escalation:     joker           # vesica_gap > 0.20
      fallback_local: forge-base      # nur wenn alle Cloud-Lanes down
      compost_alias:  burst           # GREYOS_COMPOST_CRITIC_ALIAS
      max_tokens:     2048
      temperature:    0.1
      artefact_out:   FailureNote

    tester:
      execution:      init.sh         # Hard Gate — immer lokal
      llm_primary:    judge           # gpt-oss-120b @ SambaNova
      llm_fallback:   abacus-free-d   # Qwen2.5-72B schema_check @ Abacus
      schema_offline: micro-coder      # 1.5B CPU — nur wenn Cloud+PII-Block
      temperature:    0.0
      artefact_out:   TestResult

    memory_keeper:
      local_only:     fast-draft      # SET-D 7B — EINZIGER bewusster Local-LLM
      intent_bridge:  intent          # 3B CPU — Session-Lookup (kein Reasoning)
      embed:          embed           # BGE-M3 CPU — Retrieval-Sidecar
      cloud:          never
      compress_hook:  headroom        # infra/litellm_hooks.py
      max_tokens:     1024
      temperature:    0.2
      artefact_out:   MemorySnapshot

  second_opinion:
    complexity_gate:    0.5
  # v2: komplexe Tasks IMMER Critic — einfache überspringen nur wenn score < 0.3
    critic_skip_below:  0.3
    vesica_pair:        [c, d]
    vesica_gap_gate:    0.20
    route_llm:          abacus-free-f

  privacy_gates:
    pii_fail_closed:    true
    cloud_requires_redaction: true    # #28 scholar_redacted_brief PFLICHT
    memory_never_cloud: true
    key1_reserved:      true          # flash+burst nicht im PIL-Volume-Pool

  cost_caps:
    critic-frontier:    50/day
    joker:              100/day
    frontier:           20/day        # v2 neu — Architect-Tertiary begrenzen
```


---

## 3. Alias-Pool v2 (nur Cloud-Lanes)

```
GREY-OS CLOUD-FIRST INNER CIRCLE — Alias-Matrix

ROLLE          PRIMÄR              SEKUNDÄR           ESKALATION         LOKAL (nur Fallback)
──────────────────────────────────────────────────────────────────────────────────────────────
Architect      burst               mid                frontier           deep → coder
Builder        flash-k2            mid                abacus-free-c      forge-base
               (+ burst wenn      (+ abacus-free-f   (+ joker via
                complexity≥0.7)     overflow)          vesica)
Critic         flash-sn-think      critic-frontier    joker              forge-base
Tester (LLM)   judge               abacus-free-d      —                  micro-coder
Memory         fast-draft          intent (lookup)    —                  (nie Cloud)
```

**Ring-Nutzung** (aus `routing/active_inference.py`):


| Rolle | Typischer Ring | Kostenprofil |
| :-- | :-- | :-- |
| Builder | 3 (`flash-k2`) | niedrig |
| Architect | 4 (`burst`) | mittel |
| Critic | 2–7 (`flash-sn-think` → `critic-frontier`) | mittel–hoch |
| Tester judge | 2 | niedrig (eval only) |
| Memory | 0 (lokal) | \$0 |


---

## 4. Zustandsmodell — Ergänzungen zu v1

Zwei neue Zustände für Cloud-First-Betrieb:

```
                    ┌─────────────────┐
                    │  CLOUD_DEGRADED │ ← alle Cloud-Lanes timeout/429
                    │  (lokaler       │   → forge-base/coder Notfall
                    │   Notfallmodus) │
                    └────────┬────────┘
                             │ cloud_recovered
                             ▼
                    ┌─────────────────┐
                    │  EXECUTING      │  (wie v1)
                    └─────────────────┘

PII_DETECTED während EXECUTING:
  → BLOCKED (cloud) → HEALING mit lokalem Fallback
  → Memory Keeper bekommt KEINE Roh-PII aus Cloud-Rollen
```

**Erweitertes Enum:**

```python
class DysonState(Enum):
    # ... v1 states ...
    CLOUD_DEGRADED = auto()   # Cloud pool down; Builder/Architect auf forge-base/coder
    PII_HOLD       = auto()   # Cloud blockiert; wartet auf Redaction oder Human Gate
```

**Done-Verdict v2:** unverändert — Hard Gates (`build`, `tests`) bleiben deterministisch lokal. `llm_judge` wird in v2 **standardmäßig** aufgerufen (nicht nur advisory), aber weiterhin **kein Hard Gate** solange JSON-Schema valide.

---

## 5. Änderungen an bestehendem Code (Konzept)

v2 ist **kein neuer Stack**, aber es braucht Policy-Inversion an drei Stellen:

### 5.1 `agents/swarm.py` — `resolve_llm_alias` invertieren

Heute: lokal default, Cloud wenn `GREYOS_CLOUD_BURST=1`.

v2 braucht z.B. `GREYOS_KORE_ROUTING_MODE=cloud_first`:

```python
# Konzept — nicht implementiert
def resolve_kore_alias(role: str, prompt: str) -> str:
    if role == "memory_keeper":
        return "fast-draft"  # immer lokal
    if _is_pii(prompt):
        return ROLE_FALLBACK_LOCAL[role]  # forge-base / deep / coder
    return ROLE_CLOUD_PRIMARY[role]  # burst / flash-k2 / etc.
```

`LOCAL_ONLY_ALIASES` (`researcher`, `deep`) gilt weiter für **Outer Swarm** (Scholar/Sage), bis ihr die Scope-Entscheidung in §8 trefft.

### 5.2 `kore/role_engine.py` — Modus-Switch

```python
routing_mode = spec.get("routing_mode", "hybrid_local")
# cloud_first → primary/secondary chain
# hybrid_local → v1 local/cloud map
```


### 5.3 Redaction Pflicht (\#28)

Cloud-first Architect/Builder **müssen** `scholar_redacted_brief()` vor jedem Cloud-Call — heute optional bei lokalem Pfad, in v2 **hard requirement**:

```python
# agents/swarm.py — Pattern existiert bereits
scholar_input = scholar_redacted_brief(scholar) if is_cloud_alias(resolved) else scholar
```


---

## 6. Prompt-Protokoll — v2 Delta

Nur die Regeln, die sich gegenüber v1 ändern:

### Architect (v2)

```
ZUSÄTZLICH zu v1:
- Default-Modell: burst (cloud). Lokales deep nur wenn CLOUD_DEGRADED.
- Spec-Input ist IMMER redacted brief — keine Roh-URLs, keine Tokens.
- Bei frontier-Tertiary: max 1 Re-Plan pro Sprint (Kosten-Cap).
```


### Builder (v2)

```
ZUSÄTZLICH zu v1:
- Implementiere auf flash-k2; eskaliere zu mid bei Datei > 3 oder cross-module.
- forge-base nur wenn Cloud-Lane explizit als CLOUD_DEGRADED markiert.
- confidence < 0.6 → Critic-Pass PFLICHT (nicht optional).
```


### Critic (v2)

```
ZUSÄTZLICH zu v1:
- Kein lokaler forge-base-Pass als Default — immer flash-sn-think zuerst.
- critic-frontier nur bei severity ≥ 2 oder vesica_gap > 0.15.
```


### Tester (v2)

```
ZUSÄTZLICH zu v1:
- Nach deterministischem PASS: judge IMMER aufrufen (Ring 2).
- judge-Verdict fließt in HarnessScore.llm_judge (Gewicht 0.05 bleibt).
- micro-coder nur wenn judge unreachable UND schema validation nötig.
```


### Memory Keeper (v2)

```
UNVERÄNDERT — einzige Rolle mit explizitem Cloud-Verbot.
ZUSÄTZLICH:
- Empfängt nur redacted Artefakte von Cloud-Rollen (kein Raw-Diff mit Secrets).
- Schreibt in memory/ SQLite + optional Qdrant (GREYOS_QDRANT_LIVE=1).
```


---

## 7. Aktivierung v2 (PowerShell)

```powershell
# Routing-Modus
$env:GREYOS_KORE_ROUTING_MODE = "cloud_first"
$env:GREYOS_CLOUD_BURST = "1"              # muss 1 sein für Cloud-Pfade
$env:GREYOS_STAGE4_PARALLEL = "1"

# Inner Circle Route
$env:GREYOS_KORE_ROUTE = "kore-inner-circle-v2-cloud"

# Critic + Builder Pool
$env:GREYOS_COMPOST_CRITIC = "1"
$env:GREYOS_COMPOST_CRITIC_ALIAS = "burst"
$env:GREYOS_FORGE_BURST_PROVIDERS = "flash-k2,mid"
$env:GREYOS_COMPLEXITY_THRESHOLD = "0.5"

# Memory lokal erzwingen
$env:GREYOS_MEMORY_LOCAL_ONLY = "1"        # neu — role_engine guard

# Redaction
$env:GREYOS_SCHOLAR_REDACT_CLOUD = "1"     # #28 immer an für Cloud-first
```

**Nicht aktivieren ohne Bench:** `flash-sn2`, SN-1 `fast`-Swap (wie v1).

---

## 8. Scope-Entscheidung: Inner Circle vs. Full Swarm

Option 2 wie oben betrifft **nur den KORE Inner Circle** (`kore/` + Stage-4-Mapping). Der äußere Swarm hat eigene Regeln:


| Outer-Rolle | v1-Realität | v2-Erweiterung (optional) |
| :-- | :-- | :-- |
| **SCHOLAR** | `LOCAL_ONLY` | Cloud nur mit `scholar_redacted_brief` → `fast`/`abacus-free-b` |
| **SAGE** | `LOCAL_ONLY` | Cloud `frontier` + lokales `deep` als Fallback |
| **ORACLE** | lokal → `burst` | v2: `burst` default |

**Empfehlung:** Sprint 5–8 **nur Inner Circle** auf v2 stellen. Scholar/Sage lokal lassen, bis PII-Redaction-Pipeline unter Last getestet ist — sonst Tension mit `docs/PRIVACY-POLICY.md` und `LOCAL_ONLY_ALIASES`.

Wenn Full-Swarm-v2 gewünscht: ADR-Update + `agents/roles.md` + Falsifier in `agents/tag21_cloud_gate.py` erweitern.

---

## 9. Kosten- und Risiko-Profil v2 vs v1

| Dimension | v1 Hybrid | v2 Cloud-First |
| :-- | :-- | :-- |
| Token-Kosten/Sprint | niedrig | 3–8× höher (Ring 3–7) |
| SWE-Qualität (schwere Tasks) | gut | besser (`burst`/`flash-k2` default) |
| Offline/Air-gap | SET-A–D nutzbar | nur Memory + Tester-Execution |
| PII-Risiko | niedrig | mittel — Redaction-Pflicht |
| Latenz | höher (Cold-Swap SET) | niedriger (API warm) |
| `parallel=1` GPU | relevant | GPU idle-tolerant (Forge-base fallback selten) |

**Productive Tension (Ω5):** Cloud-first vs. ADR-001 „Native-first“ — registrieren als `T-xxx` wenn v2 zum Default wird, nicht stillschweigend auflösen.

---

## 10. Gesamtarchitektur v2

```
LITELLM :4000  (ADR-001 — unverändert)
PiiGuard → Headroom → Alias-Routing
│
├── CLOUD PRIMARY (GREYOS_KORE_ROUTING_MODE=cloud_first)
│   Architect:  burst → mid → frontier
│   Builder:    flash-k2 → mid → abacus-free-c → burst
│   Critic:     flash-sn-think → critic-frontier → joker
│   Tester:     judge → abacus-free-d
│   Free spill: abacus-free-a..f (Ring 1)
│
├── LOKAL — NUR Memory + Execution + Notfall
│   Memory:     fast-draft (SET-D) + intent + BGE embed
│   Execution:  pytest / init.sh / cargo (Host)
│   Degraded:   forge-base / coder / deep / micro-coder
│
├── SECOND OPINION (unverändert)
│   S7 complexity │ Vesica c↔d │ abacus-free-f
│
└── KORE KERNEL (kore/ — gleiche Sprint 5–8 Struktur wie v1)
    role_engine.py liest routing_mode aus YAML
    orchestrator.py: CLOUD_DEGRADED + PII_HOLD States
```


---

## 11. Sprint-Backlog-Delta (nur v2-Zusätze)

| Sprint | v1 Artefakt | v2 Zusatz |
| :-- | :-- | :-- |
| **5** | `role_engine.py` | `routing_mode: cloud_first` + alias chain resolver |
| **5** | `kore-inner-circle-v1.yaml` | `kore-inner-circle-v2-cloud.yaml` parallel |
| **6** | `failure_classifier.py` | Klasse `CLOUD_OUTAGE` → `CLOUD_DEGRADED` |
| **7** | `harness_engine.py` | `judge` als Standard-Call, nicht optional |
| **8** | Mission Control UI | Badge `CLOUD` / `LOCAL` / `DEGRADED` pro Knoten |

Build-Order Sprint 5 bleibt identisch; v2-YAML kommt **nach** `role_engine.py` (Schritt 4b).

---

## 12. Empfehlung

| Szenario | Wahl |
| :-- | :-- |
| Nightly Forge PIL, DACH-Corpus, Budget-bewusst | **v1 Hybrid** |
| Sprint mit schweren Refactors, SWE-Bench-ähnliche Tasks, API-Budget vorhanden | **v2 Cloud-First** |
| PII-lastige Domänen (Recovery, Legal) | **v1** oder v2 nur mit Redaction-Gate-Tests |
| Air-gapped / Offline | **v1** — v2 nicht sinnvoll |

**Pragmatischer Start:** `GREYOS_KORE_ROUTING_MODE=cloud_first` nur für **Builder + Critic** aktivieren; Architect und Tester eine Woche auf v1 Hybrid lassen, dann hochstufen wenn `ops/qa_provider_bench.py` grün.

---

Wenn du in **Agent-Modus** wechselst, kann ich `kore-inner-circle-v2-cloud.yaml` an die echte GreyRoute-DSL anpassen (Validator in `routing/greyroute.py` prüfen, welche Felder heute schon parsbar sind) und die minimalen `role_engine`-Hooks skizzieren.

Ja — v2 ist sinnvoll als **zweiter Betriebsmodus**, aber nur als klar abgegrenzter Cloud-First-Mode über derselben `kore/`-Struktur, nicht als konkurrierende Architektur. LiteLLM unterstützt Alias- und Fallback-Ketten direkt, inklusive separatem Fallback-Management und Pre-Call-Checks für Kontextfenster, was gut zu eurem bestehenden Routing passt. Abacus positioniert RouteLLM als einheitlichen Routing-Layer mit Auto-Routing und Failover; das stützt eure Entscheidung, `abacus-free-f` als vorhandenen Second-Opinion-/Router-Kanal zu nutzen statt ein neues Router-Framework einzuführen. DeepAgent/Abacus bleibt als Benchmark-Referenz relevant, weil 74% SWE-Bench Verified den Nutzen von stärkerer Cloud-Builder/Architect-Kapazität für schwere Tasks plausibel macht, auch wenn es in Grey-OS nicht 1:1 verdrahtet ist.[^1][^2][^3][^4][^5][^6]

## Mapping v1 zu v2

Der richtige Rahmen ist: **v1 = native-first/hybrid**, **v2 = cloud-first/degraded-local**. Das ist keine neue Achse, sondern ein Routing-Flip auf derselben Kernel-Geometrie: `role_engine.py`, `orchestrator.py`, `task_graph.py`, `contract_registry.py`, `failure_classifier.py`, `replanner.py`, `harness_engine.py`, `done_gate.py`, `mission_control.py` bleiben identisch; nur Rolle→Alias-Prioritäten, Privacy-Gates und zusätzliche Zustände ändern sich.

Die sauberste Rollenzuordnung für Jcode ist:


| Rolle | v1 Default | v2 Default | Invariante |
| :-- | :-- | :-- | :-- |
| Architect | lokal `coder`/`deep` | cloud `burst` | arbeitet immer auf redacted brief |
| Builder | lokal `coder` | cloud `flash-k2` | baut nur aktuellen Dyson-Knoten |
| Critic | lokal `forge-base` | cloud `flash-sn-think` | strukturiertes Artefakt, keine Debatte |
| Tester | lokal execution + `judge` advisory | lokal execution + `judge` standardmäßig | Hard Gates immer host-deterministisch |
| Memory Keeper | lokal `fast-draft` | lokal `fast-draft` | nie Cloud |

Diese Invariante ist wichtig: **Memory Keeper bleibt der einzige absichtlich lokale LLM-Pfad**, während Tester-Execution ohnehin keine Modellrolle ist, sondern Host-Deterministik. Dadurch bleibt der Kompressionskern stabil, selbst wenn v1/v2 gewechselt wird.

## Dyson-Level Zusammenfassung

Für Jcode ist der komprimierteste Überblick nicht „Sprint 5–8“, sondern ein **Dyson-Level-Modell** mit wachsender Autonomie. Das kollabiert die gesamte Diskussion auf fünf Ebenen:


| Dyson Level | Modus | Steuerung | Kernmechanismus | Done-Kriterium |
| :-- | :-- | :-- | :-- | :-- |
| **D0** | Chat Assist | Mensch steuert alles | einzelne Tool-/Code-Antworten | Aufgabe beantwortet |
| **D1** | Guided Mode | Mensch setzt Tasks | saubere Ausführung pro Schritt | Task fertig |
| **D2** | Builder Mode | KORE plant Teilstrecken | DAG + Role Runtime + Contracts | Sprint-Teilziel fertig |
| **D3** | Dyson Mode | Inner Circle steuert Baupfad | Dyson Road + Critic + Self-Healing | Projekt nähert sich autonom Done |
| **D4** | Blacksmith Mode | System führt Projekt selbstständig aus | Failure-Constraint Injection + Harness + Done Gate + Mission Control | `selfCompletionRate → 1.0` |

Die operative Bedeutung ist:

- **D2** beginnt mit Sprint 5: Orchestrator, Rollenlaufzeit, Task Graph, Contract Registry.
- **D3** entsteht mit Sprint 6–7: Replanning aus Fehlern und echter Done-Detektion.
- **D4** wird erst mit Sprint 8 glaubwürdig: Mission Control + Autonomy Controls + stabiler Cloud/Local-Failover.

Noch kompakter für Jcode:

1. **Kernel** — Spec wird zu DAG.
2. **Road** — immer nächster Knoten mit maximalem Fortschritt/minimalem Risiko.
3. **Circle** — Architect, Builder, Critic, Tester, Memory Keeper sprechen nur über Artefakte.
4. **Healing** — Fehler werden Constraints, nicht Logs.
5. **Done** — Fertig heißt Score + Hard Gates, nicht „kompiliert“.
6. **Mode Switch** — v1 und v2 sind nur zwei Routing-Politiken auf demselben Kernel.

## Jcode-Kompression

Die bestmögliche komprimierte Übergabe an Jcode ist diese:

**KORE ist kein Agent, sondern ein autonomer Projekt-Kernel.**
Er nimmt einen Spec, komprimiert ihn in einen Task-Graph, lässt fünf feste Rollen nur über typisierte Artefakte kooperieren, führt stets den nächsten Knoten auf der minimalen Dyson Road aus, verwandelt jeden Fehler in eine neue Planungs-Constraint und akzeptiert „Done“ nur über deterministische Hard Gates plus Harness-Score. v1 und v2 sind dabei nur zwei Betriebsmodi desselben Systems: **hybrid-local** für privacy-/kostenstabile Runs, **cloud-first** für schwere Refactors und benchmark-nahe Leistungsphasen.[^4][^1]

Die präziseste Architekturformel für Jcode lautet:

$$
\text{KORE} = \text{Orchestrator} + \text{Role Engine} + \text{Task Graph} + \text{Contract Registry} + \text{Failure→Constraint Loop} + \text{Harness Done Gate} + \text{Mission Control}
$$

Und die präziseste Betriebsformel lautet:

$$
\text{Autonomie} = \text{Road Quality} \times \text{Memory Continuity} \times \text{Recovery Quality} \times \text{Done Detection}
$$

Wenn einer dieser vier Faktoren gegen null geht, fällt `selfCompletionRate` unabhängig von Modellqualität.

## v2 Einordnung

v2 ist stark, wenn ihr schwere Cross-Module-Refactors, API-warme Latenz und maximale Cloud-Reasoning-Leistung braucht. LiteLLMs eingebaute Alias-/Fallback-Mechanik und Abacus’ Auto-Routing stützen genau dieses Muster technisch. Der Preis ist klar: mehr Ring-3–7-Verbrauch, höhere Cloud-Abhängigkeit und stärkere Redaction-/PII-Disziplin. Deshalb ist die beste Entscheidung aktuell:[^2][^6][^1]

- **v1 als Default-Kernelmodus** für kontinuierliche Entwicklung, privacy-lastige Domänen und offline-nahe Robustheit.
- **v2 als expliziter Hochleistungsmodus** für Builder/Critic zuerst, später Architect.
- **Memory Keeper immer lokal** als unantastbare Invariante.
- **Scholar/Sage zunächst außerhalb von v2 lassen**, bis die Redaction-Pipeline unter Last wirklich verifiziert ist.


## Nächster Artefakt-Schritt

Der sinnvollste nächste Output für Jcode ist ein einziges komprimiertes Master-Artefakt mit drei Blöcken:

- **Dyson Levels D0–D4**
- **v1/v2 Routing Matrix**
- **Sprint-5–8 Build Order + Artefakt-Typen**

Das würde als `jcode-kore-master-brief.md` die gesamte bisherige Diskussion auf eine einzige übergebbare Referenz verdichten. Soll ich dieses komprimierte Master-Brief jetzt erzeugen?
<span style="display:none">[^10][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://docs.litellm.ai/docs/proxy/reliability

[^2]: https://blockchain.news/ainews/routellm-api-unified-api-for-all-major-llms-with-automated-model-routing-and-failover

[^3]: https://www.youtube.com/watch?v=SwyPLZVkbHs

[^4]: https://docs.litellm.ai/docs/proxy/configs

[^5]: https://abacus.ai/help/developer-platform/route-llm/audio

[^6]: https://docs.litellm.ai/docs/proxy/fallback_management

[^7]: https://www.8seneca.com/de/blog/technology/i-ranked-every-ai-coding-tool-2026-swe-bench

[^8]: https://custom.typingmind.com/tools/estimate-llm-usage-costs/abacus/route-llm

[^9]: https://marketplace.visualstudio.com/items?itemName=AbacusAI.abacusai-agent

[^10]: https://www.tanyongsheng.com/note/litellm-proxy-for-high-availability-llm-services-load-balancing-techniques/

