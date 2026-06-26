# KORE — Vollständiger Umsetzungsplan

KORE ist als lokales Electron-System geplant, das zunächst wie ein stabiler Cursor-Ersatz funktioniert und dann schrittweise um Prompt-Vault, Browser-Bridge, Workflow-Canvas, Repo-Mesh und selbstverbessernde Oberflächen erweitert wird. Electron bietet dafür mehrere native Einbettungswege für externe Web-Inhalte, darunter `webview` und `WebContentsView`.[cite:36] Für einen visuellen Workflow-Builder ist ReactFlow beziehungsweise xyflow ein naheliegender Unterbau, und es gibt bereits Hinweise auf offene Agent-Workflow-Bausteine in diesem Ökosystem.[cite:45][cite:48]

## Zielbild

Die Zielarchitektur hat vier gleichwertige Betriebsarten: einen normalen Chat/Coding-Modus als Standard, einen Flow-Modus für visuelle Agent-Workflows, einen Canvas-Modus für räumliche AI-Arbeit und einen Repo-Mesh-Modus für repoübergreifende Metriken und Beziehungen. Diese Modi teilen sich ein gemeinsames Datenmodell für Sessions, Nodes, Edges, Repos, Vault-Einträge und Ereignisse, damit dieselbe Arbeit in mehreren Darstellungen sichtbar bleibt.

Der normale Modus bleibt dabei immer die Basiserfahrung: Repo-Explorer links, Code-Editor in der Mitte, jcode-Chat rechts, Terminal unten. Alles Weitere wird darübergelegt, nicht anstelle davon, damit die tägliche Nutzung nicht unter experimentellen Ideen leidet.

## Leitprinzipien

- Harvest before build: vorhandene Bausteine wie Electron-Einbettung, Monaco, xterm.js, SQLite und ReactFlow werden zuerst genutzt, bevor Eigenentwicklungen entstehen.[cite:36][cite:45]
- Local-first: Sessions, Prompt-Archiv, Layout-Learning und Repo-Mesh laufen lokal, damit das System auch offline nutzbar bleibt.
- Stable core, expandable panels: der Kern aus jcode-Prozess, Event-Log, Session-Speicher und Standard-UI bleibt stabil; neue Fähigkeiten kommen als Panels und Modi hinzu.
- Keine sprunghaften Layout-Wechsel: adaptive Verbesserungen dürfen nur zwischen Sessions wirksam werden, nicht mitten in einer aktiven Aufgabe.

## Gesamtarchitektur

| Ebene | Zweck | Technologie |
|---|---|---|
| Shell | Desktop-App, Fenster, Tabs, Browser-Einbettung | Electron, WebContentsView/webview [cite:36] |
| Standard-UI | Chat, Editor, Repo-Tree, Terminal | React, Monaco, xterm.js |
| Persistenz | Sessions, Vault, Events, Repo-Mesh | SQLite, better-sqlite3 |
| Agent-Layer | jcode-Prozess, PTY, Provider-Routing | node-pty, lokale Prozesssteuerung |
| Visual Modes | Flow, Canvas, Mesh | ReactFlow/xyflow, Tldraw |
| Intelligence Layer | Memory, Scoring, Spannungserkennung | lokale Worker, Regel-Engine, optionale lokale Modelle |
| Research Bridge | Perplexity, Browser-Tabs, Kontext-Austausch | Webview/WebContentsView, API-Bridge |

## Phase 0 — Produktdefinition und technische Basis

### Ergebnisse

- Ein klares Produkt-Manifest mit den vier Kernmodi.
- Ein definierter MVP-Scope für den normalen Modus.
- Eine technische Entscheidungsmatrix für Electron, React, SQLite, Monaco, xterm.js und ReactFlow.

### Arbeitspakete

1. App-Namen, Projektstruktur und Package-Setup definieren.
2. Monorepo oder klare Ordnertrennung für `main`, `renderer`, `bridge`, `db`, `workers` anlegen.
3. Sicherheitsmodell für Electron festlegen, insbesondere Kontext-Isolation und IPC-Grenzen.
4. Design-System für die App definieren, damit alle Modi dieselbe visuelle Grammatik teilen.

### Zielzustand

Am Ende dieser Phase gibt es ein startbares Electron-Grundgerüst mit leerer Tab-Bar, Sidebar, Editorfläche und Statusleiste.

