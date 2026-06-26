// src/renderer/components/DysonFrameModulator.tsx
// React component: interactive Frame modulators beneath chat input.
// Each Frame transforms text via LLM call (jcode's configured providers).
// Model defaults: gpt-5.4 primary, deepseek-4-flash fallback.

import { useState, useCallback, useRef, useEffect } from 'react';
import './DysonFrameModulator.css';

/* ═══════════════════════════════════════════════════════════
   FRAME DEFINITIONS
   Interface: { id, name, symbol, color, glowColor, description, systemPrompt }
═══════════════════════════════════════════════════════════ */
export interface FrameDef {
  id: string;
  name: string;
  symbol: string;
  color: string;
  glowColor: string;
  description: string;
  systemPrompt: string;
}

export const FRAMES: Record<string, FrameDef> = {
  /* ── Original Dyson Frames ── */
  sigma: {
    id: 'sigma',
    name: 'ΣΚΟΠ',
    symbol: 'Σ',
    color: '#4f98a3',
    glowColor: 'rgba(79,152,163,0.28)',
    description: 'Field Collapse — inject precise constraints that collapse solution space',
    systemPrompt: `You are applying the ΣΚΟΠ Field Collapse frame.
Transform the following text by:
1. Identifying the core constraint or irreducible requirement hidden in the message
2. Stripping all redundant scope — keep only what is strictly necessary
3. Reformulating the message so it is maximally precise and constraint-rich
4. Each word must earn its place; remove anything that does not add constraint
Output only the transformed text. No explanation. No preamble.`,
  },
  ideva: {
    id: 'ideva',
    name: 'IDEVA',
    symbol: 'Ω',
    color: '#e8af34',
    glowColor: 'rgba(232,175,52,0.28)',
    description: 'Compression — maximum signal per token, remove all non-essential structure',
    systemPrompt: `You are applying the IDEVA Ω Compression frame.
Transform the following text by:
1. Compressing it to maximum information density — every token must carry signal
2. Eliminating filler words, hedging, redundant context
3. Preserving all essential meaning and nuance in the most compact form possible
4. The output should be shorter and denser than the input, not longer
Output only the transformed text. No explanation. No preamble.`,
  },
  phworge: {
    id: 'phworge',
    name: 'ΦΩΡGΕ',
    symbol: 'Φ',
    color: '#da7101',
    glowColor: 'rgba(218,113,1,0.28)',
    description: 'Invention Engine — expand category, seed productive contradictions',
    systemPrompt: `You are applying the ΦΩΡGΕ Invention frame.
Transform the following text by:
1. Expanding the solution category — ask what new problem class this opens, not just solves
2. Surfacing productive contradictions or tensions embedded in the request
3. Adding at least one cross-domain bridge or unexpected analogy that genuinely illuminates the core
4. Seeding the message with a question that generates its own successor
Output only the transformed text. No explanation. No preamble.`,
  },
  omega: {
    id: 'omega',
    name: 'ΩMEGA',
    symbol: '∞',
    color: '#a86fdf',
    glowColor: 'rgba(168,111,223,0.28)',
    description: 'Cross-Domain Bridge — find hidden isomorphisms across fields',
    systemPrompt: `You are applying the ΩMEGA Cross-Domain Bridge frame.
Transform the following text by:
1. Identifying the abstract pattern structure underneath the surface request
2. Finding at least one isomorphic pattern from an unrelated domain (biology, physics, economics, music, etc.)
3. Reframing the message using that cross-domain lens to reveal non-obvious structure
4. The bridge must be structurally real, not decorative metaphor
Output only the transformed text. No explanation. No preamble.`,
  },
  dyson: {
    id: 'dyson',
    name: 'Dyson',
    symbol: '◉',
    color: '#6daa45',
    glowColor: 'rgba(109,170,69,0.28)',
    description: 'Harvest Geometry — capture existing capacity before building anything new',
    systemPrompt: `You are applying the Dyson Harvest Geometry frame.
Transform the following text by:
1. Auditing what already exists that could satisfy this request without building anything new
2. Identifying uncaptured capacity, existing tools, or already-solved adjacent problems
3. Reformulating the message to harvest before building — what is available that is being wasted?
4. Surface zero-cost wins that the original framing was overlooking
Output only the transformed text. No explanation. No preamble.`,
  },

  /* ── Grey Frames ── */
  frame_infer: {
    id: 'frame_infer',
    name: 'Frame Inference',
    symbol: '⊞',
    color: '#a78bfa',
    glowColor: 'rgba(167,139,250,0.28)',
    description: 'Extract structured problem frame — targetField, constraints, risks, ambiguities',
    systemPrompt: `You are applying the ⊞ Frame Inference engine (Grey-OS).
Transform the following text by extracting a structured problem frame.
Output a JSON object with these keys:
- targetField: the single noun phrase being analysed (never a system category)
- userGoal: imperative verb + measurable outcome in ≤15 words
- constraints: array of threshold/actor/resource strings
- forbiddenMoves: "action causes harm via mechanism" strings
- assumedBottlenecks: "metric=value: reason" strings
- successDefinition: "metric=target when condition holds"
- uncertaintyClass: Low | Medium | High
- assumptions: array of falsifiable premise strings
- ambiguities: array of "fork A vs B affecting routing/metrix" strings
- risks: array of "failureMode | triggerCondition | impact" pipe-triple strings

Every field must be load-bearing. A weak frame wastes every downstream cycle.
Output only the JSON. No explanation. No preamble.`,
  },
  erkenntnis: {
    id: 'erkenntnis',
    name: 'Erkenntnisgewinn',
    symbol: '◈',
    color: '#34d399',
    glowColor: 'rgba(52,211,153,0.28)',
    description: 'Knowledge Gain Engine — EXPAND → Vector-Scan → Classify → Reframe → Safety',
    systemPrompt: `You are applying the ◈ Erkenntnisgewinn Engine (Grey-OS Knowledge Gain).
Run the following protocol on the input text and output the result:

Step 1 — EXPAND: Name the explicit ask, the implicit concern, and the unasked question that would move this conversation most.

Step 2 — VECTOR-SCAN (4 axes, parallel):
  V1 COMPLETENESS: What is missing from the problem statement?
  V2 BIAS: Which assumption is unexamined?
  V3 CONSEQUENCES: What happens two steps down this path?
  V4 TIMING: Is this insight relevant now — or too early / too late?

Step 3 — NOVELTY × TIMELINE: Tag as [NEW] not yet surfaced, [KNOWN] established, [REFINE] known but new dimension, or [STALE] possibly outdated.

Step 4 — CLASSIFY: Intent category (Build / Fix / Design / Explore / Evaluate / Meta) + Confidence (High / Medium / Low).

Step 5 — REFRAME (if Low confidence or Explore): Reading A (obvious), Reading B (more insight-rich), Chosen with rationale.

Step 6 — SAFETY GATE: Is the action reversible? If not, stop and flag risk.

Output the full protocol result. Be specific and concrete. No preamble.`,
  },
  vectorscan: {
    id: 'vectorscan',
    name: 'Vector-Scan',
    symbol: 'Ψ',
    color: '#f472b6',
    glowColor: 'rgba(244,114,182,0.28)',
    description: '4-axis parallel scan — Completeness, Bias, Consequences, Timing',
    systemPrompt: `You are applying the Ψ Vector-Scan frame (Grey-OS 4-axis parallel scan).
Analyze the following text by running all four axes simultaneously:

V1 COMPLETENESS — What is missing from the problem statement or request?
  • What information would a competent analyst need that isn't here?
  • What scope boundary is assumed but not stated?

V2 BIAS — Which assumption is unexamined?
  • What is being treated as given that could be false?
  • What framing choice would a skeptic challenge first?

V3 CONSEQUENCES — What happens two steps down this path?
  • If this is acted on as stated, what second-order effects emerge?
  • What feedback loop is being ignored?

V4 TIMING — Is this insight relevant now?
  • Is this action premature, timely, or overdue?
  • What would change if this waited a week?

Output the full 4-axis scan results. Be specific — name actual files, metrics, or actors. No preamble no explanation.`,
  },
  crf_gate: {
    id: 'crf_gate',
    name: 'CRF Gate',
    symbol: 'Δ',
    color: '#fb923c',
    glowColor: 'rgba(251,146,60,0.28)',
    description: '5-question hypothesis filter — Testable? Transfers? Compresses? Connects? Reduces uncertainty?',
    systemPrompt: `You are applying the Δ CRF Gate frame (Grey-OS hypothesis filter).
Evaluate the following text as a hypothesis or proposed solution against all 5 gates.
For each gate answer YES or NO with a concrete example. Threshold: ≥4/5 YES to proceed.

Gate 1 — TESTABLE: Can this be empirically tested or falsified?
  [YES/NO] + the specific test that would confirm or refute it.

Gate 2 — TRANSFERS: Does this insight transfer without structural loss across ≥2 domains?
  [YES/NO] + name the second domain and what the transfer preserves.

Gate 3 — COMPRESSES: Does this explain more than it requires?
  [YES/NO] + what existing facts does it unify that were previously separate?

Gate 4 — CONNECTS: Does this connect to ≥1 existing structure?
  [YES/NO] + name the existing structure it links to.

Gate 5 — REDUCES UNCERTAINTY: Does adopting this reduce uncertainty for this problem?
  [YES/NO] + by how much and for which decision?

If ≤3/5 YES, output: [GATE: PARK] — reasons and what evidence would unlock.
If ≥4/5 YES, output: [GATE: PROCEED] — the surviving hypothesis in its sharpest form.
No preamble. No explanation beyond the gate results.`,
  },
};

