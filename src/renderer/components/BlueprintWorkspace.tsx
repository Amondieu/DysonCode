import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useIpc } from '../hooks/useIpc';
import { useBlueprintArbitration } from '../hooks/useBlueprint';
import { type SessionInfo, useAppStore } from '../store/appStore';
import ChatMessage from './ChatMessage';
import ReviewPanel from './ReviewPanel';

interface BlueprintWorkspaceProps {
  activeSession: SessionInfo | null;
  repoPath: string | null;
}

type CanvasMode = 'ask' | 'plan' | 'execute' | 'review' | 'jcode';

// ── ΠΛΟΗΓΟΣ (Navigator) — Priority Matrix ──
interface ActionCandidate {
  id: string;
  label: string;
  impact: number;      // 1-10
  effort: number;       // 1-10 (inverted: 10 = low effort)
  risk: number;         // 1-10 (inverted: 10 = low risk)
  dependency: number;   // 1-10
  learning: number;     // 1-10
}

function computePriorityScore(c: ActionCandidate): number {
  const weights = { impact: 0.35, effort: 0.25, risk: 0.20, dependency: 0.10, learning: 0.10 };
  const raw = c.impact * weights.impact + c.effort * weights.effort + c.risk * weights.risk
    + c.dependency * weights.dependency + c.learning * weights.learning;
  // Small exploration factor to prevent always reinforcing same pattern (±5%)
  const jitter = 1 + (Math.random() - 0.5) * 0.10;
  return Math.round(raw * jitter * 10) / 10;
}

const NAVIGATOR_SYSTEM_PROMPT = [
  'You are ΠΛΟΗΓΟΣ (The Navigator) — a bounded sub-mode within DysonCode Ask.',
  'Your sole function: given the current project state, surface the 3 highest-value next actions.',
  'You do not execute. You do not plan broadly. You read the room and name the move.',
  '',
  '## Five Inner Operations (run in order):',
  '① Manifold Detection: Strip the surface. Which candidates are the same action wearing different clothes? Collapse duplicates.',
  '② Gap Geometry: What dimension is missing from the current candidate set? The absence is the signal.',
  '③ Harvest Audit: What capability already exists but is uncaptured? Do not build what already exists.',
  '④ Field Collapse (ΣΚΟΠ): Which single action, if completed, makes the most other tasks easy or unnecessary?',
  '⑤ Fixpoint Check: If the Navigator\'s own recommendation were fed back as input, does the system remain coherent?',
  '',
  '## Output Format (strict):',
  'For each of exactly 3 candidates, output:',
  '```',
  'CANDIDATE: <name>',
  'IMPACT: <1-10> // business value, user benefit, structural improvement',
  'EFFORT: <1-10>  // 10 = trivial, 1 = massive',
  'RISK: <1-10>    // 10 = near-zero risk, 1 = catastrophic',
  'DEPENDENCY: <1-10> // 10 = unblocks many, 1 = blocked by many',
  'LEARNING: <1-10>   // 10 = teaches something structural',
  'RATIONALE: <1 sentence>',
  '```',
  'Hard ceiling: exactly 3 candidates. No more.',
  'If genuinely ambiguous (scores within 1 point), say so explicitly.',
].join('\n');
const KNOWN_MODELS = [
  'flash-k2', 'deepseek-chat', 'deepseek-reasoner', 'coder',
  'burst', 'mid', 'frontier', 'forge-base',
  'judge', 'micro-coder', 'fast-draft',
];

const ARCHITECT_SYSTEM_PROMPT = [
  'You are the Dyson Architect — ROLLE I. Frame: IDEVA.',
  'You reason forward into possibility space. You own interface specifications.',
  '',
  '## Communication — 9-keyword Assertion Notation',
  'ASSERT [label] [subject verb consequence] — Structural claim.',
  'PATCH [label] — [corrected assumption] — downstream: [single consequence]',
  'DELTA round-N — [list of labels changed]',
  'STATE [section] [content] — Update shared state (LOCKED/IN-PROGRESS/BLOCKED/READY)',
  '',
  '## STATE Obligations',
  '- Write interface specifications to STATE LOCKED before any Builder work.',
  '- Update STATE READY when interface is converged.',
  '- Never read another persona\'s full output — only typed deltas.',
  '',
  '## Constraints',
  'C1: Interface before implementation. Gate work, not availability.',
  'C2: Tier 3 observations are structurally inexpressible. Polish notes only.',
  'C3: No implementation details in your output.',
  'Prefer the smallest reversible slices.',
].join('\n');

const REVIEWER_SYSTEM_PROMPT = [
  'You are the Dyson Reviewer — ROLLE II. Frame: ΣΚΟΠ.',
  'You reason backward from failure modes. You gate all system improvements.',
  '',
  '## Communication — 2 keywords',
  'FAIL [label] — [what breaks] if [condition]. Tier 1 (load-bearing) or Tier 2 (architectural risk) only.',
  'CHECK [label] RESOLVED or CHECK [label] UNRESOLVED — [why insufficient]',
  '',
  '## Triage Filter',
  'Tier 1: Structural failure causing the plan to fail entirely.',
  'Tier 2: Load-bearing gap significantly reducing quality.',
  'Tier 3: Surface improvements — COLLECT SILENTLY. Never enter the loop. Append as polish notes.',
  '',
  '## Forge Review Mode',
  'When reviewing Forge proposals, answer ONE question:',
  'Does this change make deliberation more likely to converge correctly,',
  'or does it optimize a metric correlated with but not identical to quality?',
  'Output: FORGE-APPROVED — [rationale] or FORGE-BLOCKED — [metric-target divergence]',
].join('\n');

// ── Deliberation Loop Prompts (8-keyword Structured Assertion Notation) ──

const DELIB_ARCHITECT_PROMPT = [
  'You are the Dyson Architect in hidden deliberation mode. The user will NOT see your output until convergence.',
  '',
  '## Language: Structured Assertion Notation (5 keywords only)',
  'ASSERT [label] [subject verb consequence] — Structural claim.',
  'PATCH [label] — [corrected assumption] — downstream: [single consequence] — One per FAIL.',
  'DELTA round-N — [list of labels changed] — Open every round after round 1.',
  '',
  '## Rules',
  '- No prose. No sentences outside keywords. No explanations.',
  '- Every ASSERT must be independently verifiable against the Frame Lock.',
  '- PATCH must address exactly one FAIL. No multi-fail patches.',
  '- DELTA must list every label modified since last round.',
  '- After convergence signal, output FINAL_PLAN in prose (this is the only prose you emit).',
].join('\n');

const DELIB_REVIEWER_PROMPT = [
  'You are the Dyson Reviewer in hidden deliberation mode.',
  '',
  '## Language: 2 keywords only',
  'FAIL [label] — [what breaks] if [condition]. Tier 1 (load-bearing) or Tier 2 (architectural risk) only.',
  'CHECK [label] RESOLVED or CHECK [label] UNRESOLVED — [why patch insufficient].',
  '',
  '## Rules',
  '- Tier 3 observations (surface improvements) are structurally inexpressible. Collect silently.',
  '- FAIL must identify a specific, named structural weakness.',
  '- CHECK RESOLVED means the PATCH fully addresses the FAIL. No hedging.',
  '- CHECK UNRESOLVED must state exactly why the PATCH is insufficient.',
  '- When all CHECKs are RESOLVED, output CONVERGED.',
].join('\n');

const DELIB_NAVIGATOR_PROMPT = [
  'You are ΠΛΟΗΓΟΣ inside the deliberation loop. 3 keywords only:',
  'GAP [label] — [dimension absent from frame/plan] — [consequence if unaddressed]',
  'HARVEST [fail-label] — [existing capability] — [how to route instead of rebuild]',
  'REORDER [label] — [current sequence] — [proposed sequence] — [downstream work eliminated]',
  'No prose. No explanations. Emit only when a match is found. Silent otherwise.',
].join('\n');

interface DeliberationState {
  assertions: string[];
  failures: string[];
  patches: string[];
  checks: string[];
  polishNotes: string[];
  rounds: number;
  terminated: boolean;
  terminationReason: string;
}

// ── Convergence checker (Slice 3) ──
function checkConvergence(state: DeliberationState): { converged: boolean; reason: string } {
  const allResolved = state.checks.every(c => /RESOLVED/i.test(c));
  if (allResolved) return { converged: true, reason: 'all CHECKs RESOLVED' };
  if (state.rounds >= 3) return { converged: true, reason: `round cap (${state.rounds}/3)` };
  // Loop detection: same FAIL label in consecutive rounds
  const lastTwoFails = state.failures.slice(-2);
  if (lastTwoFails.length === 2) {
    const l1 = lastTwoFails[0].match(/FAIL\s+(\S+)/i)?.[1];
    const l2 = lastTwoFails[1].match(/FAIL\s+(\S+)/i)?.[1];
    if (l1 && l2 && l1 === l2) return { converged: true, reason: `circular loop: ${l1}` };
  }
  return { converged: false, reason: 'continuing' };
}

// ── Parser: extract assertions from Architect output ──
function parseDelibOutput(raw: string): { asserts: string[]; patches: string[]; deltas: string[] } {
  const asserts: string[] = []; const patches: string[] = []; const deltas: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (t.startsWith('ASSERT ')) asserts.push(t);
    else if (t.startsWith('PATCH ')) patches.push(t);
    else if (t.startsWith('DELTA ')) deltas.push(t);
  }
  return { asserts, patches, deltas };
}

// ── Parser: extract Reviewer output ──
function parseReviewerOutput(raw: string): { fails: string[]; checks: string[]; converged: boolean } {
  const fails: string[] = []; const checks: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (t.startsWith('FAIL ')) fails.push(t);
    else if (t.startsWith('CHECK ')) checks.push(t);
  }
  return { fails, checks, converged: /CONVERGED/i.test(raw) };
}

// ── Frame Lock (Slice 2) — generates 3 locked statements ──
async function runFrameLock(
  ipc: any, sessionTextId: string, model: string, intent: string, repoCtx: string,
): Promise<string> {
  const result = await ipc.agent.execute({
    sessionId: sessionTextId, nodeId: 'delib-framelock',
    prompt: `Express this planning intent as exactly 3 LOCKED statements. Format:\nLOCKED-1: [what is being built]\nLOCKED-2: [what constraint it must satisfy]\nLOCKED-3: [what failure mode it must not produce]\n\nIntent: ${intent}\n\nRepo context: ${repoCtx.slice(0, 1000)}`,
    model, context: 'You are a frame-locking preprocessor. Output ONLY the 3 LOCKED statements. No explanation.',
  });
  return result.content;
}

// ── Ratchet Score gate (Slice 5) ──
function computeRatchetScore(skeleton: string): number {
  let rc = 0;
  if (/ASSERT/i.test(skeleton)) rc++; // RC1: solves active tension
  if (skeleton.split('\n').filter(l => l.trim().startsWith('ASSERT')).length >= 3) rc++; // RC2: reproducible
  if (/PATCH/i.test(skeleton) && /GAP/i.test(skeleton)) rc++; // RC3: expands solution class
  if (/DELTA/i.test(skeleton)) rc++; // RC4: contains teaching mechanism
  if (/CHECK\s+UNRESOLVED/i.test(skeleton) || /circular/i.test(skeleton)) rc++; // RC5: productive contradictions
  if (skeleton.length < 800) rc++; // RC6: compression operator
  rc++; // RC7: substrate-independent (always true for text)
  return Math.min(7, rc);
}

// ── Render final plan (Slice 6) ──
async function renderFinalPlan(
  ipc: any, sessionId: number, sessionTextId: string, model: string,
  state: DeliberationState, frameLock: string, rcScore: number,
): Promise<string> {
  const polish = state.polishNotes.length > 0
    ? `\n\n## Polish Notes (Tier 3)\n${state.polishNotes.map(n => `- ${n}`).join('\n')}`
    : '';
  const openQuestions = state.checks.filter(c => /UNRESOLVED/i.test(c)).length > 0
    ? `\n\n## Open Questions (unresolved at round cap)\n${state.checks.filter(c => /UNRESOLVED/i.test(c)).join('\n')}`
    : '';

  const prompt = [
    'Render the verified deliberation skeleton as a final Dyson Level Blueprint in prose.',
    'This is the ONLY prose you emit. Every structural claim below survived adversarial review.',
    '',
    '## Frame Lock',
    frameLock,
    '',
    '## Verified Assertions',
    state.assertions.join('\n'),
    '',
    '## Resolved Failures',
    state.checks.filter(c => /RESOLVED/i.test(c)).join('\n'),
    '',
    `## Termination: ${state.terminationReason} | Rounds: ${state.rounds} | RC Score: ${rcScore}/7`,
    '',
    '## Output Format',
    'Produce: Objective, Scope, Modules (with dependency chains), Phases, Risks, Validation Plan.',
    `Ratchet Score: ${rcScore}/7.`,
    polish,
    openQuestions,
  ].join('\n');

  const result = await ipc.agent.execute({
    sessionId: sessionTextId, nodeId: 'delib-render',
    prompt, model,
    context: 'You are rendering a verified deliberation skeleton into a final plan. Every ASSERT survived adversarial review. Write with confidence.',
  });
  return result.content;
}