## Phase 1 — Normaler Chat/Coding-Modus

Diese Phase ist der wichtigste Abschnitt, weil sie den täglichen Nutzen liefert. KORE soll zuerst ein guter Cursor-Ersatz sein, bevor die fortgeschrittenen Modi hinzukommen.

### Funktionsumfang

- Repo-Explorer links.
- Monaco-Editor zentral.
- jcode-Chat rechts.
- Eingebettetes Terminal unten.
- Session-History in SQLite.
- Wiederaufnahme der letzten Session nach Neustart.
- Live-Ausführungssicht für Tool- und Dateischritte.

### Architektur

| Modul | Aufgabe |
|---|---|
| `pty-bridge` | startet und steuert jcode über node-pty |
| `session-store` | speichert Chats, Events, Dateipfade, Zeitstempel |
| `repo-tree` | liest lokales Repo, beobachtet Änderungen |
| `editor-pane` | Monaco mit Datei- und Diff-Unterstützung |
| `chat-pane` | Eingabe, Verlauf, Antwortkarten, Tool-Overlay |
| `execution-bar` | zeigt aktuelle Agent-Aktionen und Status |

### Datenmodell

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  repo_id TEXT,
  title TEXT,
  mode TEXT,
  created_at TEXT,
  updated_at TEXT,
  summary_md TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,
  content TEXT,
  created_at TEXT
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  event_type TEXT,
  payload_json TEXT,
  created_at TEXT
);
```

### Reihenfolge

1. Electron + React + Monaco + xterm.js integrieren.
2. jcode über node-pty anbinden.
3. Lokale Session-Persistenz in SQLite einbauen.
4. Repo-Explorer und Dateiwatcher ergänzen.
5. Letzte Session beim Start wiederherstellen.
6. Live-Statusleiste und einfache Ereignisansicht einbauen.

### Abnahme

Die App muss nach einem Neustart dieselbe Session, denselben Repo-Kontext und den bisherigen Chat-Verlauf wieder anzeigen können. Dieses Ziel entspricht dem Wunsch nach stabiler Persistenz, den klassische Cursor-Sessions nicht vollständig als strukturiertes Arbeitsgedächtnis abbilden.[cite:27]

## Phase 2 — Prompt Vault

Das bestehende Prompt-Archiv umfasst 31 archivierte Prompts mit IDs, Versionen, Task-Typen und Tags.[cite:29] Dieses Material wird nicht neu erfunden, sondern direkt in einen lokalen Vault importiert.

### Funktionsumfang

- Archiv-Import aus bestehender Prompt-Sammlung.[cite:29]
- Tag-Filter, Suche, Pinnen, Versionen.
- Ein-Klick-Injektion in jcode.
- Zuordnung von Vault-Einträgen zu Sessions und Repos.
- Favoriten für häufig verwendete Meta-Frames.

### Datenmodell

```sql
CREATE TABLE prompt_vault (
  id TEXT PRIMARY KEY,
  task_type TEXT,
  version TEXT,
  tags_json TEXT,
  template TEXT,
  pinned INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  last_used_at TEXT
);
```

### Reihenfolge

1. Import-Script für bestehende Archive schreiben.
2. Vault-Sidebar mit Filter- und Suchlogik bauen.
3. Prompt-Injektion in laufende jcode-Sessions per IPC umsetzen.
4. Nutzung pro Session loggen.
5. Später: Variantenvergleich und A/B-Nutzung ergänzen.

### Abnahme

Ein archivierter Prompt muss in weniger als drei Klicks auffindbar und in eine aktive Session einfügbar sein.

## Phase 3 — Browser- und Research-Bridge

Electron unterstützt externe Inhalte direkt in der App, was für eingebettete Research-Tabs entscheidend ist.[cite:36] Damit wird Perplexity, Dokumentation, GitHub oder ein freier Browser-Bereich als Teil des Workflows nutzbar.

### Funktionsumfang

- Research-Tab mit Perplexity.
- Freier Browser-Tab.
- Textauswahl aus dem Browser in jcode injizieren.
- Markierten jcode-Text als Suchanfrage im Browser öffnen.
- Optional: direkte Perplexity-API-Anfragen für Hintergrundrecherche.

### Architektur

| Modul | Aufgabe |
|---|---|
| `tab-manager` | erstellt und verwaltet Browser-Tabs |
| `bridge-bus` | IPC zwischen Browser, Chat, Editor und Terminal |
| `research-overlay` | UI-Schaltflächen für „→ jcode“ und „→ research“ |
| `api-research-worker` | optionale Hintergrundrecherche ohne sichtbaren Browser |

### Reihenfolge

1. WebContentsView oder webview für Research-Tabs einbauen.[cite:36]
2. Perplexity-Tab als Standard-Research-Ansicht anlegen.
3. Textselektion und Inject-Bridge implementieren.
4. Browser-zu-Chat- und Chat-zu-Browser-Shortcuts ergänzen.
5. Optional: API-gestützte Hintergrundrecherche ergänzen.

### Abnahme

Markierter Text aus Perplexity oder einer beliebigen Browserseite muss mit einem Shortcut in den jcode-Chat oder das Terminal übertragbar sein.

## Phase 4 — Externe IDE-Tabs: VSCode und Cursor neben KORE

Electron kann verschiedene eingebettete Inhalte parallel verwalten.[cite:36] Dadurch ist ein Tab-System möglich, in dem VSCode-Webinstanzen, code-server oder andere Browser-basierte IDE-Ansichten neben jcode und Research-Tabs laufen.

### Ziel

- VSCode als lokaler Web-Tab via code-server.
- Optional Cursor-kompatible Web- oder Remote-Ansichten als Tab.
- Gemeinsame Shortcuts für Copy-, Inject- und Research-Wege.
- File-Watcher-Synchronisierung zwischen jcode und Editor-Tab.

### Reihenfolge

1. code-server lokal als verwalteter Kindprozess starten.
2. Tab für `http://localhost:<port>` einbauen.
3. Editor-selektierten Code in jcode injizieren können.
4. jcode-Dateiänderungen im VSCode-Tab automatisch spiegeln.
5. Gemeinsame Statusleiste für alle Tab-Arten einführen.