/* ═══════════════════════════════════════════════════════════
   FUSION FRAME DEFINITIONS
   Key: sorted comma-joined IDs, e.g. "ideva,sigma"
═══════════════════════════════════════════════════════════ */
export interface FusionDef {
  name: string;
  description: string;
  systemPrompt: string;
}

export const FUSION_FRAMES: Record<string, FusionDef> = {
  'ideva,sigma': {
    name: 'COMPRESSION COLLAPSE',
    description: 'Compress to eigenstate: maximum constraint at minimum tokens',
    systemPrompt: `You are applying the ΣΚΟΠ × IDEVA Fusion: Compression Collapse.
Transform the following text by:
1. Finding the single irreducible constraint (ΣΚΟΠ)
2. Expressing it in the absolute minimum tokens possible (IDEVA)
3. The result should be a one or two sentence statement of maximum precision and density
Output only the transformed text. No explanation.`,
  },
  'phworge,sigma': {
    name: 'INVENTION GATE',
    description: 'Collapse constraints then explode invention space',
    systemPrompt: `You are applying the ΣΚΟΠ × ΦΩΡGΕ Fusion: Invention Gate.
Transform the following text by:
1. First collapsing it to the core tension (ΣΚΟΠ) — what is the real problem?
2. Then from that compressed core, explode outward: what new category does solving this open?
3. Seed the message with the productive contradiction that will generate the next invention
Output only the transformed text. No explanation.`,
  },
  'omega,phworge': {
    name: 'CROSS-DOMAIN INVENTION',
    description: 'Find the abstract pattern, then invent across it',
    systemPrompt: `You are applying the ΦΩΡGΕ × ΩMEGA Fusion: Cross-Domain Invention.
Transform the following text by:
1. Finding the abstract isomorphic pattern (ΩMEGA) underlying the request
2. Using that pattern as a launch pad for genuine invention (ΦΩΡGΕ)
3. The result should propose a solution that could not have been found without the cross-domain bridge
Output only the transformed text. No explanation.`,
  },
  'dyson,sigma': {
    name: 'HARVEST GATE',
    description: 'Collapse to constraint, then audit what already exists',
    systemPrompt: `You are applying the ΣΚΟΠ × Dyson Fusion: Harvest Gate.
Transform the following text by:
1. Defining the precise constraint (ΣΚΟΠ)
2. Auditing what already exists that satisfies that exact constraint without new build (Dyson)
3. The result should surface why building might be unnecessary
Output only the transformed text. No explanation.`,
  },
  'dyson,ideva': {
    name: 'DENSE HARVEST',
    description: 'Harvest all existing capacity, expressed at maximum density',
    systemPrompt: `You are applying the IDEVA × Dyson Fusion: Dense Harvest.
Transform the following text by:
1. Identifying everything already available that addresses the request (Dyson)
2. Expressing that harvest audit in the minimum tokens possible (IDEVA)
Output only the transformed text. No explanation.`,
  },

  /* ── Grey Frame Fusions ── */
  'frame_infer,sigma': {
    name: 'PRECISION FRAME',
    description: 'Collapse → structured frame extraction: maximum constraint in every field',
    systemPrompt: `You are applying the ΣΚΟΠ × ⊞ Fusion: Precision Frame.
Transform the following text by:
1. First collapsing it to its irreducible constraints (ΣΚΟΠ)
2. Then extracting a structured problem frame from that collapsed form
3. Output a JSON object with: targetField, userGoal, constraints, forbiddenMoves, assumedBottlenecks, successDefinition, uncertaintyClass, assumptions, ambiguities, risks
Every field must be maximally specific — no generic values. Output only the JSON.`,
  },
  'erkenntnis,phworge': {
    name: 'INVENTION PROTOCOL',
    description: 'Full Erkenntnisgewinn protocol run on an invention-class problem',
    systemPrompt: `You are applying the ◈ × ΦΩΡGΕ Fusion: Invention Protocol.
Run the full Erkenntnisgewinn engine on the following text, with invention emphasis:
Step 1 — EXPAND: explicit, implicit, unasked
Step 2 — Vector-Scan (4 axes parallel)
Step 3 — Novelty × Timeline
Step 4 — Classify + Confidence
Step 5 — REFRAME: focus on the invention-readiest interpretation
Step 6 — Safety Gate
Add an extra Step 7 — INVENTION SEED: What new problem category does solving this open?
Output the complete protocol result.`,
  },
  'vectorscan,sigma': {
    name: 'SCANNED COLLAPSE',
    description: '4-axis Vector-Scan then collapse to constraint',
    systemPrompt: `You are applying the Ψ × ΣΚΟΠ Fusion: Scanned Collapse.
Transform the following text by:
1. First running the full 4-axis Vector-Scan: V1 Completeness, V2 Bias, V3 Consequences, V4 Timing
2. Then from the scan output, collapse to the single most critical constraint
3. Output the scan results followed by the collapsed constraint
Be specific — name actual metrics, files, actors.`,
  },
  'crf_gate,phworge': {
    name: 'INVENTION FILTER',
    description: 'CRF Gate an invention hypothesis — test before expansion',
    systemPrompt: `You are applying the Δ × ΦΩΡGΕ Fusion: Invention Filter.
Take the following text as an invention hypothesis and run the CRF Gate on it:
Gate 1 — TESTABLE: Can this be empirically falsified?
Gate 2 — TRANSFERS: Does this insight transfer across ≥2 domains?
Gate 3 — COMPRESSES: Does this explain more than it requires?
Gate 4 — CONNECTS: Does this connect to ≥1 existing structure?
Gate 5 — REDUCES UNCERTAINTY: Does adopting this reduce uncertainty?
Each gate: [YES/NO] + concrete example. Threshold ≥4/5 to PROCEED, else PARK.
Output only the gate results and verdict.`,
  },
  'frame_infer,vectorscan': {
    name: 'FULL AUDIT FRAME',
    description: 'Vector-Scan the problem, then extract structured frame',
    systemPrompt: `You are applying the ⊞ × Ψ Fusion: Full Audit Frame.
Transform the following text by:
1. Running the 4-axis Vector-Scan (Completeness, Bias, Consequences, Timing)
2. Then extracting a structured problem frame JSON with all fields
3. The scan findings must inform the frame fields — especially ambiguities, risks, and assumptions
Output the Vector-Scan results first, then the JSON frame. No preamble.`,
  },
  'erkenntnis,dyson': {
    name: 'HARVEST AUDIT',
    description: 'Erkenntnisgewinn protocol run through a harvest lens',
    systemPrompt: `You are applying the ◈ × ◉ Fusion: Harvest Audit.
Run the Erkenntnisgewinn engine on the following text with a harvest-first lens:
Step 1 — EXPAND: What already exists that addresses this?
Step 2 — Vector-Scan with V2 bias focused on build-default bias
Step 3 — Novelty: what is already [KNOWN] and can be reused
Step 4 — Classify + Confidence
Step 5 — REFRAME: the harvest-rich interpretation
Step 6 — Safety Gate
Step 7 — HARVEST LIST: specific existing assets, tools, or solved problems that make new build unnecessary
Output the complete protocol.`,
  },
  'crf_gate,sigma': {
    name: 'CONSTRAINT GATE',
    description: 'Collapse to hypothesis, then CRF Gate it',
    systemPrompt: `You are applying the Δ × ΣΚΟΠ Fusion: Constraint Gate.
Transform the following text by:
1. First collapsing to its core hypothesis or proposed solution (ΣΚΟΠ)
2. Then running the CRF Gate on that hypothesis
3. Each gate answer must reference the specific constraint from step 1
Output the collapsed hypothesis followed by the gate results and verdict.`,
  },
};