// ── Hidden Deliberation Loop (Slices 1-6 combined) ──
async function runDeliberation(
  ipc: any, sessionId: number, sessionTextId: string,
  intent: string, routedModel: string, repoCtx: string,
  addMessage: (msg: any) => void, setLastError: (err: string | null) => void,
): Promise<string | null> {
  const state: DeliberationState = {
    assertions: [], failures: [], patches: [], checks: [],
    polishNotes: [], rounds: 0, terminated: false, terminationReason: '',
  };

  // ── L6 E1: Purpose Interrogator — pre-frame-lock ──
  let purposeQuestion: string | null = null;
  try {
    const pqResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: 'purpose-interrogator',
      prompt: `Planning intent:\n${intent}\n\nRepo context:\n${repoCtx.slice(0, 800)}\n\nAsk: should this be built?`,
      model: routedModel, context: PURPOSE_INTERROGATOR_PROMPT,
    });
    if (/QUESTION/i.test(pqResult.content)) {
      purposeQuestion = pqResult.content;
      const pqMsg = await ipc.insertMessage(sessionId, 'system', `[❓ PURPOSE]\n${pqResult.content.slice(0, 500)}`);
      addMessage(pqMsg);
    }
  } catch { /* non-blocking */ }

  // ── Slice 2: Frame Lock ──
  const frameLock = await runFrameLock(ipc, sessionTextId, routedModel, intent, repoCtx);

  // ── Navigator Injection Point 1: GAP check before round one ──
  let navigatorOutput = '';
  try {
    const navResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: 'delib-nav-pre',
      prompt: `Frame Lock:\n${frameLock}\n\nPlanning intent:\n${intent}\n\nRepo context:\n${repoCtx.slice(0, 800)}\n\nEmit GAP if a dimension is missing from the locked frame. Silent otherwise.`,
      model: routedModel, context: DELIB_NAVIGATOR_PROMPT,
    });
    navigatorOutput = navResult.content;
  } catch { /* Navigator optional */ }

  // ── Deliberation rounds ──
  let deltaDecl = '';
  let lastAssertions = '';
  let lastPatches = '';

  for (let round = 0; round < 3; round++) {
    state.rounds = round + 1;

    // ── Slice 1+4: Architect with 5-keyword prompt ──
    const archPrompt = [
      frameLock,
      `## Round ${round + 1}/3`,
      deltaDecl,
      round === 0
        ? `Generate ASSERT claims from: ${intent}`
        : `Reviewer FAILs:\n${state.failures.slice(-5).join('\n')}\n\nNavigator input:\n${navigatorOutput}\n\nRespond with PATCH for each FAIL. Then ASSERT any new structure.`,
      navigatorOutput && round === 0 ? `\n## Navigator GAP\n${navigatorOutput}\nAddress or flag as out-of-scope.` : '',
    ].filter(Boolean).join('\n\n');

    const archResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: `delib-arch-r${round}`,
      prompt: archPrompt, model: routedModel,
      context: DELIB_ARCHITECT_PROMPT,
    });

    const { asserts, patches, deltas } = parseDelibOutput(archResult.content);
    state.assertions = [...new Set([...state.assertions, ...asserts])];
    state.patches = [...state.patches, ...patches];

    // ── Slice 4: Delta rule for Reviewer ──
    if (round > 0) {
      deltaDecl = `DELTA round-${round + 1} — ${[...new Set([...asserts.map(a => a.match(/ASSERT\s+(\S+)/i)?.[1]).filter(Boolean), ...patches.map(p => p.match(/PATCH\s+(\S+)/i)?.[1]).filter(Boolean)])].join(', ')}`;
    }

    // ── Navigator Injection Point 2: HARVEST on FAILs ──
    navigatorOutput = '';
    if (state.failures.length > 0) {
      try {
        const navResult = await ipc.agent.execute({
          sessionId: sessionTextId, nodeId: `delib-nav-r${round}`,
          prompt: `Latest FAILs:\n${state.failures.slice(-3).join('\n')}\n\nRepo context:\n${repoCtx.slice(0, 600)}\n\nEmit HARVEST if an existing capability addresses any FAIL. Silent otherwise.`,
          model: routedModel, context: DELIB_NAVIGATOR_PROMPT,
        });
        navigatorOutput = navResult.content;
      } catch { /* Navigator optional */ }
    }

    // ── Slice 1: Reviewer with 2-keyword prompt ──
    const reviewerInput = round === 0
      ? `Frame Lock:\n${frameLock}\n\nArchitect ASSERTs:\n${state.assertions.join('\n')}`
      : `DELTA: ${deltaDecl}\n\nChanged ASSERTs:\n${asserts.join('\n')}\n\nNew PATCHes:\n${patches.join('\n')}\n\nNavigator HARVEST:\n${navigatorOutput || '(none)'}`;

    const revResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: `delib-rev-r${round}`,
      prompt: reviewerInput, model: routedModel,
      context: DELIB_REVIEWER_PROMPT,
    });

    const { fails, checks, converged: revConverged } = parseReviewerOutput(revResult.content);
    state.failures = [...state.failures, ...fails];
    state.checks = [...state.checks, ...checks];

    // Collect tier-3 (Slice 6)
    const tier3Match = revResult.content.match(/Tier\s*3[:\s]*(.+)/gi);
    if (tier3Match) state.polishNotes.push(...tier3Match);

    // ── Slice 3: Convergence check ──
    const { converged, reason } = checkConvergence(state);
    if (converged || revConverged) {
      state.terminated = true;
      state.terminationReason = revConverged ? 'Reviewer CONVERGED' : reason;
      break;
    }

    lastAssertions = state.assertions.join('\n');
    lastPatches = state.patches.join('\n');
  }

  if (!state.terminated) {
    state.terminationReason = `round cap reached (${state.rounds}/3)`;
  }

  // ── Navigator Injection Point 3: Full metacognitive pass after convergence ──
  try {
    const navResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: 'delib-nav-post',
      prompt: `Converged skeleton:\n${state.assertions.join('\n')}\n\nTermination: ${state.terminationReason}\n\nRepo context:\n${repoCtx.slice(0, 600)}\n\nRun full pass: GAP, HARVEST, REORDER. Max 5 lines.`,
      model: routedModel, context: DELIB_NAVIGATOR_PROMPT,
    });
    navigatorOutput = navResult.content;
  } catch { /* Navigator optional */ }

  // ── L5 E7: Multi-Timescale Optimizer — after Navigator ──
  let timescaleOutput = '';
  try {
    const tsResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: 'timescale-optimizer',
      prompt: `Navigator output:\n${navigatorOutput}\n\nScore on tactical/strategic/architectural horizons.`,
      model: routedModel, context: MULTI_TIMESCALE_PROMPT,
    });
    if (/TIMESCALE/i.test(tsResult.content)) {
      timescaleOutput = tsResult.content;
    }
  } catch { /* non-blocking */ }

  // ── Slice 5: Ratchet Score ──
  const rcScore = computeRatchetScore(state.assertions.join('\n') + state.patches.join('\n'));

  // ── Slice 6: Render final plan ──
  const finalPlan = await renderFinalPlan(ipc, sessionId, sessionTextId, routedModel, state, frameLock, rcScore);

  // Post deliberation summary as system message
  const summary = `[🧭 Deliberation complete] Rounds: ${state.rounds} | RC: ${rcScore}/7 | ${state.terminationReason}${navigatorOutput ? ' | Navigator: active' : ''}`;
  const summaryMsg = await (async () => {
    try { return await ipc.insertMessage(sessionId, 'system', summary); } catch { return null; }
  })();
  if (summaryMsg) addMessage(summaryMsg);

  // ── Log deliberation for Forge ──
  logDeliberation({
    timestamp: new Date().toISOString(),
    rounds: state.rounds,
    terminationReason: state.terminationReason,
    assertionCount: state.assertions.length,
    failCount: state.failures.length,
    navigatorHits: (navigatorOutput.match(/HARVEST|GAP|REORDER/gi) || []).length,
    rcScore,
    checkedResolved: state.checks.filter(c => /RESOLVED/i.test(c)).length,
    checkedUnresolved: state.checks.filter(c => /UNRESOLVED/i.test(c)).length,
  });

  // ── Trigger Forge every N deliberations (fire-and-forget) ──
  if (deliberationLog.length >= FORGE_OBSERVATION_N) {
    runForge(ipc, sessionId, sessionTextId, routedModel, addMessage).catch(() => {});
  }

  return finalPlan;
}

// ── ΦΩΡGΕ (The Forge) — Self-Improvement Layer ───────────────────

interface ForgeLogEntry {
  timestamp: string;
  rounds: number;
  terminationReason: string;
  assertionCount: number;
  failCount: number;
  navigatorHits: number;
  rcScore: number;
  checkedResolved: number;
  checkedUnresolved: number;
}

const FORGE_OBSERVATION_N = 5;
const deliberationLog: ForgeLogEntry[] = [];
const blockedProposals: string[] = [];

const FORGE_PROMPT = [
  'You are ΦΩΡGΕ (The Forge) — the system\'s evolutionary pressure. One layer above deliberation.',
  '',
  '## Four Signals',
  '1. CONVERGENCE_VELOCITY: Avg rounds per deliberation. Climbing?',
  '2. ROUND_CAP_FAILURES: Unresolved CHECK categories. Recurring?',
  '3. NAVIGATOR_HARVEST_RATE: HARVEST frequency. Blind spot?',
  '4. OUTCOME_QUALITY: RC scores trend. Improving?',
  '',
  '## Output — 3 FORGE-ASSERTs',
  'FORGE-ASSERT [label] [proposed change]',
  'FORGE-METRIC [metric it optimizes]',
  'FORGE-GUARD [failure mode it prevents]',
  'LEVEL: <1|2|3>',
  'Never Level 3 without exhausting 1 and 2.',
].join('\n');

const FORGE_REVIEWER_PROMPT = [
  'Review the Forge\'s proposal. Single question:',
  'Does this change make deliberation converge correctly,',
  'or does it optimize a metric correlated with but not identical to quality?',
  '',
  'Output: FORGE-APPROVED — [rationale]',
  'or: FORGE-BLOCKED — [metric-target divergence detected]',
].join('\n');

async function runForge(
  ipc: any, sessionId: number, sessionTextId: string, model: string,
  addMessage: (msg: any) => void,
) {
  if (deliberationLog.length < FORGE_OBSERVATION_N) return;

  const recent = deliberationLog.slice(-FORGE_OBSERVATION_N);
  const avgRounds = recent.reduce((s, e) => s + e.rounds, 0) / recent.length;
  const capFailures = recent.filter(e => e.checkedUnresolved > 0);
  const harvestHits = recent.reduce((s, e) => s + e.navigatorHits, 0);
  const avgRC = recent.reduce((s, e) => s + e.rcScore, 0) / recent.length;

  const signals = [
    `CONVERGENCE_VELOCITY: ${avgRounds.toFixed(1)} avg (${recent.map(e => e.rounds).join(',')})`,
    `ROUND_CAP_FAILURES: ${capFailures.length}/${recent.length}`,
    `NAVIGATOR_HARVEST_RATE: ${harvestHits} hits`,
    `OUTCOME_QUALITY: RC ${avgRC.toFixed(1)}/7 (${recent.map(e => e.rcScore).join(',')})`,
    blockedProposals.length > 0 ? `Prior BLOCKED:\n${blockedProposals.slice(-3).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const forgeResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: 'forge-propose',
      prompt: `## Log (last ${FORGE_OBSERVATION_N})\n${signals}\n\nPropose ONE calibration.`,
      model, context: FORGE_PROMPT,
    });

    const reviewResult = await ipc.agent.execute({
      sessionId: sessionTextId, nodeId: 'forge-review',
      prompt: `## Proposal\n${forgeResult.content}\n\nMetric-target divergence?`,
      model, context: FORGE_REVIEWER_PROMPT,
    });

    const approved = /FORGE-APPROVED/i.test(reviewResult.content);
    if (!approved) {
      blockedProposals.push(`BLOCKED: ${reviewResult.content.slice(0, 200)}`);
    }

    const summary = [
      `[🔥 ΦΩΡGΕ] ${approved ? 'APPROVED' : 'BLOCKED'} | RC: ${avgRC.toFixed(1)}/7 | Rounds: ${avgRounds.toFixed(1)}`,
      `Proposal: ${forgeResult.content.slice(0, 400)}`,
      `Review: ${reviewResult.content.slice(0, 200)}`,
    ].join('\n\n');

    const sysMsg = await ipc.insertMessage(sessionId, 'system', summary);
    addMessage(sysMsg);
  } catch {
    deliberationLog.length = 0; // Reset on failure
  }
}

function logDeliberation(entry: ForgeLogEntry) {
  deliberationLog.push(entry);
  if (deliberationLog.length > FORGE_OBSERVATION_N * 3) {
    deliberationLog.splice(0, FORGE_OBSERVATION_N);
  }
}

// ── 5 Persona Execute Pipeline Prompts (from IdevaPersonas.md + DysonAutoCode.md) ──