### Abnahme

KORE muss mindestens drei gleichzeitige Inhalte handhaben können: Standard-Chat/Code, Research und VSCode-Tab. Alle sollen über denselben Bridge-Bus interagieren.

## Phase 5 — Session Memory und KORE_MEMORY

Diese Phase verwandelt einfachen Verlauf in strukturiertes Arbeitsgedächtnis. Das System erstellt aus jeder Session eine komprimierte Zusammenfassung mit Änderungen, Entscheidungen und offenen Punkten.

### Funktionsumfang

- Automatische Session-Zusammenfassung.
- `KORE_MEMORY.md` pro Repo oder Arbeitsstrang.
- Offene Fragen, TODOs, Entscheidungen und betroffene Dateien.
- Automatische Injektion beim Start einer neuen Session.

### Struktur des Memory-Dokuments

```md
# KORE MEMORY

## Letzte Session
- Hauptziel
- Geänderte Dateien
- Zentrale Entscheidungen

## Offene Spannungen
- Was ungelöst blieb
- Welche Risiken offen sind

## Nächste sinnvolle Schritte
- Priorisierte Folgeaktionen
```

### Reihenfolge

1. Event- und Diff-Daten für eine Session konsolidieren.
2. Regelbasierte erste Zusammenfassung bauen.
3. Optional lokales Modell für bessere Zusammenfassungen ergänzen.
4. Memory-Viewer im UI einbauen.
5. Auto-Injektion in neue Sessions aktivieren.

### Abnahme

Nach zehn Sessions soll der Nutzer die zuletzt getroffenen Entscheidungen nicht mehr manuell rekonstruieren müssen.

## Phase 6 — Flow Mode: visueller Workflow-Baukasten

xyflow beziehungsweise ReactFlow ist ein naheliegender Unterbau für interaktive Node-UIs, und es gibt Hinweise auf offene Agent-Workflow-Builder im selben Umfeld.[cite:45][cite:48] Das macht einen visuellen Modus mit Mausverbindungen zum leichtesten Weg.

### Zielbild

- Node-basierte Workflows wie n8n oder Railway.
- jcode-Agenten, Prompt-Vault, Test-Runner, Research und Repo-Kontext als Module.
- Ausführbarer Graph statt reinem Chat.

### Erste Node-Typen