/* ═══════════════════════════════════════════════════════════
   PROPS
═══════════════════════════════════════════════════════════ */
export interface DysonFrameModulatorProps {
  /** Current input text value */
  value: string;
  /** Called when the textarea value changes (user typing) */
  onChange: (val: string) => void;
  /** Called when the user wants to send the (possibly transformed) text */
  onSend: (text: string) => void;
  /** Optional: base URL for the LLM API. Falls back to local demo if empty. */
  apiBaseUrl?: string;
  /** Optional: API key. */
  apiKey?: string;
  /** Optional: model name. Defaults to gpt-5.4 with deepseek-4-flash fallback */
  model?: string;
  /** Optional: fallback model */
  fallbackModel?: string;
  /** Optional: fallback API base URL for cloud fallback when primary proxy is down */
  fallbackBaseUrl?: string;
  /** Optional: fallback API key for cloud fallback */
  fallbackApiKey?: string;
  /** Whether the chat is currently busy (streaming) */
  busy?: boolean;
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════ */
export function DysonFrameModulator({
  value,
  onChange,
  onSend,
  apiBaseUrl,
  apiKey,
  model = 'gpt-5.4',
  fallbackModel = 'deepseek-4-flash',
  fallbackBaseUrl,
  fallbackApiKey,
  busy = false,
}: DysonFrameModulatorProps) {
  const [activeFrames, setActiveFrames] = useState<Set<string>>(new Set());
  const [isFusing, setIsFusing] = useState(false);
  const [statusText, setStatusText] = useState('Select frames to activate transformation');
  const [statusClass, setStatusClass] = useState('');
  const [isTransformed, setIsTransformed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose active frames for parent via ref — we'll communicate via the textarea's data attr
  // so ChatPanel can read it. Actually, we'll just handle fuse internally and call onSend after.

  const hasActive = activeFrames.size > 0;

  const toggleFrame = useCallback((frameId: string) => {
    setActiveFrames(prev => {
      const next = new Set(prev);
      if (next.has(frameId)) {
        next.delete(frameId);
      } else {
        next.add(frameId);
      }
      return next;
    });
    setIsTransformed(false);
  }, []);

  // Update status whenever activeFrames or isFusing changes
  useEffect(() => {
    if (isFusing) {
      const names = [...activeFrames].map(id => FRAMES[id]?.name).join(' × ');
      setStatusClass('fusing');
      setStatusText(`⚡ Fusing through ${names}…`);
      return;
    }

    if (activeFrames.size === 0) {
      setStatusClass('');
      setStatusText('Select frames to activate transformation');
    } else if (activeFrames.size === 1) {
      const id = [...activeFrames][0];
      setStatusClass('active');
      setStatusText(`${FRAMES[id].name} — ${FRAMES[id].description}`);
    } else {
      const key = [...activeFrames].sort().join(',');
      const fusion = FUSION_FRAMES[key];
      if (fusion) {
        setStatusClass('active');
        setStatusText(`✦ ${fusion.name}: ${fusion.description}`);
      } else {
        const names = [...activeFrames].map(id => FRAMES[id]?.name).join(' × ');
        setStatusClass('active');
        setStatusText(`Emergent fusion: ${names}`);
      }
    }
  }, [activeFrames, isFusing]);

  // Apply textarea transformed border class
  useEffect(() => {
    if (textareaRef.current) {
      if (isTransformed) {
        textareaRef.current.classList.add('transformed');
      } else {
        textareaRef.current.classList.remove('transformed');
      }
    }
  }, [isTransformed]);

  /* ── FUSE ─────────────────────────────────────────────── */
  const handleFuse = useCallback(async () => {
    const text = value.trim();
    if (!text || activeFrames.size === 0) return;

    setIsFusing(true);

    try {
      const transformed = await fuseText(text, [...activeFrames], {
        apiBaseUrl,
        apiKey,
        model,
        fallbackModel,
        fallbackBaseUrl,
        fallbackApiKey,
      });
      onChange(transformed);
      setIsTransformed(true);
      setStatusClass('success');
      setStatusText('✓ Transformation applied — edit freely before sending');
    } catch (err: any) {
      setStatusClass('error');
      setStatusText(`✗ ${err.message}`);
    } finally {
      setIsFusing(false);
    }
  }, [value, activeFrames, apiBaseUrl, apiKey, model, fallbackModel, onChange]);

  /* ── FUSION INFO ──────────────────────────────────────── */
  const getFusionInfo = (): { name: string; isNamed: boolean; description: string } | null => {
    if (activeFrames.size < 2) return null;
    const key = [...activeFrames].sort().join(',');
    const fusion = FUSION_FRAMES[key];
    if (fusion) {
      return { name: fusion.name, isNamed: true, description: fusion.description };
    }
    const names = [...activeFrames].map(id => FRAMES[id]?.name).join(' × ');
    return { name: names + ' FUSION', isNamed: false, description: 'Multi-frame emergent transformation' };
  };

  const fusionInfo = getFusionInfo();

  const canFuse = hasActive && value.trim().length > 0 && !isFusing;

  // For each frame, compute what named fusions it can participate in
  const frameFusionHints = useCallback((frameId: string): { partner: string; fusion: string }[] => {
    const hints: { partner: string; fusion: string }[] = [];
    for (const [key, fusion] of Object.entries(FUSION_FRAMES)) {
      const ids = key.split(',');
      if (ids.includes(frameId)) {
        const partner = ids.find(id => id !== frameId);
        if (partner) {
          hints.push({ partner: FRAMES[partner]?.symbol + ' ' + FRAMES[partner]?.name, fusion: fusion.name });
        }
      }
    }
    return hints;
  }, []);

  return (
    <div className={`dyson-modulator-wrapper`}>
      {/* Frame modulator row */}
      <div
        className={`dyson-frame-modulator ${hasActive ? 'has-active' : ''}`}
        role="toolbar"
        aria-label="Dyson Frame Modulators"
      >
        <span className="frames-label" aria-hidden="true">Frames</span>

        <div className="frames-row">
          {Object.values(FRAMES).map(frame => (
            <button
              key={frame.id}
              className="dyson-frame-btn"
              data-frame={frame.id}
              aria-pressed={activeFrames.has(frame.id)}
              aria-label={`${frame.name} — ${frame.description}`}
              onClick={() => toggleFrame(frame.id)}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggleFrame(frame.id);
                }
              }}
              type="button"
            >
              <span className="dyson-frame-symbol" aria-hidden="true">
                {frame.symbol}
              </span>
              <span className="dyson-frame-name">{frame.name}</span>
              <div className="dyson-frame-tooltip" role="tooltip">
                <span className="tt-name">{frame.symbol} {frame.name}</span>
                <span className="tt-desc">{frame.description}</span>
                {(() => {
                  const hints = frameFusionHints(frame.id);
                  if (hints.length > 0) {
                    return (
                      <>
                        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }} />
                        <span style={{ fontSize: '9px', color: '#f472b6', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Fusions:</span>
                        {hints.map(h => (
                          <span key={h.fusion} style={{ fontSize: '9px', color: 'var(--text-muted, #6b7280)', display: 'block', lineHeight: 1.4 }}>
                            + {h.partner} → <span style={{ color: '#f472b6' }}>{h.fusion}</span>
                          </span>
                        ))}
                      </>
                    );
                  }
                  return null;
                })()}
              </div>
            </button>
          ))}
        </div>

