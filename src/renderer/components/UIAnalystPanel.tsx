import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { classifyRestart, type RestartNotice } from '../data/restart-classifier';

interface LensSuggestion {
  id: string;
  title: string;
  target: string;
  rationale: string;
  score: number;
  dimensions: {
    visualImpact: number; uxClarity: number; accessibility: number;
    implCost: number; consistency: number; novelty: number; modeFit: number;
  };
  pipelineStatus?: 'queued' | 'planning' | 'executing' | 'done';
  restartLevel?: RestartNotice;
  confirmed?: boolean;
}

const LENS_PROMPT = [
  'You are ΛENS — Layered Enhancement & Navigation Synthesizer.',
  'You analyze the current DysonCode interface and suggest improvements.',
  '',
  '## Analysis Protocol — 5 Operations',
  '① Manifold Detection: real design degrees of freedom in the current view',
  '② Gap Geometry: what is geometrically absent? Missing states, labels, feedback?',
  '③ Harvest Audit: what exists in the design system that is not being used?',
  '④ Field Collapse: minimum change with maximum impact',
  '⑤ Fixpoint Check: does this suggestion produce a UI with no new problems?',
  '',
  '## Output Format',
  'TITLE: <one-line improvement name>',
  'TARGET: <specific component or area>',
  'RATIONALE: <two sentences citing standard or observation>',
  'VISUAL-IMPACT: <1-5> UX-CLARITY: <1-5> ACCESSIBILITY: <1-5>',
  'IMPL-COST: <1-5> CONSISTENCY: <1-5> NOVELTY: <1-5> MODE-FIT: <1-5>',
  'Max 3 suggestions. Closed questions only. Never suggest new tokens when existing ones solve it.',
].join('\n');

function parseLensOutput(raw: string): LensSuggestion[] {
  const suggestions: LensSuggestion[] = [];
  const blocks = raw.split(/TITLE:/i).filter(Boolean);
  for (const block of blocks.slice(0, 3)) {
    const title = (block.match(/^(.+)/) || [])[1]?.trim() || 'Untitled';
    const target = (block.match(/TARGET:\s*(.+)/i) || [])[1]?.trim() || 'General';
    const rationale = (block.match(/RATIONALE:\s*([\s\S]+?)(?=\n[A-Z]+-)/i) || [])[1]?.trim() || '';
    const v = (p: string) => Math.max(1, Math.min(5, parseInt((block.match(new RegExp(`${p}:\\s*(\\d+)`, 'i')) || [])[1] || '3')));
    const dims = { visualImpact: v('VISUAL-IMPACT'), uxClarity: v('UX-CLARITY'), accessibility: v('ACCESSIBILITY'), implCost: v('IMPL-COST'), consistency: v('CONSISTENCY'), novelty: v('NOVELTY'), modeFit: v('MODE-FIT') };
    const score = dims.visualImpact * 2 + dims.uxClarity * 2 + dims.accessibility + dims.implCost + dims.consistency + dims.novelty + dims.modeFit;
    suggestions.push({ id: `lens-${suggestions.length}`, title, target, rationale, score, dimensions: dims });
  }
  return suggestions;
}

function buildPromptText(s: LensSuggestion, mode: string): string {
  return [
    `[ΛENS UI Suggestion — DysonCode ${mode.toUpperCase()} Mode]`,
    `\nCONTEXT: DysonCode ${mode} Mode — ${s.target}`,
    `\nSUGGESTION: ${s.title}`,
    `\nRATIONALE: ${s.rationale}`,
    `\nSCORE: ${s.score}/35 — Visual Impact ${s.dimensions.visualImpact}, UX Clarity ${s.dimensions.uxClarity}, Accessibility ${s.dimensions.accessibility}, Implementation Cost ${s.dimensions.implCost}, Consistency ${s.dimensions.consistency}, Novelty ${s.dimensions.novelty}, Mode Fit ${s.dimensions.modeFit}`,
    `\nIMPLEMENTATION SPEC:`,
    `- Target: ${s.target}`,
    `- PRE: current implementation`,
    `- POST: ${s.title}`,
    `\nCONSTRAINTS: Do not introduce new tokens. Use existing design system.`,
  ].join('\n');
}

const DIM_LABELS: Record<string, string> = {
  visualImpact: 'Visual', uxClarity: 'UX', accessibility: 'Acc', implCost: 'Cost', consistency: 'Con', novelty: 'Nov', modeFit: 'Mode',
};