| Node | Zweck |
|---|---|
| Repo Node | liefert Repo- oder Dateikontext |
| Vault Node | liefert Prompt- oder Frame-Kontext |
| jcode Node | führt Agent-Aufgaben aus |
| Test Node | startet Tests oder Checks |
| Research Node | führt Recherche oder API-Abfragen aus |
| Score Node | berechnet Harness- oder Qualitätsmetriken |

### Reihenfolge

1. ReactFlow integrieren.
2. Gemeinsames Node/Edge-Schema definieren.
3. Drei erste Nodes bauen: Repo, Vault, jcode.
4. Topologische Ausführung von Graphen ergänzen.
5. Ergebnisse in Sessions und Events zurückschreiben.
6. Später: Template-Bibliothek und Subflows ergänzen.

### Abnahme

Ein Nutzer soll einen einfachen Flow aus Repo-Node → Vault-Node → jcode-Node zusammenklicken und ausführen können.

## Phase 7 — Canvas Mode: räumliche AI-Arbeit statt linearer Chat

Der Canvas-Mode ergänzt den Standard-Chat, ersetzt ihn aber nicht. Er ist für nichtlineares Denken, große Refactors, Architekturarbeit und Forschungscluster gedacht.

### Zielbild

- Infinite Canvas mit Karten für Prompts, Antworten, Dateien, Diffs und Notizen.
- Gruppieren, verbinden, verschieben und exportieren.
- Antwortkarten können direkt in Flow-Nodes oder Vault-Einträge überführt werden.

### Technische Richtung

Tldraw ist ein sinnvoller Kandidat für einen eingebetteten unendlichen Canvas, weil es für solche räumlichen Interfaces gut geeignet ist und sich in React integrieren lässt. Als Alternative könnte auch ein ReactFlow-basierter Pseudo-Canvas entstehen, wenn die Komplexität niedrig gehalten werden soll.

### Reihenfolge

1. Canvas-Bibliothek wählen.
2. Custom-Karten für Prompt, Response, File und Diff definieren.
3. Speicherung im gemeinsamen Datenmodell umsetzen.
4. Export in Flow-Mode und Vault ermöglichen.
5. Gruppierung und Session-Snapshots ergänzen.

### Abnahme

Ein kompletter Architektur- oder Debugging-Strang muss visuell auf dem Canvas darstellbar und speicherbar sein.

## Phase 8 — Repo Mesh: mehrere Repos als Netzwerk

Im Repo-Mesh wird ein Meta-Repo wie „Dyson Sphere“ zum Steuerzentrum für andere verbundene Repos. Dort lassen sich Scores, Spannungen, Beziehungen und Entwicklungsdynamik mehrerer Repos sichtbar machen.

### Funktionsumfang

- Mehrere lokale oder entfernte Repos verbinden.
- Repo-Knoten und Abhängigkeitskanten anzeigen.
- Harness- und Qualitätswerte pro Repo berechnen.
- Verlauf und Drift über Zeit anzeigen.

### Kernmetriken

| Metrik | Bedeutung |
|---|---|
| Harness Score | Stabilität, Ausführung, Benchmark-ähnliche Signale |
| RC-Score | Innovations- und Hebelwert einer Session oder Änderung |
| Session Velocity | Fortschritt pro Session |
| Tension Level | ungelöste Probleme und Reibung |
| Dependency Topology | Beziehungen zwischen Repos |

### Reihenfolge

1. Tabelle für verbundene Repos und Beziehungen bauen.
2. Repo-Scanner und Git-Metadaten einlesen.
3. Mesh-Visualisierung mit demselben Node-System wie Flow-Mode umsetzen.
4. Regelbasierte Metriken berechnen.
5. Später automatische Hintergrundanalyse ergänzen.

### Abnahme

Ein Meta-Repo muss mindestens drei andere Repos verbunden anzeigen und deren Status auf einen Blick erfassbar machen.

## Phase 9 — Harness-, Quality- und Scoring-Layer

Diese Phase macht aus bloßen Logs echte Bewertungssignale. Der Nutzer wollte, dass ein Dyson-Sphere-Repo andere Repos vermessen kann; deshalb braucht KORE ein Scoring-System.

### Mögliche Score-Klassen

- Harness Score: technische Stabilität und Ausführung.
- Session Score: Tiefe, Reibung, Ergebnisqualität.
- RC-Score: Ratchet-Potenzial der Veränderung.
- Memory Utilization Score: wie viel vergangener Kontext tatsächlich wiederverwendet wurde.