        {/* Fusion indicator */}
        <div
          className={`dyson-fusion-indicator ${fusionInfo ? 'visible' : ''}`}
          aria-live="polite"
          title={fusionInfo?.description ?? ''}
        >
          <span className="dyson-fusion-dot" aria-hidden="true"></span>
          <span>{fusionInfo?.name ?? 'FUSION'}</span>
          {fusionInfo && (
            <div className="dyson-frame-tooltip" role="tooltip" style={{ bottom: 'calc(100% + 10px)' }}>
              <span className="tt-name">{fusionInfo.name}</span>
              <span className="tt-desc">{fusionInfo.description}</span>
            </div>
          )}
        </div>

        {/* Fuse button */}
        <button
          className={`dyson-fuse-btn ${isFusing ? 'loading' : ''}`}
          disabled={!canFuse}
          onClick={handleFuse}
          aria-label="Fuse: transform input text through active frames"
          type="button"
        >
          {isFusing ? (
            <span className="dyson-spinner"></span>
          ) : (
            <span className="dyson-fuse-icon" aria-hidden="true">⚡</span>
          )}
          {isFusing ? 'FUSING' : 'FUSE'}
        </button>
      </div>

      {/* Status bar */}
      <div
        className={`dyson-fuse-status ${statusClass}`}
        role="status"
        aria-live="polite"
      >
        {statusText}
      </div>

