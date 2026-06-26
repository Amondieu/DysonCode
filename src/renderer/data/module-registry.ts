/**
 * ── FLOW Module Registry ──
 * Every module that can be placed on the FLOW canvas.
 * Adding a new module type is a data change, not a code change.
 *
 * Categories: thinking | council | data | execution | creative | meta
 * Frames: IDEVA | ΣΚΟΠ | INVENTIO | Ω1 | Ω2 | Ω3 | Ω6
 * Roles: ROLLE_I (Architect) | ROLLE_III (Builder) | ROLLE_IV (Critic/Tester) | ROLLE_V (Memory Keeper)
 */

export type ModuleCategory = 'thinking' | 'council' | 'data' | 'execution' | 'creative' | 'meta';
export type CognitiveFrame = 'IDEVA' | 'ΣΚΟΠ' | 'INVENTIO' | 'Ω1' | 'Ω2' | 'Ω3' | 'Ω6';
export type KORERole = 'ROLLE_I' | 'ROLLE_III' | 'ROLLE_IV' | 'ROLLE_V';

export interface ModuleDefinition {
  id: string;
  label: string;
  category: ModuleCategory;
  frame?: CognitiveFrame;
  role?: KORERole;
  icon: string;
  color: string;               // border/accent color (tailwind border class or hex)
  nodeType: string;            // ReactFlow node type: 'agent' | 'repo' | 'test' | 'vault' | future custom types
  inputPorts: string[];        // semantic input port labels
  outputPorts: string[];       // semantic output port labels
  defaultPrompt?: string;      // auto-filled when placed
  capabilities: string[];
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  // ── 🧠 THINKING ──
  {
    id: 'architect', label: 'Architect', category: 'thinking',
    frame: 'IDEVA', role: 'ROLLE_I', icon: '🏛️', color: '#6c8cf8',
    nodeType: 'agent', inputPorts: ['Intent', 'Context'], outputPorts: ['Blueprint'],
    defaultPrompt: 'Generate a BuildManifest from the upstream intent. Compress to IDEVA minimal form.',
    capabilities: ['blueprint', 'compression', 'architecture'],
  },
  {
    id: 'critic', label: 'Critic', category: 'thinking',
    frame: 'ΣΚΟΠ', role: 'ROLLE_IV', icon: '⚔️', color: '#ef4444',
    nodeType: 'agent', inputPorts: ['Blueprint', 'Constraint'], outputPorts: ['FailureNote'],
    defaultPrompt: 'Adversarially falsify the upstream blueprint. Inject ΣΚΟΠ constraints.',
    capabilities: ['falsification', 'constraint-injection', 'risk-analysis'],
  },
  {
    id: 'inventor', label: 'Inventor', category: 'thinking',
    frame: 'INVENTIO', icon: '💡', color: '#f59e0b',
    nodeType: 'agent', inputPorts: ['Concept', 'Domain'], outputPorts: ['Invention'],
    defaultPrompt: 'Expand the possibility space around this concept. Find Level 2 inventions.',
    capabilities: ['divergence', 'invention', 'possibility-expansion'],
  },
  {
    id: 'tension_engine', label: 'Tension Engine', category: 'thinking',
    frame: 'Ω6', icon: '⚡', color: '#a855f7',
    nodeType: 'agent', inputPorts: ['Thesis', 'Antithesis'], outputPorts: ['Synthesis'],
    defaultPrompt: 'Map thesis/antithesis and force a synthesis through dialectic tension.',
    capabilities: ['dialectic', 'synthesis', 'tension-mapping'],
  },
  {
    id: 'compressor', label: 'Compressor', category: 'thinking',
    frame: 'Ω1', icon: '🗜️', color: '#22d3ee',
    nodeType: 'agent', inputPorts: ['Data'], outputPorts: ['Kolmogorov'],
    defaultPrompt: 'Find the Kolmogorov minimum description. Strip everything non-essential.',
    capabilities: ['compression', 'min-description', 'essential-extraction'],
  },
  {
    id: 'renorm', label: 'Renorm', category: 'thinking',
    frame: 'Ω3', icon: '🔬', color: '#34d399',
    nodeType: 'agent', inputPorts: ['Signal'], outputPorts: ['Invariant'],
    defaultPrompt: 'What survives all zoom levels? Strip irrelevant features.',
    capabilities: ['renormalization', 'invariant-extraction', 'scale-analysis'],
  },