const PERSONA_PROMPTS: Record<string, (blueprint: string, moduleSpec: string, prevOutput?: string) => string> = {
  architect: (blueprint, moduleSpec) => [
    'You are ROLLE I: The Architect — Geometer des Lösungsraums.',
    'Frame: IDEVA. Your cognitive function: decompose the spec into minimal, dependency-safe node sets.',
    '',
    '## Artefakt-Pflicht',
    'Produce exactly one Interface Contract artifact per module. No free text. No implementation details.',
    '',
    '## Input — BuildManifest',
    blueprint,
    '',
    '## Module Spec',
    moduleSpec,
    '',
    '## Output Format',
    'For each module, output:',
    '- MODULE: <name>',
    '- INTERFACE: <function signatures, types, contracts>',
    '- DEPENDENCIES: <list>',
    '- RISK: <0.0-1.0>',
    '- ESTIMATED_LINES: <number>',
    '',
    'Constraint C1 (Artefakt-Primat): only the structured artifact. No explanation, no commentary.',
  ].join('\n'),

  builder: (blueprint, moduleSpec, prevOutput) => [
    'You are ROLLE III: The Builder — Minimum-Energy-Walker. Frame: IDEVA.',
    '',
    '## Subagent Protocol',
    'STATE IN-PROGRESS builder-subagent-N: implementing <module>',
    'One subagent per module. No overlapping file ownership.',
    '',
    '## Hidden Self-Check — THREE PASSES before emitting',
    'Pass 1: Does implementation satisfy STATE LOCKED interface exactly?',
    'Pass 2: Does implementation introduce surface area outside test plan?',
    `Pass 3: Does implementation violate any Invariant Registry law?\n${INVARIANT_REGISTRY.map((inv, i) => `${i + 1}. ${inv}`).join('\n')}`,
    'All pass → emit DELTA to Critic. Any fail → patch internally.',
    '',
    '## Output Format',
    'DELTA builder-subagent-N — [files changed]',
    '```FILE: <path>',
    '<code content>',
    '```',
    '',
    'Constraints: Kolmogorov-signature only. Smallest change. No placeholders.',
    prevOutput ? `\n## Architect Contract\n${prevOutput}` : '',
  ].join('\n'),

  critic: (blueprint, moduleSpec, prevOutput) => [
    'You are ROLLE IV: The Critic — Der produktive Falsifier. Frame: ΣΚΟΠ.',
    '',
    '## Trigger & Triage',
    'Receive DELTA from Builder. Read ONLY the delta.',
    'Tier 1: FAIL on load-bearing structural failure.',
    'Tier 2: FAIL on architectural risk.',
    'Tier 3: Surface improvements → COLLECT SILENTLY. Append as polish notes.',
    '',
    '## Escalation Rule',
    'FAIL routes to Builder subagent.',
    'Interface specification error (code correct, interface wrong) → single FAIL to Architect.',
    '',
    '## Output',
    'FAIL [label] — [what breaks] if [condition] — Tier [1|2]',
    'STATE BLOCKED <label> (tier 1 Architect escalation)',
    'STATE READY when all issues resolved.',
    'CRITIC PASS if no tier 1/2 issues.',
    prevOutput ? `\n## Builder DELTA\n${prevOutput}` : '',
  ].join('\n'),

  tester: (blueprint, moduleSpec, prevOutput) => [
    'You are ROLLE IV: The Tester — Eigenvektor-Verifizierer. Frame: ΦΩΡGΕ.',
    '',
    '## Three-Verdict System (not binary)',
    'PASS: All checks pass. Update STATE READY.',
    'BLOCKED: Genuine behavioral gap. CONFIRM with Critic it is tier 1/2 before emitting.',
    '        Tier 3 issues → reclassify as NEEDS-CALIBRATION.',
    'NEEDS-CALIBRATION: Builder self-check failed to catch something.',
    '        Route to Builder self-check as calibration signal — NOT to Architect.',
    '        Module re-implemented with updated self-check. Full chain does not reblock.',
    '',
    '## Output Format',
    'VERDICT: PASS | BLOCKED | NEEDS-CALIBRATION',
    'TEST_PLAN: (if applicable)',
    'EDGE_CASES: (if applicable)',
    'SCORE: 0.0-1.0',
    'STATE READY <module> (on PASS)',
    'STATE BLOCKED <module> — <reason> (on BLOCKED, after Critic confirmation)',
    prevOutput ? `\n## Code Under Review\n${prevOutput}` : '',
  ].join('\n'),

  memoryKeeper: (blueprint, moduleSpec, prevOutput) => [
    'You are ROLLE V: The Memory Keeper — Kompressionsoperator. Frame: Ω1.',
    '',
    '## Function — Forge Data Feed',
    'You are NOT a prose summarizer. You are a compressed signal feed for ΦΩΡGΕ.',
    'Fire after convergence: STATE shows all IN-PROGRESS → READY, no BLOCKED remaining.',
    '',
    '## Output Format — Four ASSERTs Only',
    'ASSERT converged: [what converged this session]',
    'ASSERT resolved: [what was blocked and resolved]',
    'ASSERT open: [what remains blocked]',
    'ASSERT pattern: [what recurred from previous convergence]',
    '',
    'No prose. No commentary. No recommendations. Four ASSERTs. Maximum 200 tokens.',
    '',
    '## Model',
    'DeepSeek Flash 4 (deepseek-chat) cloud. fast-draft local. K3 compression.',
    `\n## Session Context\nBlueprint: ${blueprint.slice(0, 300)}\nModule: ${moduleSpec}`,
  ].join('\n'),
};

// ── Invariant Registry (Surface 1) — architectural laws ──────────
const INVARIANT_REGISTRY: string[] = [
  'ASSERT auth: no endpoint publicly accessible without authentication',
  'ASSERT audit: no user data written without audit log entry',
  'ASSERT timeout: no external API call made without a timeout',
  'ASSERT rollback: every file write creates a reversible change',
];

const INVARIANT_REGISTRY_PROMPT = [
  '## Invariant Registry — Structural Laws (read before self-check)',
  'These invariants must hold for EVERY implementation. Violation = tier 1 failure.',
  INVARIANT_REGISTRY.map((inv, i) => `${i + 1}. ${inv}`).join('\n'),
  '',
  '## Builder Third Pass (after existing two passes)',
  'Pass 3: Does this implementation violate any registered invariant?',
  'If yes → tier 1 failure. Fix before Critic sees the code.',
].join('\n');

// ── Semantics Sentinel (Surface 2) — DRIFT detection ─────────────
const SEMANTICS_SENTINEL_PROMPT = [
  'You are the Semantics Sentinel. Post-DELTA check only.',
  'Single question: does the NAME, documentation, and test description',
  'of this function still accurately describe what it ACTUALLY does?',
  '',
  'If not, emit: DRIFT [function] — [name says X] — [actually does Y]',
  'Route to Architect as naming/contract correction before READY.',
  'If aligned, emit: DRIFT-CLEAR',
  'Max 30 tokens. No prose.',
].join('\n');

// ── Coverage Cartographer (Surface 3) — COVERAGE signal ──────────
const COVERAGE_CARTOGRAPHER_PROMPT = [
  'You are the Coverage Cartographer. Post-Tester pass only.',
  'Map the uncovered surface. Classify each gap:',
  'LOAD-BEARING: uncovered branch that would cause production failure if broken',
  'NON-LOAD-BEARING: edge case, genuinely not needing a test',
  '',
  'Output: COVERAGE LOAD-BEARING [path:line] — [what it guards against]',
  'or: COVERAGE NON-LOAD-BEARING [path:line] — [why safe to skip]',
  'Load-bearing gaps → mandatory test additions before READY.',
  'Non-load-bearing → logged as coverage debt register, not blocking.',
].join('\n');

// ── Confidence Annotator (Surface 4) ─────────────────────────────
const CONFIDENCE_ANNOTATOR_PROMPT = [
  'You are the Confidence Annotator. Post-process every persona output.',
  'Do not change content. Add one annotation per emitted item:',
  'CONFIDENCE [1-5] — [rationale in 5 words]',
  '',
  'Derived from three signals:',
  '1. Similar pattern success rate in prior convergences',
  '2. Memory Keeper record shows recurring failures of this type?',
  '3. Navigator HARVEST found existing solution or novel problem?',
  '',
  'Score ≥ 4: proceed immediately.',
  'Score ≤ 2: trigger one additional Reviewer pass before STATE update.',
  'Max 15 tokens per annotation.',
].join('\n');

// ── Topology Warden (Surface 5) — TOPOLOGY signal ────────────────
const TOPOLOGY_WARDEN_PROMPT = [
  'You are the Topology Warden. Run after 5th convergence alongside Forge.',
  'Read the import graph. Compute three metrics:',
  '1. CYCLE_COUNT: number of circular dependencies',
  '2. MAX_DEPTH: deepest import chain (files)',
  '3. COUPLING: modules that should not know about each other but now import',
  '',
  'Compare to previous snapshot. If any metric increased:',
  'TOPOLOGY [metric] — [before → after] — [specific new coupling causing increase]',
  'Feeds Navigator GAP signal for next planning cycle.',
  'If stable: TOPOLOGY-STABLE',
].join('\n');

// ── Performance Sentinel (Surface 6) — COMPLEXITY signal ─────────
const PERFORMANCE_SENTINEL_PROMPT = [
  'You are the Performance Sentinel. Run on every module reaching READY.',
  'Complexity analysis only — no benchmarks.',
  'Check for:',
  '1. Nested loops over collections → O(n²) risk',
  '2. Recursive calls without memoization → exponential risk',
  '3. Repeated lookups inside iteration → O(n²) database risk',
  '',
  'If pattern found: COMPLEXITY [pattern] — [theoretical cost class] — [justified?]',
  'Architect decides: justified by problem, or more efficient path exists.',
  'If none found: COMPLEXITY-CLEAR',
  'Max 40 tokens.',
].join('\n');

// ── Reversibility Scorer (Surface 7) — Navigator extension ───────
const REVERSIBILITY_SCORER_PROMPT = [
  'You are the Reversibility Scorer. Navigator injection point 3 extension.',
  'Score each candidate action on ROLLBACK_COST [1-10]:',
  '1-3: cheap to reverse (rename, add field, new function)',
  '4-6: moderate (schema change, API deprecation)',
  '7-10: expensive (data migration, public API, cache strategy)',
  '',
  'Low rollback cost → proceed at medium confidence.',
  'High rollback cost → require high confidence + Reviewer explicit confirmation.',
  'Add ROLLBACK-COST [1-10] after each REORDER signal.',
  'Max 20 tokens per candidate.',
].join('\n');

// ── Knowledge Crystallizer (Surface 8) ───────────────────────────
const knowledgePatterns: string[] = [];
const KNOWLEDGE_CRYSTALLIZER_PROMPT = [
  'You are the Knowledge Crystallizer. Run after 10th convergence.',
  'Read last 10 Memory Keeper signal records.',
  'Extract patterns appearing 3+ times:',
  '',
  'CRYSTALLIZE [pattern] — [description] — [suggested invariant or prompt calibration]',
  '',
  'New invariants → add to INVARIANT_REGISTRY.',
  'Prompt calibrations → add as example to relevant persona prompt.',
  'Max 3 patterns per cycle. No prose.',
].join('\n');

// ── L5 Emergence Surfaces — Prospective Intelligence ─────────────

// E1: Trajectory Modeler — predicts structural attractors
const TRAJECTORY_MODELER_PROMPT = [
  'You are the Trajectory Modeler. Run after 10th convergence.',
  'Read last 10 convergence histories. Single question:',
  'If current rate and direction of change continues for 20 more modules,',
  'what does the architecture look like?',
  '',
  'Predict structural attractors — abstractions being independently reinvented,',
  'coupling clusters growing toward natural boundaries, fastest-multiplying categories.',
  '',
  'Output: TRAJECTORY [assertion] — [evidence: 3 data points]',
  'If no clear trajectory: TRAJECTORY-UNDETERMINED',
  'Routes to Architect as directional constraint question: intentional?',
  'Max 80 tokens.',
].join('\n');

// E2: Contradiction Engine — promotes blocked proposals to abstractions
const CONTRADICTION_ENGINE_PROMPT = [
  'You are the Contradiction Engine. Run after 5th FORGE-BLOCKED.',
  'Collect recurring contradiction types from:',
  '- FORGE-BLOCKED proposals',
  '- Tier 1 Critic FAILs requiring Architect interface correction',
  '- Navigator GAP findings on locked frame dimensions',
  '',
  'After 5 instances of same type, ask:',
  'Is this recurring contradiction pointing at a MISSING ABSTRACTION?',
  '',
  'If yes: MISSING-ABSTRACTION [name] — [what 5 instances share] — [what category this opens]',
  'Routes to Navigator Priority Matrix as naming task (not implementation).',
  'Max 60 tokens.',
].join('\n');

// E3: Simulation Layer — sandboxed deliberation on hypotheticals
const SIMULATION_LAYER_PROMPT = [
  'You are the Simulation Layer. Run on proposed architectural changes BEFORE implementation.',
  'Given a hypothetical interface/plan, simulate consequences WITHOUT implementing anything.',
  '',
  'Questions:',
  '1. How many downstream modules would be affected?',
  '2. What FAILs would the Critic likely raise?',
  '3. What HARVEST opportunities would the Navigator likely find?',
  '4. What new invariants would need registering?',
  '',
  'Output: SIMULATE [affected-modules] — [top 3 failure modes] — [estimated convergence cost 1-10]',
  'No code. Risk profile only. Max 100 tokens.',
].join('\n');

// E4: Perimeter Sentinel — cross-boundary monitoring
const PERIMETER_SENTINEL_PROMPT = [
  'You are the Perimeter Sentinel. Monitor three external boundaries:',
  '',
  '1. DEPENDENCY-DRIFT: Have external API contracts changed in ways making existing code incorrect?',
  '2. DOCUMENTATION-DRIFT: Does public API documentation still match current behavior?',
  '3. SECURITY-SURFACE: New endpoints, data flows, auth boundaries without registered invariants?',
  '',
  'Output: PERIMETER [type] — [what changed] — [affected modules]',
  'Routes to Architect as planning candidate.',
  'Max 50 tokens.',
].join('\n');

// E5: Intent Preservation — WHY records
const INTENT_PRESERVATION_PROMPT = [
  'You are the Intent Crystallizer. Run after each module reaches READY.',
  'Read the full ASSERT-FAIL-PATCH log for this module.',
  'Extract the single most important decision: where Architect chose X over Y and the reason mattered.',
  '',
  'Output: WHY [module] — [decision] — [reason] — [expires: never | condition]',
  'Write as structured annotation alongside implementation.',
  'Future Navigator HARVEST reads WHY to determine if reasons still apply.',
  'Max 40 tokens.',
].join('\n');