      {/* Model indicator (subtle) */}
      <div
        style={{
          fontSize: '9px',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text-faint, #374151)',
          marginBottom: '6px',
          paddingLeft: '2px',
          opacity: 0.5,
        }}
      >
        {model}{fallbackModel ? ` / ${fallbackModel}` : ''}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FUSE TEXT — builds system prompt and calls LLM
═══════════════════════════════════════════════════════════ */
interface FuseOptions {
  apiBaseUrl?: string;
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  /** Optional secondary API endpoint for cloud fallback */
  fallbackBaseUrl?: string;
  /** Optional secondary API key for cloud fallback */
  fallbackApiKey?: string;
}

async function fuseText(
  text: string,
  activeFrameIds: string[],
  opts: FuseOptions
): Promise<string> {
  const baseUrl = (opts.apiBaseUrl || '').replace(/\/$/, '');
  const apiKey = opts.apiKey || '';
  const primaryModel = opts.model || 'gpt-5.4';
  const fallbackModel = opts.fallbackModel || 'deepseek-4-flash';
  const fallbackBaseUrl = opts.fallbackBaseUrl || '';
  const fallbackApiKey = opts.fallbackApiKey || '';

  // Build combined system prompt
  let systemPrompt: string;
  const key = [...activeFrameIds].sort().join(',');

  if (activeFrameIds.length === 1) {
    systemPrompt = FRAMES[activeFrameIds[0]].systemPrompt;
  } else if (FUSION_FRAMES[key]) {
    systemPrompt = FUSION_FRAMES[key].systemPrompt;
  } else {
    const framePrompts = activeFrameIds
      .map(id => FRAMES[id].systemPrompt)
      .join('\n\n---\n\n');
    systemPrompt = `You are applying a multi-frame fusion transformation. Apply ALL of the following frames sequentially and simultaneously to produce a single output that embodies all active cognitive modulators:\n\n${framePrompts}\n\nOutput only the final transformed text. No explanation. No preamble.`;
  }

  // If no API configured, use local demo transform
  if (!baseUrl || !apiKey) {
    return localDemoTransform(text, activeFrameIds, key);
  }

  // Determine temperature
  // Invention/creative frames: higher temp. Analytical/structured frames: lower temp.
  const creativeFrames = ['phworge', 'omega', 'erkenntnis'];
  const hasCreative = activeFrameIds.some(id => creativeFrames.includes(id));
  const temperature = hasCreative ? 0.7 : 0.3;

  // Try primary model
  try {
    return await callLLM(baseUrl, apiKey, primaryModel, systemPrompt, text, temperature);
  } catch (primaryErr) {
    // Try cloud fallback URL if available
    if (fallbackBaseUrl && fallbackApiKey) {
      console.warn(`Primary endpoint ${baseUrl} failed, falling back to ${fallbackBaseUrl}`, primaryErr);
      try {
        return await callLLM(fallbackBaseUrl, fallbackApiKey, fallbackModel || 'deepseek-chat', systemPrompt, text, temperature);
      } catch (fallbackErr) {
        throw new Error(`Primary (${baseUrl}) and cloud fallback both failed. Last error: ${(fallbackErr as Error).message}`);
      }
    }
    // Try model fallback on same endpoint
    if (fallbackModel && fallbackModel !== primaryModel) {
      console.warn(`Primary model ${primaryModel} failed, falling back to ${fallbackModel} on same endpoint`, primaryErr);
      try {
        return await callLLM(baseUrl, apiKey, fallbackModel, systemPrompt, text, temperature);
      } catch (fallbackErr) {
        throw new Error(`Primary (${primaryModel}) and fallback (${fallbackModel}) both failed. Last error: ${(fallbackErr as Error).message}`);
      }
    }
    throw primaryErr;
  }
}

async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
  temperature: number,
): Promise<string> {
  const endpoint = `${baseUrl}/chat/completions`;
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    max_tokens: 1024,
    temperature,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || userText;
}