  // ── 💬 COUNCIL ──
  {
    id: 'council', label: 'Council', category: 'council',
    icon: '🏛️', color: '#8b5cf6',
    nodeType: 'agent', inputPorts: ['Question', 'Roles[]'], outputPorts: ['Verdict'],
    defaultPrompt: 'Convene a council of agents with assigned roles. Debate this question and synthesize a verdict.',
    capabilities: ['multi-agent', 'debate', 'synthesis'],
  },
  {
    id: 'socratic', label: 'Socratic', category: 'council',
    icon: '❓', color: '#ec4899',
    nodeType: 'agent', inputPorts: ['Claim'], outputPorts: ['Refined Claim'],
    defaultPrompt: 'Interrogate this claim with productive contradictions. Force refinement.',
    capabilities: ['interrogation', 'contradiction', 'refinement'],
  },
  {
    id: 'ensemble', label: 'Ensemble', category: 'council',
    icon: '🎯', color: '#f97316',
    nodeType: 'agent', inputPorts: ['Prompt'], outputPorts: ['Best Answer'],
    defaultPrompt: 'Send this prompt to 3 parallel model calls. Select the best answer.',
    capabilities: ['parallel-calls', 'selection', 'quality-filter'],
  },
  {
    id: 'memory_council', label: 'Memory Council', category: 'council',
    icon: '💾', color: '#a855f7',
    nodeType: 'agent', inputPorts: ['Council Output'], outputPorts: ['Memory Artifact'],
    defaultPrompt: 'Compress the council output into a persistent memory artifact.',
    capabilities: ['compression', 'persistence', 'memory'],
  },

  // ── 🌐 DATA ──
  {
    id: 'browser_agent', label: 'Browser Agent', category: 'data',
    icon: '🌐', color: '#3b82f6',
    nodeType: 'agent', inputPorts: ['URL'], outputPorts: ['Content'],
    defaultPrompt: 'Navigate to the URL and extract structured content.',
    capabilities: ['browsing', 'extraction', 'scraping'],
  },
  {
    id: 'search_agent', label: 'Search Agent', category: 'data',
    icon: '🔍', color: '#6366f1',
    nodeType: 'agent', inputPorts: ['Query'], outputPorts: ['Results'],
    defaultPrompt: 'Search the web for this query. Return structured results.',
    capabilities: ['search', 'web-research', 'structured-output'],
  },
  {
    id: 'file_reader', label: 'File Reader', category: 'data',
    icon: '📄', color: '#14b8a6',
    nodeType: 'agent', inputPorts: ['Path'], outputPorts: ['Content'],
    defaultPrompt: 'Read the file at this path. Return its content.',
    capabilities: ['file-read', 'local-access'],
  },
  {
    id: 'api_call', label: 'API Call', category: 'data',
    icon: '🔌', color: '#0ea5e9',
    nodeType: 'agent', inputPorts: ['Request'], outputPorts: ['Response'],
    defaultPrompt: 'Execute this HTTP request. Return the structured response.',
    capabilities: ['http', 'api', 'structured-response'],
  },
  {
    id: 'rss_feed', label: 'RSS Feed', category: 'data',
    icon: '📡', color: '#f97316',
    nodeType: 'agent', inputPorts: ['Feed URL'], outputPorts: ['Items'],
    defaultPrompt: 'Monitor this RSS feed. Fire on new items.',
    capabilities: ['rss', 'monitoring', 'event-driven'],
  },

  // ── ⚡ EXECUTION ──
  {
    id: 'builder', label: 'Builder', category: 'execution',
    role: 'ROLLE_III', icon: '🔨', color: '#22c55e',
    nodeType: 'agent', inputPorts: ['Blueprint', 'Repo'], outputPorts: ['CodeDelta'],
    defaultPrompt: 'Write the smallest reversible file change that implements the blueprint step.',
    capabilities: ['file-write', 'minimum-change', 'reversible'],
  },
  {
    id: 'tester', label: 'Tester', category: 'execution',
    role: 'ROLLE_IV', icon: '🧪', color: '#eab308',
    nodeType: 'agent', inputPorts: ['CodeDelta', 'Repo'], outputPorts: ['TestResult'],
    defaultPrompt: 'Run validation on this code change. Generate cheap falsifiers.',
    capabilities: ['validation', 'falsification', 'testing'],
  },
  {
    id: 'shell', label: 'Shell', category: 'execution',
    icon: '⌨️', color: '#64748b',
    nodeType: 'agent', inputPorts: ['Command'], outputPorts: ['Output'],
    defaultPrompt: 'Execute this shell command. Return stdout and stderr.',
    capabilities: ['shell', 'execution', 'pipe-output'],
  },
  {
    id: 'kore_exec', label: 'kore-exec', category: 'execution',
    icon: '🦀', color: '#f472b6',
    nodeType: 'agent', inputPorts: ['ToolCall'], outputPorts: ['ToolResult'],
    defaultPrompt: 'Execute via kore-exec Rust binary. Stream output.',
    capabilities: ['rust-exec', 'stream', 'full-tool-set'],
  },