### Reihenfolge

1. Regelbasierte Heuristiken als erste Version bauen.
2. Ergebnisse im UI sichtbar machen.
3. Score-Verlauf pro Repo und pro Session speichern.
4. Später optionale LLM-gestützte Bewertung ergänzen.

### Abnahme

Jede Session und jedes verbundene Repo soll mindestens einen nachvollziehbaren Score besitzen, der aus Logs, Diffs und Ergebnissen abgeleitet wird.

## Phase 10 — Adaptive UI und selbstverbessernde Oberfläche

Die Erfindungskette schlug ein lokales, implizites Feedback-System für UI-Evolution vor, das Klickpfade, Verweilzeiten und Navigationsmuster nutzt, um das Layout über mehrere Sessions zu verbessern.[cite:28] Gleichzeitig gelten harte Grenzen: keine plötzlichen Umbauten während aktiver Arbeit und keine Überschreibung von Nutzerpräferenzen ohne Zustimmung.[cite:28]

### Zielbild

- Die App lernt, welche Panels und Modi häufig zusammen genutzt werden.
- Vorschläge zur Layout-Verbesserung werden zwischen Sessions präsentiert.
- Änderungen sind reversibel und nachvollziehbar.
- Das System protokolliert seine eigenen Layout-Drifts.

### Implizite Signale

- Klickhäufigkeit pro Panel.
- Verweildauer pro Bereich.
- Reihenfolge von Tab-Wechseln.
- Häufig versteckte oder geöffnete Panels.
- Prompt-Revisionen und Kontext-Suchmuster.

### Reihenfolge

1. Nutzungsereignisse passiv loggen.
2. Keine automatische Änderung in Phase 1; nur Beobachtung.
3. Nach genügend Daten Layout-Empfehlungen aussprechen.
4. Opt-in für adaptive Layouts einbauen.
5. Verlauf der Layout-Änderungen dokumentieren.

### Abnahme

Das System darf erst dann Layout-Vorschläge machen, wenn über mehrere Sessions verlässliche Muster sichtbar werden. Diese Leitlinie folgt direkt den formulierten Grenzen für Stabilität und Vertrauen.[cite:28]

## Phase 11 — Tension Radar und vorausschauende Hilfe

Diese Schicht erkennt Reibung, bevor der Nutzer sie ausdrücklich formuliert. Das System soll Schatten erkennen, bevor die Quelle sichtbar wird.

### Signale

- ungewöhnlich viele Prompt-Edits,
- wiederholte Reverts,
- häufige Wechsel zwischen Research und Chat,
- lange Inaktivität nach bestimmten Antworten,
- wiederkehrende Fehler in denselben Dateien.

### Reaktion

- kontextbezogene Hinweise,
- Vorschlag, altes Memory wieder zu laden,
- Vorschlag, einen Research-Node oder Test-Node einzusetzen,
- Warnung bei hoher Reibung in einem Repo oder Modul.

### Abnahme

Hinweise dürfen nicht nerven oder dominieren. Sie erscheinen nur bei klaren Mustern und müssen vom Nutzer abschaltbar sein.

## Phase 12 — Unified Data Model

Alle Modi werden auf ein gemeinsames Datenmodell aufgesetzt, damit Inhalte übertragbar bleiben.

### Zentrale Tabellen

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  name TEXT,
  path TEXT,
  remote_url TEXT,
  created_at TEXT
);

CREATE TABLE graph_nodes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  mode TEXT,
  node_type TEXT,
  data_json TEXT,
  position_x REAL,
  position_y REAL
);

CREATE TABLE graph_edges (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  mode TEXT,
  source_id TEXT,
  target_id TEXT,
  data_json TEXT
);