/* ═══════════════════════════════════════════════════════════
   LOCAL DEMO TRANSFORM
   Shows transformation character without an LLM call
═══════════════════════════════════════════════════════════ */
function localDemoTransform(
  text: string,
  ids: string[],
  key: string,
): Promise<string> {
  return new Promise(resolve => {
    const delay = 380 + Math.random() * 300;
    setTimeout(() => {
      let result = text;

      if (ids.includes('sigma') && !ids.includes('phworge')) {
        result = result
          .replace(/\b(please|could you|would you|can you|I was wondering if|I think|maybe|perhaps|just|basically|essentially|actually|really|very)\b\s*/gi, '')
          .replace(/\s+/g, ' ').trim();
        if (!result.endsWith('.') && !result.endsWith('?') && !result.endsWith('!')) result += '.';
        result = `[ΣΚΟΠ-COLLAPSED] ${result}`;
      }

      if (ids.includes('ideva') && ids.length === 1) {
        const words = result.split(' ');
        result = words.slice(0, Math.ceil(words.length * 0.6)).join(' ');
        if (!result.endsWith('.')) result += '.';
        result = `[IDEVA-DENSE] ${result}`;
      }

      if (ids.includes('phworge') && ids.length === 1) {
        result = `[ΦΩΡGΕ-INVENTION] ${result}\n\nTension embedded: What new category does solving this open? What assumption, if false, makes this trivially solvable? The landscape is already pointing toward the answer.`;
      }

      if (ids.includes('omega') && ids.length === 1) {
        result = `[ΩMEGA-BRIDGE] ${result}\n\nIsomorphic pattern: This request shares structure with [evolutionary fitness landscape optimization] — the solution space narrows not by addition but by constraint removal.`;
      }

      if (ids.includes('dyson') && ids.length === 1) {
        result = `[DYSON-HARVEST] Before building: audit what already exists. ${result}\n\nUncaptured capacity: What adjacent solved problem can be harvested here at zero cost?`;
      }

      if (ids.length >= 2) {
        const names = ids.map(id => FRAMES[id]?.name).join(' × ');
        const fusion = FUSION_FRAMES[key];
        const label = fusion ? fusion.name : `${names} FUSION`;
        result = `[${label}] ${result}\n\n⚡ Connect your LLM API endpoint for real transformation.`;
      }

      resolve(result);
    }, delay);
  });
}