  // ── 🎨 CREATIVE ──
  {
    id: 'invention_factory', label: 'Invention Factory', category: 'creative',
    icon: '🏭', color: '#fbbf24',
    nodeType: 'agent', inputPorts: ['Intent'], outputPorts: ['Invention'],
    defaultPrompt: 'Pipeline: Intent → Tension Engine → Inventor → Critic → output.',
    capabilities: ['pipeline', 'invention', 'multi-step'],
  },
  {
    id: 'cross_domain_bridge', label: 'Cross-Domain Bridge', category: 'creative',
    icon: '🌉', color: '#c084fc',
    nodeType: 'agent', inputPorts: ['Concept A', 'Domain B'], outputPorts: ['Morphism'],
    defaultPrompt: 'Take concept in domain A. Find the morphism to domain B via Ω1.',
    capabilities: ['cross-domain', 'morphism', 'analogy'],
  },
  {
    id: 'idea_mutator', label: 'Idea Mutator', category: 'creative',
    icon: '🧬', color: '#fb7185',
    nodeType: 'agent', inputPorts: ['Concept'], outputPorts: ['Mutations[]'],
    defaultPrompt: 'Take a concept. Apply all 7 multiplicators. Output 7 mutations.',
    capabilities: ['mutation', 'divergence', 'multi-output'],
  },
  {
    id: 'concept_synthesizer', label: 'Concept Synthesizer', category: 'creative',
    icon: '🔄', color: '#2dd4bf',
    nodeType: 'agent', inputPorts: ['Concepts[]'], outputPorts: ['Unified'],
    defaultPrompt: 'Receive N concepts. Find the functor F: C → C\' that unifies them.',
    capabilities: ['synthesis', 'unification', 'functor'],
  },