// E6: Adversarial Fuzzer — semantic boundary testing
const ADVERSARIAL_FUZZER_PROMPT = [
  'You are the Adversarial Fuzzer. Run after module reaches READY.',
  'Generate semantically adversarial inputs — designed to find boundaries.',
  '',
  'Questions:',
  '1. Most surprising VALID input this interface could receive? Response?',
  '2. Least surprising INVALID input? Error handling?',
  '3. Exact boundary between valid and invalid?',
  '',
  'Output: FUZZ [boundary-type] — [input] — [expected vs actual behavior]',
  'Routes to Coverage Cartographer as load-bearing coverage gaps.',
  'Does not write tests. Finds edges geometric analysis would miss.',
  'Max 60 tokens.',
].join('\n');

// E7: Multi-Timescale Optimizer — three time horizons
const MULTI_TIMESCALE_PROMPT = [
  'You are the Multi-Timescale Optimizer. Navigator extension.',
  'Score each candidate on THREE time horizons:',
  '',
  'TACTICAL (current sprint): existing Priority Matrix weight',
  'STRATEGIC (10 sprints): which action expands solution space most for future cycles?',
  'ARCHITECTURAL (final form): which action moves toward Architect-confirmed trajectory?',
  '',
  'Output per candidate:',
  'TIMESCALE-TACTICAL [score] | TIMESCALE-STRATEGIC [score] | TIMESCALE-ARCHITECTURAL [score]',
  'Architect sees all three, decides which horizon current moment calls for.',
  'Max 30 tokens per candidate.',
].join('\n');

// E8: Collective Intelligence — cross-repository learning
const COLLECTIVE_INTELLIGENCE_PROMPT = [
  'You are the Cross-Instance Learning layer. Activated with consent only.',
  'Compare Knowledge Crystallizer outputs and Invariant Registry entries across repositories.',
  'Do not merge automatically. Compare.',
  '',
  'When pattern appearing 3+ times in repo A appears first time in repo B:',
  'Output: CROSS-INSTANCE [pattern] — [source repo: occurrences] — [target repo: first occurrence]',
  'Forge proposes adopting already-crystallized knowledge.',
  'Discovers which architectural laws are universal vs domain-specific.',
  'Max 50 tokens.',
].join('\n');

// ── L6 Epistemic Architecture — Purpose Interrogator ─────────────
const PURPOSE_INTERROGATOR_PROMPT = [
  'You are the Purpose Interrogator. Run BEFORE the frame is locked.',
  'Single structural question: should this be built at all?',
  '',
  'Three conditions:',
  '1. PROBLEM-EXISTS: Does this solve a problem in actual user behavior, or an imagined one?',
  '2. COMPLEXITY-NET: Does building this create more complexity than it eliminates?',
  '3. NON-CODE-SOLUTION: Is there a process change, doc clarification, or constraint removal that achieves the same outcome?',
  '',
  'If any condition fails: QUESTION [condition] — [specific concern] — [what to check before proceeding]',
  'Architect can override with single ASSERT. The question was asked.',
  'If all pass: QUESTION-CLEAR',
  'QUESTION log reveals which categories consistently fail. System learns to front-load.',
  'Max 60 tokens.',
].join('\n');

// ── Navigator output parser ─────────────────────────────────────
function parseNavigatorOutput(raw: string): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const blocks = raw.split(/CANDIDATE:/i).filter(Boolean);
  for (const block of blocks.slice(0, 3)) {
    const label = (block.match(/^(.+)/) || [])[1]?.trim() || 'Unknown';
    const impact = parseInt((block.match(/IMPACT:\s*(\d+)/i) || [])[1] || '5');
    const effort = parseInt((block.match(/EFFORT:\s*(\d+)/i) || [])[1] || '5');
    const risk = parseInt((block.match(/RISK:\s*(\d+)/i) || [])[1] || '5');
    const dependency = parseInt((block.match(/DEPENDENCY:\s*(\d+)/i) || [])[1] || '5');
    const learning = parseInt((block.match(/LEARNING:\s*(\d+)/i) || [])[1] || '5');
    candidates.push({
      id: `nav-${candidates.length}`, label,
      impact: Math.max(1, Math.min(10, impact)),
      effort: Math.max(1, Math.min(10, effort)),
      risk: Math.max(1, Math.min(10, risk)),
      dependency: Math.max(1, Math.min(10, dependency)),
      learning: Math.max(1, Math.min(10, learning)),
    });
  }
  return candidates;
}

// ── Blueprint markdown → MODULE spec parser ──────────────────────
function parseBlueprintToModuleSpec(blueprint: string): string {
  const lines: string[] = [];
  const moduleSection = blueprint.match(/##\s*Modules?\s*\n([\s\S]*?)(?=\n##|$)/i);
  const extractModules = (text: string) => {
    const moduleLines = text.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().match(/^\d+[\.\)]/));
    for (const line of moduleLines) {
      const cleaned = line.replace(/^[\s\-*\d\.\)]+/, '').trim();
      if (!cleaned) continue;
      const depMatch = cleaned.match(/^(.+?)\s+depends?\s*:\s*(.+)$/i);
      if (depMatch) {
        lines.push(`MODULE: ${depMatch[1].trim()} depends: ${depMatch[2].trim()}`);
      } else {
        lines.push(`MODULE: ${cleaned}`);
      }
    }
  };
  if (moduleSection) extractModules(moduleSection[1]);
  if (lines.length === 0) {
    const firstLine = blueprint.split('\n')[0].replace(/^#+\s*/, '').trim();
    if (firstLine) lines.push(`MODULE: ${firstLine}`);
  }
  return lines.length > 0 ? lines.join('\n') : `MODULE: blueprint`;
}

// ── Harness Scoring ───────────────────────────────────────────────
interface HarnessResult { score: number; badges: { rc: number; met: boolean }[]; ready: boolean }
function computeHarnessScore(blueprint: string, moduleSpec: string): HarnessResult {
  const hasIntent = blueprint.length > 20;
  const hasModules = moduleSpec.split('\n').filter((l) => l.trim()).length >= 1;
  const hasDeps = moduleSpec.includes('depends:');
  const hasConstraints = blueprint.toLowerCase().includes('constraint') || blueprint.includes('## Constraints');
  const hasRisks = blueprint.toLowerCase().includes('risk') || blueprint.includes('## Risk');
  const hasValidation = blueprint.toLowerCase().includes('validation') || blueprint.includes('## Validation');
  const hasPhases = blueprint.toLowerCase().includes('phase') || blueprint.includes('## Execution');

  const badges = [
    { rc: 1, met: hasIntent },
    { rc: 2, met: hasModules },
    { rc: 3, met: hasDeps },
    { rc: 4, met: hasConstraints },
    { rc: 5, met: hasRisks },
    { rc: 6, met: hasValidation },
    { rc: 7, met: hasPhases },
  ];
  const met = badges.filter((b) => b.met).length;
  const score = Math.round((met / 7) * 10 * 10) / 10;
  return { score, badges, ready: score >= 7 };
}