export default function UIAnalystPanel() {
  const ipc = (window as any).dyson;
  const { activePanel, repoPath } = useAppStore();
  const [suggestions, setSuggestions] = useState<LensSuggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [greeting, setGreeting] = useState('🔬 ΛENS ready — click Analyze to scan');
  const [mode, setMode] = useState(activePanel);

  useEffect(() => {
    if (mode !== activePanel) {
      setMode(activePanel);
      setGreeting(`🔬 Mode: ${activePanel.toUpperCase()} — click Analyze`);
    }
  }, [activePanel, mode]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setGreeting('🔬 Analyzing...');
    try {
      const ctx = [
        `Active mode: ${activePanel}`,
        activePanel === 'chat' ? 'Focus: message layout, code blocks, input affordance.' : '',
        activePanel === 'flow' ? 'Focus: node density, edge routing, state encoding.' : '',
        activePanel === 'canvas' ? 'Focus: state buttons, ratchet score, execution panel.' : '',
        'Suggest 2-3 concrete UI improvements.',
      ].filter(Boolean).join('\n');

      const result = await ipc.agent.execute({ sessionId: 'lens-analysis', nodeId: 'lens', prompt: ctx, model: 'flash-k2', context: LENS_PROMPT });
      const parsed = parseLensOutput(result.content);
      if (parsed.length > 0) {
        setSuggestions(parsed);
        setGreeting(`🔬 ${parsed.length} suggestion${parsed.length !== 1 ? 's' : ''} for ${activePanel.toUpperCase()}`);
      } else {
        setGreeting('🔬 No improvements found');
      }
    } catch (err) {
      setGreeting(`🔬 Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally { setAnalyzing(false); }
  };

  const confirmSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, confirmed: !s.confirmed } : s));
  }, []);

  const copyAsPrompt = useCallback((s: LensSuggestion) => {
    navigator.clipboard?.writeText(buildPromptText(s, activePanel));
  }, [activePanel]);

  const sendToArchitect = useCallback((id: string) => {
    setSuggestions(prev => prev.map(s => {
      if (s.id !== id) return s;
      const restart = classifyRestart(s.target);
      return { ...s, pipelineStatus: 'queued', restartLevel: restart };
    }));
  }, []);

  const sendAllConfirmed = useCallback(() => {
    const confirmed = suggestions.filter(s => s.confirmed && !s.pipelineStatus);
    const sorted = [...confirmed].sort((a, b) => b.score - a.score);
    sorted.forEach(s => {
      setSuggestions(prev => prev.map(p => p.id === s.id ? { ...p, pipelineStatus: 'queued', restartLevel: classifyRestart(p.target) } : p));
    });
  }, [suggestions]);

  const confirmedCount = suggestions.filter(s => s.confirmed && !s.pipelineStatus).length;
  const SCORE_MAX = 35;
  const getBarColor = (score: number) => score >= 24 ? '#3dd68c' : score >= 18 ? '#f5a623' : '#888890';

  return (
    <div className="h-full flex flex-col" style={{ background: '#1e1e1e' }}>
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center gap-2 flex-shrink-0" style={{ borderColor: '#333', background: '#252526' }}>
        <span className="text-[14px]">🔬</span>
        <span className="text-[12px] font-semibold" style={{ color: '#cccccc' }}>ΛENS</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#1a1a1e', color: '#808080' }}>{activePanel.toUpperCase()}</span>
        <div className="flex-1" />
        <button onClick={runAnalysis} disabled={analyzing}
          className="px-2 py-0.5 rounded text-[10px] font-semibold disabled:opacity-40"
          style={{ background: '#569cd620', color: '#569cd6', border: '1px solid #569cd630' }}>
          {analyzing ? '...' : 'Analyze'}
        </button>
      </div>

      {/* Greeting + Batch Send */}
      <div className="px-3 py-1.5 text-[11px] border-b flex items-center gap-2" style={{ color: '#808080', borderColor: '#333' }}>
        <span className="flex-1">{greeting}</span>
        {confirmedCount >= 2 && (
          <button onClick={sendAllConfirmed}
            className="px-2 py-0.5 rounded text-[9px] font-semibold"
            style={{ background: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e30' }}>
            Send {confirmedCount} to Architect →
          </button>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-2">
        {suggestions.length === 0 && !analyzing && (
          <div className="text-center py-8 text-[11px] font-mono" style={{ color: '#6a9955' }}>// no suggestions</div>
        )}
        {suggestions.map((s, i) => (
          <div key={s.id} className="rounded-lg border p-2.5 group relative" style={{ borderColor: '#333', background: '#1a1a1e' }}>
            {/* Quick copy icon — top right */}
            <button onClick={() => navigator.clipboard?.writeText(`${s.title}\n${s.target}\n${s.rationale}`)}
              className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: '#808080' }} aria-label="Copy" title="Copy plain text">
              📋
            </button>

            {/* Title + Target */}
            <div className="flex items-center gap-1.5 mb-1.5 pr-5">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                style={{ background: s.confirmed ? '#22c55e20' : '#569cd620', color: s.confirmed ? '#22c55e' : '#569cd6' }}>
                {i + 1}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: '#e8e8ea' }}>{s.title}</span>
              <span className="text-[9px] font-mono ml-auto px-1.5 py-0.5 rounded" style={{ background: '#252526', color: '#808080' }}>{s.target}</span>
            </div>

            {/* Rationale */}
            <div className="text-[10px] leading-relaxed mb-2" style={{ color: '#888890' }}>{s.rationale.slice(0, 200)}</div>

            {/* Score bar */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: '#252526' }}>
                <div className="h-full rounded-full" style={{ width: `${(s.score / SCORE_MAX) * 100}%`, background: getBarColor(s.score) }} />
              </div>
              <span className="text-[10px] font-bold font-mono" style={{ color: getBarColor(s.score) }}>{s.score}/{SCORE_MAX}</span>
            </div>

            {/* Dimension dots */}
            <div className="grid grid-cols-7 gap-0.5 mb-2">
              {(Object.keys(s.dimensions) as Array<keyof typeof s.dimensions>).map(dim => (
                <div key={dim} className="text-center">
                  <div className="text-[7px] uppercase tracking-wider" style={{ color: '#555' }}>{DIM_LABELS[dim]}</div>
                  <div className="flex items-center justify-center gap-[1px]">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className="w-1 h-1 rounded-full" style={{ background: n <= s.dimensions[dim] ? getBarColor(s.score) : '#333' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Restart level */}
            {s.restartLevel && (
              <div className="text-[9px] font-mono mb-2 px-1.5 py-0.5 rounded" style={{ color: s.restartLevel.color, background: s.restartLevel.color + '15' }}>
                {s.restartLevel.icon} {s.restartLevel.label}
              </div>
            )}

            {/* Pipeline status */}
            {s.pipelineStatus && (
              <div className="text-[9px] font-mono mb-2" style={{ color: s.pipelineStatus === 'done' ? '#22c55e' : s.pipelineStatus === 'queued' ? '#808080' : '#f5a623' }}>
                PIPELINE: {s.pipelineStatus === 'queued' ? '◉ QUEUED' : s.pipelineStatus === 'planning' ? '◉ PLANNING' : s.pipelineStatus === 'executing' ? '◉ EXECUTING' : '✓ DONE'}
              </div>
            )}

            {/* Action buttons row 1 */}
            <div className="flex gap-1 mb-1.5">
              <button onClick={() => confirmSuggestion(s.id)}
                className="flex-1 py-1 rounded text-[9px] font-semibold"
                style={{ background: s.confirmed ? '#22c55e20' : '#22c55e10', color: s.confirmed ? '#22c55e' : '#22c55e80', border: `1px solid ${s.confirmed ? '#22c55e40' : '#22c55e20'}` }}>
                {s.confirmed ? '✓ Confirmed' : 'Confirm'}
              </button>
              <button onClick={() => setSuggestions(prev => prev.filter(sg => sg.id !== s.id))}
                className="flex-1 py-1 rounded text-[9px] font-semibold"
                style={{ background: '#ef444410', color: '#ef444480', border: '1px solid #ef444420' }}>
                ✕ Reject
              </button>
            </div>

            {/* Action buttons row 2 */}
            <div className="flex gap-1">
              <button onClick={() => copyAsPrompt(s)}
                className="flex-1 py-1 rounded text-[9px] font-semibold"
                style={{ background: '#569cd610', color: '#569cd6', border: '1px solid #569cd620' }}>
                📋 Copy as Prompt
              </button>
              <button onClick={() => sendToArchitect(s.id)} disabled={!!s.pipelineStatus}
                className="flex-1 py-1 rounded text-[9px] font-semibold disabled:opacity-30"
                style={{ background: '#f5a62310', color: '#f5a623', border: '1px solid #f5a62320' }}>
                → Architect
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