  // ── 🔧 META ──
  {
    id: 'module_builder', label: 'Module Builder', category: 'meta',
    icon: '🛠️', color: '#94a3b8',
    nodeType: 'agent', inputPorts: ['Pattern'], outputPorts: ['ModuleDef'],
    defaultPrompt: 'Observe patterns in the current graph. Propose a new module definition.',
    capabilities: ['meta-creation', 'pattern-recognition'],
  },
  {
    id: 'graph_optimizer', label: 'Graph Optimizer', category: 'meta',
    icon: '📊', color: '#475569',
    nodeType: 'agent', inputPorts: ['Graph'], outputPorts: ['Rewiring'],
    defaultPrompt: 'Analyze the current graph topology. Propose rewiring for better flow.',
    capabilities: ['optimization', 'rewiring', 'topology-analysis'],
  },
  {
    id: 'paradigm_monitor', label: 'Paradigm Monitor', category: 'meta',
    icon: '📈', color: '#facc15',
    nodeType: 'agent', inputPorts: ['Metrics'], outputPorts: ['Upgrade Flag'],
    defaultPrompt: 'Track output quality. Trigger paradigm upgrade when stagnating (ΦΩΡGΕ Organ 7).',
    capabilities: ['monitoring', 'quality-tracking', 'paradigm-detection'],
  },
  {
    id: 'memory_keeper', label: 'Memory Keeper', category: 'meta',
    role: 'ROLLE_V', icon: '🧠', color: '#c084fc',
    nodeType: 'agent', inputPorts: ['Session Graph'], outputPorts: ['MemorySnapshot'],
    defaultPrompt: 'Compress the session graph into a minimal seed for the next session.',
    capabilities: ['compression', 'memory', 'session-seed'],
  },
  // ── 🔬 JCODE Pipeline (Layer 1–4 native modules) ──
  {
    id: 'precheck_gate', label: 'PreCheck Gate', category: 'execution',
    frame: 'ΣΚΟΠ', icon: '🛡️', color: '#f472b6',
    nodeType: 'agent',
    inputPorts: ['jcode Input'], outputPorts: ['PreCheckResult'],
    defaultPrompt: 'Run the 8 compile-time invariant laws on the jcode input. Return PreCheckResult with pass/fail and per-law evidence.',
    capabilities: ['invariant-check', 'compile-time', 'pre-execution', 'schema-validation'],
  },
  {
    id: 'manifold_detector', label: 'Manifold Detector', category: 'execution',
    frame: 'IDEVA', icon: '📐', color: '#22d3ee',
    nodeType: 'agent',
    inputPorts: ['jcode Input'], outputPorts: ['Manifold Report'],
    defaultPrompt: 'Analyze the jcode graph: identify real degrees of freedom, redundant edges, and independent node roles.',
    capabilities: ['manifold-detection', 'dof-analysis', 'redundancy-detection'],
  },
  {
    id: 'gap_geometry', label: 'Gap Geometry', category: 'execution',
    frame: 'IDEVA', icon: '🕳️', color: '#a78bfa',
    nodeType: 'agent',
    inputPorts: ['jcode Input'], outputPorts: ['Gap Report'],
    defaultPrompt: 'Find missing dimensions in the jcode graph: isolated nodes, orphan edges, connectivity gaps.',
    capabilities: ['gap-detection', 'connectivity-analysis', 'isolation-detection'],
  },
  {
    id: 'harvest_auditor', label: 'Harvest Auditor', category: 'execution',
    frame: 'IDEVA', icon: '🌾', color: '#34d399',
    nodeType: 'agent',
    inputPorts: ['jcode Input'], outputPorts: ['Harvest Report'],
    defaultPrompt: 'Audit unused capacity before building: detect unused capabilities, redundant specs, harvestable structure.',
    capabilities: ['harvest-audit', 'capacity-detection', 'waste-identification'],
  },
  {
    id: 'field_collapse', label: 'Field Collapse', category: 'execution',
    frame: 'IDEVA', icon: '📉', color: '#f87171',
    nodeType: 'agent',
    inputPorts: ['jcode Input'], outputPorts: ['Collapse Report'],
    defaultPrompt: 'Find the minimal constraint set: identify essential vs redundant nodes, compute compression ratio.',
    capabilities: ['field-collapse', 'minimal-set', 'compression-ratio'],
  },
  {
    id: 'fixpoint_check', label: 'Fixpoint Check', category: 'execution',
    frame: 'IDEVA', icon: '🔄', color: '#c084fc',
    nodeType: 'agent',
    inputPorts: ['Stage Outputs'], outputPorts: ['FixpointResult'],
    defaultPrompt: 'Check Φ(output) = output: structural hash comparison, contradiction marker detection, convergence scoring.',
    capabilities: ['fixpoint-detection', 'convergence', 'contradiction-marking'],
  },
  {
    id: 'ratchet_scorer', label: 'Ratchet Scorer', category: 'meta',
    frame: 'Ω3', icon: '⭐', color: '#fbbf24',
    nodeType: 'agent',
    inputPorts: ['Pipeline Result'], outputPorts: ['RatchetScore'],
    defaultPrompt: 'Score the output against all 7 Ratchet Conditions. RC ≥ 5 = permanent ratchet, RC < 4 = useful artifact.',
    capabilities: ['ratchet-scoring', 'rc-evaluation', 'improvement-hints'],
  },
  {
    id: 'omega_router', label: 'Omega Router', category: 'meta',
    frame: 'Ω6', icon: '🧭', color: '#fb923c',
    nodeType: 'agent',
    inputPorts: ['Pipeline Result', 'RatchetScore'], outputPorts: ['OmegaRoute[]'],
    defaultPrompt: 'Resolve failure signatures to Ω multiplicator routes: Ω1–Ω7 based on symptom detection.',
    capabilities: ['omega-routing', 'failure-resolution', 'symptom-detection'],
  },
  {
    id: 'jcode_pipeline', label: 'jcode Pipeline', category: 'execution',
    frame: 'IDEVA', icon: '⚡', color: '#38bdf8',
    nodeType: 'agent',
    inputPorts: ['jcode Input', 'PreCheckResult'], outputPorts: ['PipelineResult'],
    defaultPrompt: 'Execute the full 4-layer jcode pipeline: PreCheck → 5-stage filter → Ratchet → Ω routing.',
    capabilities: ['full-pipeline', '4-layer-execution', 'jcode-native'],
  },
];

/** Look up a module by id */
export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

/** Group modules by category for palette display */
export function getModulesByCategory(): Record<ModuleCategory, ModuleDefinition[]> {
  const grouped: Record<ModuleCategory, ModuleDefinition[]> = {
    thinking: [],
    council: [],
    data: [],
    execution: [],
    creative: [],
    meta: [],
  };
  for (const mod of MODULE_REGISTRY) {
    grouped[mod.category].push(mod);
  }
  return grouped;
}