export default function BlueprintWorkspace({ activeSession, repoPath }: BlueprintWorkspaceProps) {
  const ipc = useIpc();
  const {
    activeSessionId, messages, sessions,
    setActiveSession, setMessages, setSessions, addMessage,
    setMissionControlSpec, setActivePanel,
  } = useAppStore();
  const { run: runArbitration } = useBlueprintArbitration();

  const [mode, setMode] = useState<CanvasMode>('plan');
  const [planningIntent, setPlanningIntent] = useState('Design the next DysonCode slice before execution.');
  const [constraints, setConstraints] = useState('Prioritize readability, smallest safe slices, and explicit validation.');
  const [routingMode, setRoutingMode] = useState<'local' | 'cloud' | 'hybrid'>('hybrid');
  const [routingVariant, setRoutingVariant] = useState<'v1' | 'v2'>(
    (typeof localStorage !== 'undefined' && (localStorage.getItem('kore-routing-variant') as 'v1' | 'v2')) || 'v1',
  );
  const [architectModel, setArchitectModel] = useState('flash-k2');
  const [reviewerModel, setReviewerModel] = useState('flash-k2');
  const [enableReviewer, setEnableReviewer] = useState(true);
  const [blueprintDraft, setBlueprintDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [execStatus, setExecStatus] = useState('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [planChatDraft, setPlanChatDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [bpView, setBpView] = useState<'plan' | 'overview'>('plan');

  // ── State Machine: idle → planning → refine → execute → solve ──
  const [execState, setExecState] = useState<'idle' | 'planning' | 'refine' | 'execute' | 'solve'>('idle');
  const [execRC, setExecRC] = useState(0);
  const [executionIssues, setExecutionIssues] = useState<string[]>([]);
  const EXEC_THRESHOLD = 4;

  const RC_CONDITIONS = [
    { rc: 1, label: 'Solves active tension', gap: 'Plan does not address a real, named problem' },
    { rc: 2, label: 'Near-zero reproduction cost', gap: 'Plan requires significant manual setup to reuse' },
    { rc: 3, label: 'Expands solution space', gap: 'Plan solves within current category only — no new capability class' },
    { rc: 4, label: 'Teaches its own method', gap: 'Assertions do not explain the reasoning — future sessions cannot learn' },
    { rc: 5, label: 'Generates productive contradictions', gap: 'No adversarial tension captured — Critic had nothing to push against' },
    { rc: 6, label: 'Embeds compression operator', gap: 'Plan grows linearly with complexity — no compression of problem space' },
    { rc: 7, label: 'Substrate-independent', gap: 'Plan is tied to specific tooling, framework, or language' },
  ];

  const [intentFuse, setIntentFuse] = useState(false);
  const [activeFrames, setActiveFrames] = useState<string[]>(['ΣΚΟΠ', 'IDEVA']);
  const [transformedIntent, setTransformedIntent] = useState('');
  const [floatCollapsed, setFloatCollapsed] = useState(false);
  const [floatPos, setFloatPos] = useState({ x: 16, y: 60 });
  const [floatSize, setFloatSize] = useState({ width: 300, height: 420 });
  const [bpWidth, setBpWidth] = useState(380);

  // ── Navigator state ──
  const [navigatorActive, setNavigatorActive] = useState(false);
  const [navigatorResult, setNavigatorResult] = useState<{ candidates: ActionCandidate[]; rawOutput: string } | null>(null);
  const [navigatorLoading, setNavigatorLoading] = useState(false);
  const [repoContext, setRepoContext] = useState('');
  const [dysonContext, setDysonContext] = useState('');
  const [reviewerPersona, setReviewerPersona] = useState('');
  const [builderPersona, setBuilderPersona] = useState('');
  const [criticPersona, setCriticPersona] = useState('');
  const [contextLoaded, setContextLoaded] = useState(false);

  // Float window drag state
  const draggingFloat = useRef(false);
  const floatDragOffset = useRef({ x: 0, y: 0 });

  const planChatInputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Load repo context on mount ─────────────────────────────────
  useEffect(() => {
    if (!repoPath || contextLoaded) return;
    Promise.all([
      ipc.getRepoContext(repoPath).then((ctx) => {
        if (ctx?.summary) setRepoContext(ctx.summary);
        if (ctx?.reviewerPersona) setReviewerPersona(ctx.reviewerPersona);
        if (ctx?.builderPersona) setBuilderPersona(ctx.builderPersona);
        if (ctx?.criticPersona) setCriticPersona(ctx.criticPersona);
      }),
      ipc.getDysonIntelligence().then((intel) => {
        if (intel?.summary) setDysonContext(`## DysonSphere Knowledge\n${intel.summary}`);
      }),
    ]).catch(() => {}).finally(() => setContextLoaded(true));
  }, [repoPath]);

  const refreshContext = async () => {
    if (!repoPath) return;
    setContextLoaded(false);
    try {
      const ctx = await ipc.refreshRepoContext(repoPath);
      if (ctx?.summary) setRepoContext(ctx.summary);
    } finally { setContextLoaded(true); }
  };

  const planningMessages = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system'),
    [messages],
  );

  const moduleSpec = useMemo(() => parseBlueprintToModuleSpec(blueprintDraft), [blueprintDraft]);
  const harness = useMemo(() => computeHarnessScore(blueprintDraft, moduleSpec), [blueprintDraft, moduleSpec]);

  // ── Float window drag ──────────────────────────────────────────
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!draggingFloat.current) return;
      setFloatPos({ x: e.clientX - floatDragOffset.current.x, y: e.clientY - floatDragOffset.current.y });
    };
    const up = () => { draggingFloat.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const startFloatDrag = (e: React.MouseEvent) => {
    draggingFloat.current = true;
    floatDragOffset.current = { x: e.clientX - floatPos.x, y: e.clientY - floatPos.y };
  };

  // Float resize
  const draggingResize = useRef(false);
  const startFloatResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingResize.current = true;
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!draggingResize.current) return;
      setFloatSize((prev) => ({
        width: Math.max(240, prev.width + e.movementX),
        height: Math.max(280, prev.height + e.movementY),
      }));
    };
    const up = () => { draggingResize.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  // ── Auto-resize textarea ───────────────────────────────────────
  useEffect(() => {
    const ta = planChatInputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  }, [planChatDraft]);

  // ── Auto-scroll messages ───────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const ensureSession = async () => {
    if (activeSessionId && activeSession) {
      return { sessionId: activeSessionId, sessionTextId: activeSession.text_id ?? String(activeSessionId) };
    }
    const session = await ipc.createSession('Blueprint Session', repoPath ?? undefined);
    setSessions([session, ...sessions]);
    setActiveSession(session.id);
    setMessages([]);
    return { sessionId: session.id, sessionTextId: session.text_id ?? String(session.id) };
  };

  const buildContext = () => {
    const parts = [
      ARCHITECT_SYSTEM_PROMPT,
      repoPath ? `Repository: ${repoPath}` : '',
      repoContext ? `\n## Repository Context (harvested from workspace)\n${repoContext}` : '',
      dysonContext ? `\n${dysonContext}` : '',
      intentFuse && transformedIntent ? `\n## Intent (transformed through ${activeFrames.join(' + ')})\n${transformedIntent}` : `Planning intent: ${planningIntent}`,
      `Constraints: ${constraints}`,
      mode === 'plan' ? 'Work WITH the reviewer — produce modules with explicit dependency chains.' : '',
    ];
    return parts.filter(Boolean).join('\n\n');
  };

  // ── Chat send ──────────────────────────────────────────────────
  const sendPlanChat = async () => {
    const text = planChatDraft.trim();
    if (!text) return;

    // ── Execute mode "go" trigger ──
    const goTriggers = /^(go|execute|run|start|do it|fire|launch|🚀)/i;
    if (mode === 'execute' && goTriggers.test(text)) {
      setPlanChatDraft('');
      if (!blueprintDraft) {
        setLastError('No blueprint to execute. Switch to Plan mode first to create one.');
        return;
      }
      setBusy(true);
      setLastError(null);
      try {
        const { sessionId } = await ensureSession();
        const userMessage = await ipc.insertMessage(sessionId, 'user', text);
        addMessage(userMessage);
        const sysMsg = await ipc.insertMessage(sessionId, 'system', '[execute] Running blueprint plan...');
        addMessage(sysMsg);
        await executeBlueprintPlan(blueprintDraft);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastError(msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    setPlanChatDraft('');
    setBusy(true);
    setLastError(null);
    try {
      const { sessionId, sessionTextId } = await ensureSession();
      const userMessage = await ipc.insertMessage(sessionId, 'user', text);
      addMessage(userMessage);

      const routedModel = routingMode === 'hybrid' ? architectModel : `${routingMode}:${architectModel}`;

      // ── Plan mode: Hidden Deliberation Loop (Slices 1-6) ──
      if (enableReviewer && mode === 'plan') {
        setExecState('planning');
        const sysMsg = await ipc.insertMessage(sessionId, 'system', '[deliberation] Starting hidden deliberation loop...');
        addMessage(sysMsg);

        const finalPlan = await runDeliberation(
          ipc, sessionId, sessionTextId, text, routedModel,
          [repoPath ? `Repo: ${repoPath}` : '', repoContext].filter(Boolean).join('\n'),
          addMessage, setLastError,
        );

        if (finalPlan) {
          setBlueprintDraft(finalPlan);
          // Compute RC score from deliberation output
          const rc = computeRatchetScore(finalPlan);
          setExecRC(rc);
          setExecState(rc >= EXEC_THRESHOLD ? 'execute' : 'refine');
          const planMsg = await ipc.insertMessage(sessionId, 'assistant', `[architect:${architectModel} — verified plan | RC ${rc}/7]\n${finalPlan}`);
          addMessage(planMsg);
        }
      } else {
        // ── Non-plan modes: single-pass Architect ──
        const archResult = await ipc.agent.execute({
          sessionId: sessionTextId, nodeId: 'blueprint-architect', prompt: text,
          model: routedModel, context: buildContext(),
        });
        const archMsg = await ipc.insertMessage(sessionId, 'assistant', `[architect:${architectModel}]\n${archResult.content}`);
        addMessage(archMsg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      const errMsg = await (async () => {
        try {
          const { sessionId } = await ensureSession();
          return await ipc.insertMessage(sessionId, 'system', `[error] ${msg}`);
        } catch { return null; }
      })();
      if (errMsg) addMessage(errMsg);
    } finally {
      setBusy(false);
    }
  };

  // ── Synthesize ─────────────────────────────────────────────────
  const synthesizeBlueprint = async () => {
    setBusy(true);
    setLastError(null);
    try {
      const { sessionId, sessionTextId } = await ensureSession();
      const result = await ipc.agent.execute({
        sessionId: sessionTextId, nodeId: 'blueprint-synthesis',
        prompt: 'Synthesize the planning discussion into a Dyson Level Blueprint with: Objective, Scope, Modules (with dependency chains), Execution Phases, Risks, Validation Plan.',
        model: routingMode === 'hybrid' ? architectModel : `${routingMode}:${architectModel}`,
        context: [ARCHITECT_SYSTEM_PROMPT, buildContext()].join('\n\n'),
      });
      setBlueprintDraft(result.content);
      const msg = await ipc.insertMessage(sessionId, 'assistant', `[blueprint]\n${result.content}`);
      addMessage(msg);
      if (autoExecute) await executeBlueprintPlan(result.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
    } finally { setBusy(false); }
  };

  // ── Parallel Module Pipeline — Builder+Critic+Tester subagents per module ──
  const executeBlueprintPlan = async (blueprint?: string) => {
    const plan = blueprint || blueprintDraft;
    if (!plan) return;
    setExecState('execute');
    setLastError(null);
    const spec = parseBlueprintToModuleSpec(plan);
    setMissionControlSpec(spec);
    setBusy(true);

    const { sessionId, sessionTextId } = await ensureSession();
    const routedModel = routingMode === 'hybrid' ? architectModel : `${routingMode}:${architectModel}`;

    // Insert blueprint as context
    const bpMsg = await ipc.insertMessage(sessionId, 'system', `[blueprint]\n${plan.slice(0, 2000)}`);
    addMessage(bpMsg);

    // Parse modules from spec
    const moduleLines = spec.split('\n').filter(l => l.trim() && l.includes('MODULE:'));
    const modules = moduleLines.map((line) => {
      const name = (line.match(/MODULE:\s*(.+?)(\s+depends?:|$)/i) || [])[1]?.trim() || line;
      const deps = (line.match(/depends?:\s*(.+)$/i) || [])[1]?.trim() || '';
      return { name, deps };
    });

    if (modules.length === 0) {
      setLastError('No modules found in blueprint. Use Plan mode to generate one first.');
      setBusy(false);
      return;
    }

    try {
      // ── Phase 1: Architect runs once — writes interfaces to STATE LOCKED ──
      setExecStatus('🏛️ Architect — generating interface contracts...');
      const archPrompt = PERSONA_PROMPTS.architect(plan, spec, '');
      const archSysMsg = await ipc.insertMessage(sessionId, 'system', '[execute] 🏛️ Architect — interface contracts');
      addMessage(archSysMsg);

      const archResult = await ipc.agent.execute({
        sessionId: sessionTextId, nodeId: 'pipeline-architect',
        prompt: archPrompt, model: routedModel, context: buildContext(),
      });

      const archContracts = archResult.content;
      const archMsg = await ipc.insertMessage(sessionId, 'assistant', `[🏛️ Architect — STATE LOCKED]\n${archContracts.slice(0, 3000)}`);
      addMessage(archMsg);

      // ── Phase 2: Parallel subagents — one Builder+Critic+Tester chain per module ──
      setExecStatus(`⚡ Parallel execution — ${modules.length} modules`);
      const moduleResults = await Promise.all(
        modules.map(async (mod, i) => {
          const subagentId = `builder-subagent-${i + 1}`;
          const modSpec = `MODULE: ${mod.name}${mod.deps ? ` depends: ${mod.deps}` : ''}`;

          // Builder
          const bPrompt = PERSONA_PROMPTS.builder(plan, modSpec, archContracts);
          const bSysMsg = await ipc.insertMessage(sessionId, 'system', `[execute] 🔨 ${subagentId} — implementing ${mod.name}`);
          addMessage(bSysMsg);

          const bResult = await ipc.agent.execute({
            sessionId: sessionTextId, nodeId: `${subagentId}-build`,
            prompt: bPrompt, model: routedModel, context: buildContext(),
          });

          const bMsg = await ipc.insertMessage(sessionId, 'assistant', `[🔨 ${subagentId} — ${mod.name}]\n${bResult.content.slice(0, 2500)}`);
          addMessage(bMsg);

          // Critic
          const cPrompt = PERSONA_PROMPTS.critic(plan, modSpec, bResult.content);
          const cSysMsg = await ipc.insertMessage(sessionId, 'system', `[execute] ⚔️ ${subagentId} — reviewing ${mod.name}`);
          addMessage(cSysMsg);

          const cResult = await ipc.agent.execute({
            sessionId: sessionTextId, nodeId: `${subagentId}-critic`,
            prompt: cPrompt, model: routedModel, context: buildContext(),
          });

          const cMsg = await ipc.insertMessage(sessionId, 'assistant', `[⚔️ ${subagentId} — ${mod.name}]\n${cResult.content.slice(0, 2000)}`);
          addMessage(cMsg);

          // Tester (unit tests only — integration gated below)
          const tPrompt = PERSONA_PROMPTS.tester(plan, modSpec, bResult.content);
          const tSysMsg = await ipc.insertMessage(sessionId, 'system', `[execute] 🧪 ${subagentId} — testing ${mod.name}`);
          addMessage(tSysMsg);

          const tResult = await ipc.agent.execute({
            sessionId: sessionTextId, nodeId: `${subagentId}-test`,
            prompt: tPrompt, model: routedModel, context: buildContext(),
          });

          const tMsg = await ipc.insertMessage(sessionId, 'assistant', `[🧪 ${subagentId} — ${mod.name}]\n${tResult.content.slice(0, 2000)}`);
          addMessage(tMsg);

          return { module: mod.name, builder: bResult.content, critic: cResult.content, tester: tResult.content, passed: /PASS/i.test(tResult.content) };
        }),
      );

      const allPassed = moduleResults.every(r => r.passed);
      const resultsSummary = moduleResults.map(r => `  ${r.passed ? '✅' : '❌'} ${r.module}`).join('\n');

      // ── Phase 3: Integration Tester (gated — only if all unit tests pass) ──
      if (allPassed && modules.length > 1) {
        setExecStatus('🧪 Integration tests...');
        const intPrompt = [
          'You are ROLLE IV: The Tester — Integration Test subagent.',
          `All ${modules.length} modules passed unit tests. STATE READY for all modules.`,
          'Run integration tests across module boundaries:',
          modules.map(m => `- ${m.name}`).join('\n'),
          '',
          '## Module Outputs',
          moduleResults.map(r => `### ${r.module}\n${r.builder.slice(0, 500)}`).join('\n\n'),
          '',
          'Output: VERDICT: PASS | BLOCKED | NEEDS-CALIBRATION',
        ].join('\n');

        const intResult = await ipc.agent.execute({
          sessionId: sessionTextId, nodeId: 'pipeline-integration-test',
          prompt: intPrompt, model: routedModel, context: buildContext(),
        });

        const intMsg = await ipc.insertMessage(sessionId, 'assistant', `[🧪 Integration Tests]\n${intResult.content.slice(0, 2000)}`);
        addMessage(intMsg);
      }

      // ── Phase 4: Memory Keeper ──
      setExecStatus('🧠 Memory Keeper — compressing session...');
      const mkPrompt = PERSONA_PROMPTS.memoryKeeper(plan, spec, moduleResults.map(r => r.builder).join('\n\n'));
      const mkSysMsg = await ipc.insertMessage(sessionId, 'system', '[execute] 🧠 Memory Keeper');
      addMessage(mkSysMsg);

      const mkResult = await ipc.agent.execute({
        sessionId: sessionTextId, nodeId: 'pipeline-memoryKeeper',
        prompt: mkPrompt, model: routedModel, context: buildContext(),
      });

      const mkMsg = await ipc.insertMessage(sessionId, 'assistant', `[🧠 Memory Keeper]\n${mkResult.content.slice(0, 2000)}`);
      addMessage(mkMsg);

      const summary = await ipc.insertMessage(sessionId, 'system', `[execute] ✅ Complete — ${modules.length} modules${allPassed ? ', all passed' : ', some failed'}\n${resultsSummary}`);
      addMessage(summary);

      // ── Surface Processing (fire-and-forget, non-blocking) ──
      const surfacePromises: Promise<void>[] = [];

      // Surface 2: Semantics Sentinel — DRIFT check per module
      for (const r of moduleResults) {
        surfacePromises.push((async () => {
          try {
            const dr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: `semantics-${r.module}`, prompt: `DELTA: ${r.builder.slice(0, 1500)}\n\nCheck DRIFT.`, model: routedModel, context: SEMANTICS_SENTINEL_PROMPT });
            if (/DRIFT/i.test(dr.content) && !/CLEAR/i.test(dr.content)) {
              const dm = await ipc.insertMessage(sessionId, 'assistant', `[🔤 DRIFT — ${r.module}]\n${dr.content.slice(0, 500)}`);
              addMessage(dm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // Surface 3: Coverage Cartographer — post-Tester
      for (const r of moduleResults) {
        surfacePromises.push((async () => {
          try {
            const cr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: `coverage-${r.module}`, prompt: `Tester verdict:\n${r.tester.slice(0, 1000)}\n\nMap coverage.`, model: routedModel, context: COVERAGE_CARTOGRAPHER_PROMPT });
            if (/COVERAGE\s+LOAD-BEARING/i.test(cr.content)) {
              const cm = await ipc.insertMessage(sessionId, 'assistant', `[📊 COVERAGE — ${r.module}]\n${cr.content.slice(0, 500)}`);
              addMessage(cm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // Surface 4: Confidence Annotator — per module output
      for (const r of moduleResults) {
        surfacePromises.push((async () => {
          try {
            const ar = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: `confidence-${r.module}`, prompt: `Persona outputs:\nBuilder: ${r.builder.slice(0, 500)}\nCritic: ${r.critic.slice(0, 500)}\nTester: ${r.tester.slice(0, 500)}\n\nAnnotate confidence.`, model: routedModel, context: CONFIDENCE_ANNOTATOR_PROMPT });
            if (/CONFIDENCE\s*[1-2]/i.test(ar.content)) {
              const am = await ipc.insertMessage(sessionId, 'assistant', `[⚠️ LOW CONFIDENCE — ${r.module}]\n${ar.content.slice(0, 500)}`);
              addMessage(am);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // Surface 6: Performance Sentinel — per module
      for (const r of moduleResults) {
        surfacePromises.push((async () => {
          try {
            const pr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: `perf-${r.module}`, prompt: `Implementation:\n${r.builder.slice(0, 1500)}\n\nComplexity analysis.`, model: routedModel, context: PERFORMANCE_SENTINEL_PROMPT });
            if (/COMPLEXITY/i.test(pr.content) && !/CLEAR/i.test(pr.content)) {
              const pm = await ipc.insertMessage(sessionId, 'assistant', `[⚡ COMPLEXITY — ${r.module}]\n${pr.content.slice(0, 500)}`);
              addMessage(pm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // Surface 5: Topology Warden — after 5th convergence (fire-and-forget)
      if (deliberationLog.length > 0 && deliberationLog.length % 5 === 0) {
        surfacePromises.push((async () => {
          try {
            const tr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'topology-warden', prompt: `Modules this execution:\n${modules.map(m => `- ${m.name}`).join('\n')}\n\nRepo: ${repoPath || '.'}\n\nCheck topology.`, model: routedModel, context: TOPOLOGY_WARDEN_PROMPT });
            if (/TOPOLOGY/i.test(tr.content) && !/STABLE/i.test(tr.content)) {
              const tm = await ipc.insertMessage(sessionId, 'assistant', `[🔗 TOPOLOGY]\n${tr.content.slice(0, 500)}`);
              addMessage(tm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // Surface 8: Knowledge Crystallizer — after 10th convergence
      if (deliberationLog.length > 0 && deliberationLog.length % 10 === 0) {
        surfacePromises.push((async () => {
          try {
            const kcr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'knowledge-crystallizer', prompt: `Last 10 Memory Keeper records. Extract patterns appearing 3+ times.`, model: routedModel, context: KNOWLEDGE_CRYSTALLIZER_PROMPT });
            if (/CRYSTALLIZE/i.test(kcr.content)) {
              knowledgePatterns.push(kcr.content);
              const kcm = await ipc.insertMessage(sessionId, 'assistant', `[💎 CRYSTALLIZED]\n${kcr.content.slice(0, 500)}`);
              addMessage(kcm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // ── L5 Emergence Surfaces ──

      // E1: Trajectory Modeler — every 10th convergence
      if (deliberationLog.length > 0 && deliberationLog.length % 10 === 0) {
        surfacePromises.push((async () => {
          try {
            const tr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'trajectory-modeler', prompt: `Last 10 convergences. Predict structural attractors.`, model: routedModel, context: TRAJECTORY_MODELER_PROMPT });
            if (/TRAJECTORY/i.test(tr.content) && !/UNDETERMINED/i.test(tr.content)) {
              const tm = await ipc.insertMessage(sessionId, 'assistant', `[🧭 TRAJECTORY]\n${tr.content.slice(0, 500)}`);
              addMessage(tm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // E2: Contradiction Engine — after 5th blocked proposal
      if (blockedProposals.length > 0 && blockedProposals.length % 5 === 0) {
        surfacePromises.push((async () => {
          try {
            const cr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'contradiction-engine', prompt: `Blocked proposals:\n${blockedProposals.slice(-5).join('\n')}\n\nFind missing abstraction.`, model: routedModel, context: CONTRADICTION_ENGINE_PROMPT });
            if (/MISSING-ABSTRACTION/i.test(cr.content)) {
              const cm = await ipc.insertMessage(sessionId, 'assistant', `[⚡ MISSING-ABSTRACTION]\n${cr.content.slice(0, 500)}`);
              addMessage(cm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // E5: Intent Preservation — per module
      for (const r of moduleResults) {
        surfacePromises.push((async () => {
          try {
            const ir = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: `intent-${r.module}`, prompt: `Module: ${r.module}\nBuilder: ${r.builder.slice(0, 500)}\nCritic: ${r.critic.slice(0, 300)}\nExtract WHY.`, model: routedModel, context: INTENT_PRESERVATION_PROMPT });
            if (/WHY/i.test(ir.content)) {
              const im = await ipc.insertMessage(sessionId, 'assistant', `[💡 WHY — ${r.module}]\n${ir.content.slice(0, 300)}`);
              addMessage(im);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // E6: Adversarial Fuzzer — per module
      for (const r of moduleResults) {
        surfacePromises.push((async () => {
          try {
            const fr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: `fuzzer-${r.module}`, prompt: `Interface: ${r.builder.slice(0, 800)}\nGenerate semantically adversarial inputs.`, model: routedModel, context: ADVERSARIAL_FUZZER_PROMPT });
            if (/FUZZ/i.test(fr.content)) {
              const fm = await ipc.insertMessage(sessionId, 'assistant', `[🎯 FUZZ — ${r.module}]\n${fr.content.slice(0, 500)}`);
              addMessage(fm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // E3: Simulation Layer — every 10th convergence, sandboxed deliberation
      if (deliberationLog.length > 0 && deliberationLog.length % 10 === 0) {
        surfacePromises.push((async () => {
          try {
            const sr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'simulation-layer', prompt: `Blueprint:\n${plan.slice(0, 1000)}\n\nSimulate consequences.`, model: routedModel, context: SIMULATION_LAYER_PROMPT });
            if (/SIMULATE/i.test(sr.content)) {
              const sm = await ipc.insertMessage(sessionId, 'assistant', `[🔮 SIMULATE]\n${sr.content.slice(0, 500)}`);
              addMessage(sm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // E4: Perimeter Sentinel — every 10th convergence
      if (deliberationLog.length > 0 && deliberationLog.length % 10 === 0) {
        surfacePromises.push((async () => {
          try {
            const pr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'perimeter-sentinel', prompt: `Repo: ${repoPath || '.'}. Modules: ${modules.map(m => m.name).join(', ')}. Check perimeter.`, model: routedModel, context: PERIMETER_SENTINEL_PROMPT });
            if (/PERIMETER/i.test(pr.content)) {
              const pm = await ipc.insertMessage(sessionId, 'assistant', `[🛡️ PERIMETER]\n${pr.content.slice(0, 500)}`);
              addMessage(pm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // E8: Cross-Instance — every 20th convergence (rare)
      if (deliberationLog.length > 0 && deliberationLog.length % 20 === 0) {
        surfacePromises.push((async () => {
          try {
            const xr = await ipc.agent.execute({ sessionId: sessionTextId, nodeId: 'cross-instance', prompt: `Knowledge patterns:\n${knowledgePatterns.slice(-5).join('\n')}\nInvariants:\n${INVARIANT_REGISTRY.join('\n')}\n\nCross-instance comparison.`, model: routedModel, context: COLLECTIVE_INTELLIGENCE_PROMPT });
            if (/CROSS-INSTANCE/i.test(xr.content)) {
              const xm = await ipc.insertMessage(sessionId, 'assistant', `[🌐 CROSS-INSTANCE]\n${xr.content.slice(0, 500)}`);
              addMessage(xm);
            }
          } catch { /* non-blocking */ }
        })());
      }

      // Wait for surfaces (max 10s) — don't block status
      Promise.all(surfacePromises).catch(() => {});

      // Transition to SOLVE if issues found
      if (!allPassed) {
        setExecutionIssues(moduleResults.filter(r => !r.passed).map(r => r.module));
        setExecState('solve');
      }
      setExecStatus(`✅ ${modules.length} modules complete${allPassed ? '' : ' — review failures'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecStatus(`Error: ${msg}`);
      setLastError(msg);
      const errMsg = await ipc.insertMessage(sessionId, 'system', `[execute error] ${msg}`);
      addMessage(errMsg);
    } finally {
      setBusy(false);
    }
  };

  const handlePlanAndExecute = async () => {
    setBusy(true);
    setLastError(null);
    try {
      if (!blueprintDraft) await synthesizeBlueprint();
      if (blueprintDraft) await executeBlueprintPlan(blueprintDraft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
    } finally { setBusy(false); }
  };

  // ── ΠΛΟΗΓΟΣ (Navigator) ─────────────────────────────────────────
  const runNavigator = async () => {
    setNavigatorLoading(true);
    setNavigatorActive(true);
    setLastError(null);
    try {
      const { sessionTextId } = await ensureSession();
      const context = [
        repoPath ? `Active repository: ${repoPath}` : '',
        blueprintDraft ? `Current blueprint:\n${blueprintDraft.slice(0, 2000)}` : '',
        repoContext ? `Repository context:\n${repoContext.slice(0, 1000)}` : '',
        `Active mode: ${mode}. Planning intent: ${planningIntent}`,
        `Constraints: ${constraints}`,
        'Identify the 3 highest-value next actions. Score each on Impact, Effort, Risk, Dependency, Learning (1-10).',
      ].filter(Boolean).join('\n\n');

      const result = await ipc.agent.execute({
        sessionId: sessionTextId,
        nodeId: 'navigator',
        prompt: context,
        model: routingMode === 'hybrid' ? architectModel : `${routingMode}:${architectModel}`,
        context: NAVIGATOR_SYSTEM_PROMPT,
      });

      // Parse candidates from the output
      const candidates = parseNavigatorOutput(result.content);

      setNavigatorResult({ candidates, rawOutput: result.content });

      const navMsg = await (async () => {
        const { sessionId } = await ensureSession();
        return await ipc.insertMessage(sessionId, 'system', `[🧭 Navigator]\n${result.content.slice(0, 2000)}`);
      })();
      addMessage(navMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
    } finally {
      setNavigatorLoading(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // ── Module graph items ─────────────────────────────────────────
  const moduleItems = useMemo(() => {
    return moduleSpec.split('\n').filter((l) => l.trim()).map((line) => {
      const nameMatch = line.match(/MODULE:\s*(.+?)(\s+depends?:|$)/i);
      const depMatch = line.match(/depends?:\s*(.+)$/i);
      return { name: nameMatch?.[1]?.trim() || line, deps: depMatch?.[1]?.trim() || 'none' };
    });
  }, [moduleSpec]);

  // ── BP divider drag ────────────────────────────────────────────
  const draggingBp = useRef(false);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!draggingBp.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setBpWidth(Math.max(280, Math.min(540, rect.right - e.clientX)));
    };
    const up = () => { draggingBp.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const startBpDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingBp.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="h-full flex flex-col bg-[#0e0e10]">
      {/* ── MODE BAR ── */}
      <div className="flex items-center h-10 bg-[#141416] border-b border-[rgba(255,255,255,0.07)] px-4 gap-1 flex-shrink-0">
        {([
          { id: 'ask' as CanvasMode, icon: '💬', label: 'Ask' },
          { id: 'plan' as CanvasMode, icon: '🗺', label: 'Plan' },
          { id: 'execute' as CanvasMode, icon: '⚡', label: 'Execute' },
          { id: 'review' as CanvasMode, icon: '🔍', label: 'Review' },
          { id: 'jcode' as CanvasMode, icon: '💻', label: 'JCode' },
        ]).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setMode(item.id);
              if (item.id === 'execute' && blueprintDraft && mode !== 'execute') {
                executeBlueprintPlan(blueprintDraft);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border ${
              mode === item.id
                ? item.id === 'plan' ? 'text-[#4fc4cf] bg-[rgba(79,196,207,0.1)] border-[rgba(79,196,207,0.25)]'
                : item.id === 'execute' ? 'text-[#3dd68c] bg-[rgba(61,214,140,0.1)] border-[rgba(61,214,140,0.25)]'
                : item.id === 'jcode' ? 'text-[#f0a040] bg-[rgba(240,160,64,0.1)] border-[rgba(240,160,64,0.25)]'
                : 'text-[#6c8cf8] bg-[rgba(108,140,248,0.1)] border-[rgba(108,140,248,0.25)]'
                : 'text-[#888890] border-transparent hover:text-[#e8e8ea] hover:bg-[#1a1a1e]'
            }`}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
        <div className="w-px h-4 bg-[rgba(255,255,255,0.07)] mx-1" />

        {/* Reviewer toggle */}
        <button
          onClick={() => setEnableReviewer(!enableReviewer)}
          className={`w-7 h-7 flex items-center justify-center rounded-md border text-[12px] transition-all ${
            enableReviewer ? 'border-[rgba(79,196,207,0.3)] text-[#4fc4cf] bg-[rgba(79,196,207,0.08)]' : 'border-[rgba(255,255,255,0.07)] text-[#444450]'
          }`} title="Toggle reviewer"
        >👥</button>

        {/* Auto toggle */}
        <button
          onClick={() => setAutoExecute(!autoExecute)}
          className={`w-7 h-7 flex items-center justify-center rounded-md border text-[12px] transition-all ${
            autoExecute ? 'border-[rgba(61,214,140,0.3)] text-[#3dd68c] bg-[rgba(61,214,140,0.08)]' : 'border-[rgba(255,255,255,0.07)] text-[#444450]'
          }`} title="Full auto"
        >⚡</button>

        <div className="flex-1" />

        {/* State Machine Panel (replaces old harness bar) */}
        {execState === 'planning' && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6c8cf8] animate-bounce"/>
              <span className="w-1.5 h-1.5 rounded-full bg-[#6c8cf8] animate-bounce" style={{animationDelay:'0.15s'}}/>
              <span className="w-1.5 h-1.5 rounded-full bg-[#6c8cf8] animate-bounce" style={{animationDelay:'0.3s'}}/>
            </div>
            <span className="text-[11px] text-[#888890]">Planning...</span>
          </div>
        )}

        {execState === 'refine' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#f5a623]">RC {execRC}/7</span>
            <button
              onClick={handlePlanAndExecute}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[rgba(245,166,35,0.15)] border border-[rgba(245,166,35,0.3)] text-[#f5a623] hover:bg-[rgba(245,166,35,0.25)] transition-all disabled:opacity-40"
            >
              🔄 Refine ({EXEC_THRESHOLD - execRC} to threshold)
            </button>
            <button
              onClick={handlePlanAndExecute}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[rgba(61,214,140,0.1)] border border-[rgba(61,214,140,0.2)] text-[#3dd68c] hover:bg-[rgba(61,214,140,0.2)] transition-all disabled:opacity-40"
            >
              ⚡ Execute (RC {execRC})
            </button>
          </div>
        )}

        {execState === 'execute' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#3dd68c] font-semibold">RC {execRC}/7 ✓</span>
            <button
              onClick={handlePlanAndExecute}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[rgba(61,214,140,0.15)] border border-[rgba(61,214,140,0.3)] text-[#3dd68c] hover:bg-[rgba(61,214,140,0.25)] transition-all disabled:opacity-40 animate-[pulse-green_2s_infinite]"
            >
              ⚡ Execute
            </button>
          </div>
        )}

        {execState === 'solve' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#f5a623]">
              {executionIssues.length} issue{executionIssues.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handlePlanAndExecute}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[rgba(245,166,35,0.15)] border border-[rgba(245,166,35,0.3)] text-[#f5a623] hover:bg-[rgba(245,166,35,0.25)] transition-all disabled:opacity-40"
            >
              🔧 Solve
            </button>
          </div>
        )}
      </div>

      {/* ── REVIEW MODE ── */}
      {mode === 'review' && (
        <div className="flex-1 flex overflow-hidden">
          <ReviewPanel />
        </div>
      )}

      {/* ── JCODE MODE ── */}
      {mode === 'jcode' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Code Editor */}
          <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
            <div className="px-3 py-1.5 border-b border-[#333] flex items-center gap-2 flex-shrink-0" style={{background:'#252526'}}>
              <span className="text-[11px] font-semibold text-[#f0a040]">💻 JCode Editor</span>
              <span className="text-[10px] text-[#808080] font-mono">
                {repoPath || 'No repo selected'}
              </span>
              <div className="flex-1" />
              <span className="text-[10px] text-[#808080] font-mono">Model: {architectModel}</span>
            </div>
            <textarea
              className="flex-1 bg-transparent border-none outline-none p-3 font-mono text-[12px] leading-[1.6] resize-none"
              style={{color:'#d4d4d4', fontFamily:'"JetBrains Mono","Fira Code","Cascadia Code",monospace'}}
              placeholder={`// JCode Mode — active repo: ${repoPath || 'none selected'}\n// Model: ${architectModel}\n// Type code or questions below...`}
              value={planChatDraft}
              onChange={(e) => setPlanChatDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendPlanChat(); }
              }}
            />
            <div className="px-2 py-1.5 border-t border-[#333] flex items-center gap-2 flex-shrink-0" style={{background:'#252526'}}>
              <span className="text-[10px] text-[#808080] font-mono">Ctrl+Enter to send</span>
              <div className="flex-1" />
              <button
                onClick={sendPlanChat}
                disabled={!planChatDraft.trim() || busy}
                className="px-3 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-30"
                style={{background:'#f0a040', color:'#1e1e1e'}}
              >
                {busy ? 'Running...' : 'Execute'}
              </button>
            </div>
          </div>
          {/* Chat */}
          <div className="w-px flex-shrink-0" style={{background:'#333'}} />
          <div className="flex flex-col" style={{width:320}}>
            <div className="px-3 py-1.5 border-b border-[#333] flex-shrink-0" style={{background:'#252526'}}>
              <span className="text-[11px] font-semibold text-[#cccccc]">Output</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1 flex flex-col gap-0.5" style={{background:'#1e1e1e'}}>
              {messages.filter(m => m.role === 'assistant' || m.role === 'system').slice(-20).map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {messages.filter(m => m.role === 'assistant' || m.role === 'system').length === 0 && (
                <div className="text-center py-8 text-[#6a9955] text-sm font-mono select-none">// output appears here</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WORKSPACE (Ask, Plan, Execute) ── */}
      {mode !== 'review' && mode !== 'jcode' && (
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* CHAT PANEL */}
        <div className="flex-1 flex flex-col min-w-[320px] overflow-hidden">
          <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.07)] flex items-center gap-2 flex-shrink-0">
            <div>
              <div className="text-[12px] font-semibold text-[#e8e8ea]">Planning Chat</div>
              <div className="text-[11px] text-[#888890]">
                {mode === 'ask' ? 'Freeform chat' : mode === 'plan' ? 'Architect + Reviewer · Blueprint Mode' : mode === 'execute' ? 'Execution' : mode === 'jcode' ? 'JCode Editor' : 'Review'}
              </div>
            </div>
            <div className="flex-1" />
            {/* Navigator toggle — Ask mode only */}
            {mode === 'ask' && (
              <button
                onClick={() => { setNavigatorActive(!navigatorActive); if (!navigatorActive) runNavigator(); }}
                disabled={navigatorLoading}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                  navigatorActive
                    ? 'border-[rgba(245,166,35,0.4)] text-[#f5a623] bg-[rgba(245,166,35,0.1)]'
                    : 'border-[rgba(255,255,255,0.07)] text-[#888890] hover:text-[#f5a623]'
                } disabled:opacity-50`}
                title="ΠΛΟΗΓΟΣ: What should I work on next?"
              >
                🧭 {navigatorLoading ? '...' : 'Navigate'}
              </button>
            )}
            <button onClick={() => setFloatCollapsed(!floatCollapsed)} className="w-7 h-7 flex items-center justify-center rounded-md border border-[rgba(255,255,255,0.07)] text-[#888890] text-[12px] hover:border-[rgba(255,255,255,0.14)] hover:text-[#e8e8ea] transition-colors" title="Toggle intent window">
              📋
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2.5" onContextMenu={handleContextMenu} onClick={() => setContextMenu(null)}>
            {/* Navigator results card */}
            {navigatorActive && navigatorResult && (
              <div className="rounded-xl border border-[rgba(245,166,35,0.2)] bg-[rgba(245,166,35,0.04)] p-3 mx-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px]">🧭</span>
                  <span className="text-[12px] font-bold text-[#f5a623]">ΠΛΟΗΓΟΣ — Top 3 Actions</span>
                  <button onClick={() => { setNavigatorActive(false); setNavigatorResult(null); }} className="ml-auto text-[#888890] hover:text-[#f5a623] text-[11px]">×</button>
                </div>
                {navigatorResult.candidates.length === 0 && (
                  <div className="text-[11px] text-[#888890] italic">No structured candidates parsed. Raw output below.</div>
                )}
                <div className="space-y-2">
                  {navigatorResult.candidates.map((c, i) => {
                    const score = computePriorityScore(c);
                    const barPct = (score / 10) * 100;
                    return (
                      <div key={c.id} className="rounded-lg bg-[rgba(20,20,24,0.8)] border border-[rgba(255,255,255,0.05)] p-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[#1a1a1e]"
                            style={{background: i === 0 ? '#f5a623' : i === 1 ? '#f0a040' : '#d4952b'}}>
                            {i + 1}
                          </span>
                          <span className="text-[12px] font-semibold text-[#e8e8ea]">{c.label}</span>
                          <span className="ml-auto text-[11px] font-bold text-[#f5a623]">{score}/10</span>
                        </div>
                        <div className="h-1 bg-[#2a2a2e] rounded-full mb-2">
                          <div className="h-full rounded-full transition-all" style={{width:`${barPct}%`,background:'linear-gradient(90deg,#f5a623,#f0a040)'}} />
                        </div>
                        <div className="grid grid-cols-5 gap-1 text-[9px]">
                          {(['impact','effort','risk','dependency','learning'] as const).map((dim) => (
                            <div key={dim} className="text-center">
                              <div className="text-[#555560] uppercase tracking-wider">{dim.slice(0,3)}</div>
                              <div className="text-[#e8e8ea] font-mono font-bold">{c[dim]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {planningMessages.length === 0 && !(navigatorActive && navigatorResult) && (
              <div className="text-center py-8 text-[#888890] text-sm">
                {mode === 'execute'
                  ? `Type "go" to execute the blueprint${blueprintDraft ? '' : ' — no blueprint yet. Switch to Plan mode first.'}`
                  : mode === 'plan'
                    ? 'Start a planning discussion below.'
                    : 'Freeform chat — ask anything.'}
              </div>
            )}
            {/* Execute: show blueprint preview when messages empty */}
            {planningMessages.length === 0 && mode === 'execute' && blueprintDraft && (
              <div className="rounded-lg border border-[rgba(61,214,140,0.15)] bg-[rgba(61,214,140,0.03)] px-3 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-[#3dd68c]">⚡ Blueprint Ready</span>
                  <span className="text-[10px] text-[#888890]">Harness: {harness.score}/10</span>
                </div>
                <pre className="text-[11px] text-[#e8e8ea] whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono leading-relaxed">
                  {blueprintDraft.slice(0, 1200)}
                </pre>
              </div>
            )}
            {planningMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {busy && (
              <div className="flex gap-2 items-center px-1 py-1">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6c8cf8] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6c8cf8] animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6c8cf8] animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
                <span className="text-[11px] text-[#888890]">Thinking...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-2 border-t border-[rgba(255,255,255,0.07)] flex-shrink-0">
            {lastError && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">⚠️</span>
                <span className="flex-1 whitespace-pre-wrap break-all">{lastError}</span>
                <button onClick={() => setLastError(null)} className="flex-shrink-0 text-red-400/60 hover:text-red-400">×</button>
              </div>
            )}
            <div className="flex gap-1.5 flex-wrap mb-1.5">
              {mode === 'execute'
                ? ['go', 'execute', 'run plan'].map((hint) => (
                    <button key={hint} onClick={() => { setPlanChatDraft(hint); setTimeout(() => sendPlanChat(), 0); }}
                      className="px-2 py-0.5 rounded-full border border-[rgba(61,214,140,0.2)] text-[11px] text-[#3dd68c] hover:border-[rgba(61,214,140,0.5)] hover:bg-[rgba(61,214,140,0.08)] transition-colors">
                      🚀 {hint}
                    </button>
                  ))
                : ['Refine the plan', 'Add risk assessment', 'Suggest smaller slice', 'Validate dependencies', 'Score this blueprint'].map((hint) => (
                    <button key={hint} onClick={() => { setPlanChatDraft(hint); setTimeout(() => sendPlanChat(), 0); }}
                      className="px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.07)] text-[11px] text-[#888890] hover:border-[#6c8cf8] hover:text-[#6c8cf8] hover:bg-[rgba(108,140,248,0.08)] transition-colors">
                      {hint}
                    </button>
                  ))
              }
            </div>
            <div className="flex items-end gap-2 bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2 focus-within:border-[#6c8cf8] focus-within:shadow-[0_0_0_3px_rgba(108,140,248,0.1)] transition-all">
              <textarea ref={planChatInputRef} value={planChatDraft} onChange={(e) => setPlanChatDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPlanChat(); }}}
                placeholder={mode === 'execute' ? 'Type "go" to execute plan…' : 'Discuss the plan with architect + reviewer…'} rows={1}
                className="flex-1 bg-transparent border-none outline-none text-[#e8e8ea] text-[13px] leading-relaxed resize-none max-h-[100px] min-h-[20px] placeholder:text-[#444450]"
              />
              <button onClick={sendPlanChat} disabled={!planChatDraft.trim() || busy}
                className="w-7 h-7 rounded-lg bg-[#6c8cf8] flex items-center justify-center flex-shrink-0 hover:bg-[#8aa4ff] hover:scale-105 active:scale-95 transition-all disabled:opacity-40">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* DIVIDER */}
        <div onMouseDown={startBpDrag} className="w-1 cursor-col-resize bg-[rgba(255,255,255,0.07)] hover:bg-[#6c8cf8] transition-colors flex-shrink-0 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 bg-[rgba(255,255,255,0.12)] rounded-full" />
        </div>

        {/* BLUEPRINT PANEL */}
        <div className="flex-shrink-0 flex flex-col border-l border-[rgba(255,255,255,0.07)] bg-[#141416] overflow-hidden" style={{ width: bpWidth }}>
          <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.07)] flex-shrink-0 flex items-center gap-2">
            <button onClick={() => setBpView('plan')}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${bpView === 'plan' ? 'text-[#4fc4cf] bg-[rgba(79,196,207,0.1)]' : 'text-[#555560] hover:text-[#888890]'}`}>Plan</button>
            <button onClick={() => setBpView('overview')}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${bpView === 'overview' ? 'text-[#4fc4cf] bg-[rgba(79,196,207,0.1)]' : 'text-[#555560] hover:text-[#888890]'}`}>Overview</button>
            <span className="flex-1" />
            <div className="text-[12px] font-semibold text-[#4fc4cf]">Dyson Level Blueprint</div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
            {/* Planning Intent block */}
            <div className="bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-1.5">Intent</div>
              <div className="text-[12px] text-[#e8e8ea] leading-relaxed">{planningIntent || 'Set planning intent above.'}</div>
            </div>

            {/* Constraints block */}
            <div className="bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-1.5">Constraints</div>
              <div className="text-[12px] text-[#e8e8ea] leading-relaxed">{constraints || 'None set.'}</div>
            </div>

            {/* Ratchet Score — 7 RC conditions (visible in refine/execute/solve states) */}
            {(execState === 'refine' || execState === 'execute' || execState === 'solve') && (
              <div className="bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-lg p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-1.5">
                  Ratchet Score — RC {execRC}/7
                </div>
                <div className="space-y-1">
                  {RC_CONDITIONS.map((c) => (
                    <div key={c.rc} className={`flex items-start gap-1.5 text-[10px] leading-tight ${c.rc <= execRC ? 'opacity-100' : 'opacity-40'}`}>
                      <span className={`mt-0.5 text-[8px] ${c.rc <= execRC ? 'text-[#3dd68c]' : 'text-[#555560]'}`}>
                        {c.rc <= execRC ? '●' : '○'}
                      </span>
                      <div>
                        <span className={c.rc <= execRC ? 'text-[#e8e8ea]' : 'text-[#555560]'}>RC{c.rc}: {c.label}</span>
                        {c.rc > execRC && (
                          <span className="block text-[#f5a623] text-[9px]">{c.gap}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Module Graph */}
            <div className="bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-1.5">Module Graph</div>
              {moduleItems.length === 0 ? (
                <div className="text-[11px] text-[#888890]">No modules parsed yet. Start planning to build the graph.</div>
              ) : (
                moduleItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-[12px] text-[#e8e8ea]">
                    <div className={`w-1.5 h-1.5 rounded-full ${item.deps === 'none' ? 'bg-[#888890]' : 'bg-[#6c8cf8]'}`} />
                    <span>{item.name}</span>
                    <span className="ml-auto text-[10px] text-[#888890]">dep: {item.deps}</span>
                  </div>
                ))
              )}
            </div>

            {/* Harness Score */}
            <div className="bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-1.5">Harness Score</div>
              <div className="flex flex-wrap gap-1">
                {harness.badges.map((b) => (
                  <span key={b.rc}
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      b.met ? 'bg-[rgba(61,214,140,0.1)] text-[#3dd68c] border-[rgba(61,214,140,0.2)]'
                        : 'bg-[rgba(245,166,35,0.1)] text-[#f5a623] border-[rgba(245,166,35,0.2)]'
                    }`}>
                    RC{b.rc} {b.met ? '✓' : '?'}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-[#888890]">
                Score: <strong className={harness.score >= 7 ? 'text-[#3dd68c]' : 'text-[#f5a623]'}>{harness.score} / 10</strong>
                {harness.score < 7 && (
                  <span className="ml-1">
                    · Needs {harness.badges.filter((b) => !b.met).map((b) => `RC${b.rc}`).join(', ')} to reach ratchet (≥7)
                  </span>
                )}
              </div>
            </div>

            {/* Blueprint draft */}
            <div className="bg-[#1a1a1e] border border-[rgba(255,255,255,0.07)] rounded-lg p-2.5 flex-1 min-h-[120px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-1.5">Blueprint Draft</div>
              <textarea
                value={blueprintDraft}
                onChange={(e) => setBlueprintDraft(e.target.value)}
                placeholder="Blueprint will appear here after synthesis..."
                className="w-full h-full min-h-[120px] bg-transparent border-none outline-none text-[#e8e8ea] text-[12px] leading-relaxed resize-none font-mono placeholder:text-[#444450]"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-[rgba(255,255,255,0.07)] flex gap-2 flex-shrink-0">
            <button onClick={synthesizeBlueprint} disabled={busy}
              className="px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.07)] text-[12px] font-semibold text-[#888890] hover:border-[rgba(255,255,255,0.14)] hover:text-[#e8e8ea] transition-all disabled:opacity-40">
              Synthesize
            </button>
            <button onClick={handlePlanAndExecute} disabled={!harness.ready || busy}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: harness.ready ? '#3dd68c' : 'rgba(61,214,140,0.15)', color: harness.ready ? '#0a1f12' : '#3dd68c' }}>
              ⚡ Plan & Execute
            </button>
          </div>
        </div>

        {/* ── FLOATING INTENT WINDOW ── */}
        {!floatCollapsed && (
          <div className="absolute z-20 bg-[#1a1a1e] border border-[rgba(255,255,255,0.12)] rounded-xl shadow-2xl overflow-hidden flex flex-col"
            style={{ left: floatPos.x, top: floatPos.y, width: floatSize.width, height: floatSize.height }}>
            <div onMouseDown={startFloatDrag}
              className="bg-[#202024] px-3 py-2 flex items-center gap-2 cursor-grab border-b border-[rgba(255,255,255,0.07)]">
              <div className="flex gap-1.5">
                <button onClick={() => setFloatCollapsed(true)} className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] hover:bg-[#ff3b30]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <span className="text-[11px] font-semibold text-[#888890] ml-1">Planning Intent</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#444450] mb-1.5">Intent</div>
                <textarea value={planningIntent} onChange={(e) => setPlanningIntent(e.target.value)}
                  className="w-full bg-[#0e0e10] border border-[rgba(255,255,255,0.07)] rounded-lg p-2 text-[#e8e8ea] text-[12px] resize-none outline-none min-h-[56px] focus:border-[#6c8cf8] transition-colors" />
              </div>
              <div className="h-px bg-[rgba(255,255,255,0.07)]" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#444450] mb-1.5">Constraints</div>
                <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)}
                  className="w-full bg-[#0e0e10] border border-[rgba(255,255,255,0.07)] rounded-lg p-2 text-[#e8e8ea] text-[12px] resize-none outline-none min-h-[40px] focus:border-[#6c8cf8] transition-colors" />
              </div>
              <div className="h-px bg-[rgba(255,255,255,0.07)]" />
              {/* Frame Selector */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#444450] mb-1.5">Intent Frames</div>
                <div className="flex flex-wrap gap-1">
                  {['ΣΚΟΠ', 'IDEVA', 'INVENTIO', 'ΦΩΡGΕ', 'Ω1', 'Ω2', 'Ω6'].map((frame) => {
                    const active = activeFrames.includes(frame);
                    return (
                      <button key={frame} onClick={() => {
                        setActiveFrames((prev) => active ? prev.filter((f) => f !== frame) : [...prev, frame]);
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                        active ? 'bg-[rgba(108,140,248,0.15)] text-[#6c8cf8] border-[rgba(108,140,248,0.3)]' : 'border-[rgba(255,255,255,0.07)] text-[#555560] hover:text-[#888890]'
                      }`}>{frame}</button>);
                  })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={async () => {
                      if (!intentFuse) { setIntentFuse(true); }
                      if (!planningIntent.trim()) return;
                      try {
                        const result = await ipc.agent.execute({
                          sessionId: 'intent-transform', nodeId: 'intent-transformer',
                          prompt: `Transform this intent through these frames: ${activeFrames.join(', ')}.\n\nIntent: ${planningIntent}`,
                          model: 'flash-k2',
                          context: `You are an intent transformation engine. Apply these cognitive operators in sequence: ${activeFrames.join(' → ')}. Output only the transformed intent — no explanation.`,
                        });
                        setTransformedIntent(result.content);
                      } catch { setTransformedIntent(planningIntent); }
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
                      intentFuse ? 'bg-[rgba(108,140,248,0.15)] text-[#6c8cf8] border-[rgba(108,140,248,0.3)]' : 'border-[rgba(255,255,255,0.07)] text-[#555560] hover:text-[#888890]'
                    }`}
                  >
                    {intentFuse ? '⚡ Fuse ON' : 'Fuse'}
                  </button>
                  {intentFuse && (
                    <button onClick={() => { setIntentFuse(false); setTransformedIntent(''); }}
                      className="px-2 py-1 rounded text-[10px] text-[#555560] border border-[rgba(255,255,255,0.07)] hover:text-[#888890] transition-colors">
                      Raw
                    </button>
                  )}
                </div>
                {transformedIntent && intentFuse && (
                  <div className="mt-2 bg-[rgba(108,140,248,0.05)] border border-[rgba(108,140,248,0.15)] rounded-lg p-2 text-[11px] text-[#c8c8d0] leading-relaxed max-h-[100px] overflow-y-auto">
                    {transformedIntent}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <select value={routingMode} onChange={(e) => setRoutingMode(e.target.value as 'local' | 'cloud' | 'hybrid')}
                  className="flex-1 bg-[#0e0e10] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8ea] outline-none">
                  <option value="local">🖥️ Local</option>
                  <option value="hybrid">🔀 Hybrid</option>
                  <option value="cloud">☁️ Cloud</option>
                </select>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => { setRoutingVariant('v1'); localStorage.setItem('kore-routing-variant', 'v1'); }}
                    className={`flex-1 px-1.5 py-1 rounded text-[10px] font-semibold border transition-all ${
                      routingVariant === 'v1' ? 'bg-[rgba(108,140,248,0.15)] text-[#6c8cf8] border-[rgba(108,140,248,0.3)]' : 'border-[rgba(255,255,255,0.07)] text-[#555560]'
                    }`}>v1</button>
                  <button
                    onClick={() => { setRoutingVariant('v2'); localStorage.setItem('kore-routing-variant', 'v2'); }}
                    className={`flex-1 px-1.5 py-1 rounded text-[10px] font-semibold border transition-all ${
                      routingVariant === 'v2' ? 'bg-[rgba(61,214,140,0.15)] text-[#3dd68c] border-[rgba(61,214,140,0.3)]' : 'border-[rgba(255,255,255,0.07)] text-[#555560]'
                    }`}>v2</button>
                </div>
                <select value={architectModel} onChange={(e) => setArchitectModel(e.target.value)}
                  className="flex-1 bg-[#0e0e10] border border-[rgba(255,255,255,0.07)] rounded-lg px-2 py-1.5 text-[11px] text-[#e8e8ea] outline-none focus:border-[#6c8cf8] appearance-none cursor-pointer">
                  {KNOWN_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {!KNOWN_MODELS.includes(architectModel) && (
                    <option value={architectModel}>{architectModel} (custom)</option>
                  )}
                </select>
              </div>
              {/* Resize handle */}
              <div
                onMouseDown={startFloatResize}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity"
              >
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 10 L10 10 L10 0" fill="none" stroke="#888890" strokeWidth="1.5"/></svg>
              </div>
            </div>
          </div>
        )}

        {/* ── CONTEXT MENU ── */}
        {contextMenu && (
          <div className="fixed z-50 bg-[#141416] border border-[rgba(255,255,255,0.07)] rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => setContextMenu(null)}>
            {[
              { label: '🌐 Open Browser', action: () => ipc.openBrowser() },
              { label: '💻 Open VSCode', action: () => ipc.openVSCode(repoPath || undefined) },
              { label: '🖱️ Open Cursor', action: () => ipc.openCursor(repoPath || undefined) },
              { label: '📐 Browser (embedded)', action: () => ipc.openEmbeddedBrowser('https://www.google.com') },
            ].map((item) => (
              <button key={item.label} onClick={item.action}
                className="w-full text-left px-3 py-1.5 text-[12px] text-[#e8e8ea] hover:bg-[rgba(108,140,248,0.12)] transition-colors">
                {item.label}
              </button>
            ))}
          </div>
          )}

        {/* Float re-open button (when collapsed) */}
        {floatCollapsed && (
          <button onClick={() => setFloatCollapsed(false)}
            className="absolute top-2 left-2 z-10 w-8 h-8 bg-[#141416] border border-[rgba(255,255,255,0.07)] rounded-lg flex items-center justify-center text-[12px] hover:border-[rgba(255,255,255,0.14)] transition-colors">
            📋
          </button>
        )}
      </div>
      )}

      {/* Status bar — dynamic workflow stage */}
      <div className="h-5 bg-[#141416] border-t border-[rgba(255,255,255,0.07)] flex items-center px-3 gap-3 text-[10px] flex-shrink-0">
        {/* Stage indicator */}
        {execState === 'planning' && (
          <>
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-[#6c8cf8] animate-bounce"/>
              <span className="w-1 h-1 rounded-full bg-[#6c8cf8] animate-bounce" style={{animationDelay:'0.15s'}}/>
              <span className="w-1 h-1 rounded-full bg-[#6c8cf8] animate-bounce" style={{animationDelay:'0.3s'}}/>
            </div>
            <span style={{color:'#6c8cf8'}}>PLANNING</span>
          </>
        )}
        {execState === 'refine' && (
          <>
            <div className="w-1.5 h-1.5 rounded-full" style={{background:'#f5a623'}} />
            <span style={{color:'#f5a623'}}>REFINE · RC {execRC}/7</span>
          </>
        )}
        {execState === 'execute' && (
          <>
            <div className="w-1.5 h-1.5 rounded-full" style={{background:'#3dd68c'}} />
            <span style={{color:'#3dd68c'}}>EXECUTE · RC {execRC}/7 ✓</span>
          </>
        )}
        {execState === 'solve' && (
          <>
            <div className="w-1.5 h-1.5 rounded-full" style={{background:'#f5a623'}} />
            <span style={{color:'#f5a623'}}>
              SOLVE · {executionIssues.length} issue{executionIssues.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {execState === 'idle' && (
          <>
            <div className="w-1.5 h-1.5 rounded-full" style={{background:'#444450'}} />
            <span style={{color:'#444450'}}>CANVAS · {mode.toUpperCase()}</span>
          </>
        )}

        <div className="w-px h-3 bg-[rgba(255,255,255,0.07)]" />
        <span style={{color:'#555560'}}>RC {execRC || harness.score}/7</span>
        <div className="w-px h-3 bg-[rgba(255,255,255,0.07)]" />
        <span style={{color:'#555560'}}>{architectModel}</span>
        <span className="flex-1" />
        <span style={{color:'#444450'}}>{activeSessionId ? `#${activeSessionId}` : ''}</span>
      </div>
    </div>
  );
}