CREATE TABLE repo_links (
  id TEXT PRIMARY KEY,
  source_repo_id TEXT,
  target_repo_id TEXT,
  relation_type TEXT,
  data_json TEXT
);
```

### Nutzen

- dieselben Daten können im Chat, Flow, Canvas und Mesh erscheinen,
- Cards aus Canvas können zu Flow-Nodes werden,
- Repo-Mesh nutzt denselben Graph-Unterbau wie Flow,
- Session-History bleibt über alle Darstellungen konsistent.

## Phase 13 — UX, Modi und Navigation

### Modus-System

| Modus | Standard? | Zweck |
|---|---|---|
| Chat | Ja | tägliche Arbeit wie in Cursor |
| Flow | Nein | visuelle Automatisierung und Agent-Workflows |
| Canvas | Nein | räumliches Denken, Architektur, Planung |
| Mesh | Nein | repoübergreifende Sicht und Metriken |

### Navigationsregeln

- Chat-Modus startet immer zuerst.
- Andere Modi öffnen sich als zusätzliche Räume, nicht als Ersatz.
- Alle Modi müssen über Shortcuts und Tabs schnell erreichbar sein.
- Der Nutzer kann Modi ausblenden, wenn sie nicht gebraucht werden.

## Phase 14 — Delivery-Roadmap

### MVP — 2 bis 3 Wochen

- Electron-Grundgerüst.
- Chat/Coding-Modus.
- Session-Persistenz.
- Repo-Explorer.
- Monaco + xterm.js.
- Prompt Vault Basis.
- Browser-Bridge mit Perplexity.

### V1 — 4 bis 6 Wochen

- VSCode-/code-server-Tabs.
- KORE_MEMORY.
- Execution-Graph.
- bessere Vault-Nutzung.
- erste Research-Automationen.

### V2 — 6 bis 10 Wochen

- Flow-Mode mit ReactFlow.
- erste ausführbare Node-Pipelines.
- Score-Layer.
- Repo-Mesh mit drei verbundenen Repos.

### V3 — 10 bis 14 Wochen

- Canvas-Mode.
- Cross-Mode-Datenmodell vollständig.
- Tension Radar.
- adaptive Layout-Vorschläge.

### V4 — danach

- selbstverbessernde Layout-Schleifen,
- fortgeschrittenes Cross-Repo-Scoring,
- Hintergrundanalyse und automatische Kontextvorbereitung,
- Meta-Repo-Steuerzentrum im Dyson-Sphere-Stil.

## Team- und Rollenbedarf

| Rolle | Bedarf |
|---|---|
| Electron/Node Engineer | hoch |
| React UI Engineer | hoch |
| UX/Interaction Designer | mittel |
| Persistence/Data Engineer | mittel |
| Optional AI/Scoring Engineer | mittel |

Ein Einzelentwickler kann die Phasen bis einschließlich V1 realistisch alleine bauen. Für Flow, Mesh und adaptive Schichten wird parallele Arbeit deutlich wertvoller.

## Risiken und Gegenmaßnahmen

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Feature-Overload | App wirkt zu komplex | Chat-Modus als harter Default |
| Electron-Bloat | schwache Performance | WebContents begrenzen, lazy loading |
| zu frühe Adaptive UI | Vertrauensverlust | Opt-in, nur zwischen Sessions [cite:28] |
| zu viele Scores ohne Nutzen | Verwirrung | erst wenige Kernmetriken, klar definieren |
| Flow-Mode wird Selbstzweck | geringer Alltagswert | zuerst nur Nodes bauen, die echte Arbeit sparen |
| Browser-Bridge ist fragil | Wartungsaufwand | API-first wo möglich, DOM-Hooks nur ergänzend |

## Empfohlene erste drei Sprints

### Sprint 1

- Electron-Startgerüst
- React-App-Shell
- Monaco + xterm.js
- jcode-PTY
- SQLite Sessions

### Sprint 2

- Repo-Explorer
- Chat-History
- Session-Wiederaufnahme
- Prompt Vault Import
- Vault Sidebar

### Sprint 3

- Perplexity-Tab
- Browser-Bridge
- KORE_MEMORY v1
- Execution-Events und einfache Timeline

## Entscheidungsregel für jede neue Idee

Neue Features werden nur eingebaut, wenn sie mindestens eine dieser Bedingungen erfüllen:

- sie reduzieren einen echten Kontextwechsel,
- sie machen verlorenes Signal sichtbar,
- sie sparen wiederholte Handarbeit,
- sie machen dieselben Daten in mehreren Modi nutzbar,
- sie erhöhen Stabilität statt nur Oberfläche.

## Nächster Schritt

Der beste Startpunkt ist nicht Flow, Mesh oder adaptive UI, sondern ein harter MVP des normalen Chat/Coding-Modus mit Session-Persistenz, Vault und Browser-Bridge. Diese drei Teile erzeugen den größten Alltagswert bei der geringsten Komplexität und bilden die Basis für alle späteren Modi.
