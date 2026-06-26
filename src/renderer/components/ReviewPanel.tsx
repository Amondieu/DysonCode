import React from 'react';
import { useAppStore, type MissionControlSnapshot } from '../store/appStore';

function computeRCScore(mc: NonNullable<MissionControlSnapshot>): {
  score: number;
  badges: { rc: number; label: string; met: boolean; detail: string }[];
  verdict: 'success' | 'partial' | 'blocked';
} {
  const hasFiles = mc.stream.entries.some((e) => e.includes('file') || e.includes('write') || e.includes('changed'));
  const built = mc.road.completed_nodes > 0;
  const testsPass = mc.stream.entries.some((e) => e.includes('ok') || e.includes('passed'));
  const hasConstraints = mc.constraint.active_constraints.length > 0;
  const selfComplete = mc.self_completion_rate > 0.5;
  const hasScore = mc.score.total > 0;
  const hasOutcome = mc.score.outcome !== null;

  const badges = [
    { rc: 1, label: 'Active Tension', met: built, detail: built ? `Built ${mc.road.completed_nodes} nodes` : 'No nodes built' },
    { rc: 2, label: 'Reproduction Cost', met: built, detail: built ? 'Instantiable' : 'Not yet' },
    { rc: 3, label: 'Expands Space', met: hasFiles, detail: hasFiles ? 'Files written' : 'No file changes' },
    { rc: 4, label: 'Teaching', met: hasConstraints || hasScore, detail: hasConstraints ? `${mc.constraint.active_constraints.length} constraints` : 'No constraints' },
    { rc: 5, label: 'Contradiction', met: hasConstraints, detail: hasConstraints ? 'Seeds successor' : 'No tension seeded' },
    { rc: 6, label: 'Compression', met: selfComplete, detail: selfComplete ? 'Self-completing' : `Rate: ${(mc.self_completion_rate * 100).toFixed(0)}%` },
    { rc: 7, label: 'Substrate-Indep', met: hasOutcome && mc.score.total > 0, detail: hasOutcome ? `Outcome: ${mc.score.outcome}` : 'Not scored' },
  ];

  const met = badges.filter((b) => b.met).length;
  const score = Math.round((met / 7) * 10 * 10) / 10;
  const verdict = met >= 5 ? 'success' : met >= 3 ? 'partial' : 'blocked';
  return { score, badges, verdict };
}

export default function ReviewPanel() {
  const { missionControl, blueprintDraft } = useAppStore() as any;
  const mc = missionControl;

  if (!mc) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0e0e10]">
        <div className="text-center">
          <span className="text-4xl block mb-2">🔍</span>
          <p className="text-[#888890] text-sm">No execution data yet</p>
          <p className="text-[#555560] text-[11px] mt-1">Run a build in Execute mode to see the review</p>
        </div>
      </div>
    );
  }

  const rc = computeRCScore(mc);
  const entries = mc.stream?.entries || [];
  const fileEntries = entries.filter((e: string) =>
    /file|write|changed|created/i.test(e)
  );

  return (
    <div className="h-full flex flex-col bg-[#0e0e10] overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-8 bg-[#141416] border-b border-[rgba(255,255,255,0.07)] px-3 flex-shrink-0">
        <span className="text-[12px] font-semibold text-[#4fc4cf]">🔍 Review</span>
        <span className="ml-2 text-[11px] text-[#888890]">
          {mc.road?.completed_nodes || 0}/{mc.road?.total_nodes || 0} nodes
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Outcome Card */}
        <div
          className={`rounded-xl border px-3 py-2.5 ${
            rc.verdict === 'success'
              ? 'bg-[rgba(61,214,140,0.06)] border-[rgba(61,214,140,0.2)]'
              : rc.verdict === 'partial'
                ? 'bg-[rgba(245,166,35,0.06)] border-[rgba(245,166,35,0.2)]'
                : 'bg-[rgba(255,107,107,0.06)] border-[rgba(255,107,107,0.2)]'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px]">
              {rc.verdict === 'success' ? '✅' : rc.verdict === 'partial' ? '⚠️' : '❌'}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{
              color: rc.verdict === 'success' ? '#3dd68c' : rc.verdict === 'partial' ? '#f5a623' : '#ff6b6b',
            }}>
              {rc.verdict === 'success' ? 'Ship Ready' : rc.verdict === 'partial' ? 'Needs Review' : 'Blocked'}
            </span>
            <span className="ml-auto text-[11px] font-bold" style={{
              color: rc.score >= 7 ? '#3dd68c' : rc.score >= 4 ? '#f5a623' : '#ff6b6b',
            }}>
              RC {rc.score}/10
            </span>
          </div>
          <p className="text-[11px] text-[#888890]">
            {rc.verdict === 'success'
              ? 'All gates passed. Ready to ship.'
              : rc.verdict === 'partial'
                ? `${7 - rc.badges.filter(b => b.met).length} ratchet conditions unmet. Review recommended.`
                : 'Critical gates failed. Re-plan required.'}
          </p>
        </div>

        {/* RC Score Card */}
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-2">Ratchet Score</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {rc.badges.map((b) => (
              <span
                key={b.rc}
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  b.met
                    ? 'bg-[rgba(61,214,140,0.1)] text-[#3dd68c] border-[rgba(61,214,140,0.2)]'
                    : 'bg-[rgba(245,166,35,0.1)] text-[#f5a623] border-[rgba(245,166,35,0.2)]'
                }`}
                title={b.detail}
              >
                RC{b.rc} {b.met ? '✓' : '?'}
              </span>
            ))}
          </div>
          {rc.badges.map((b) => (
            <div key={b.rc} className="flex items-center gap-2 py-0.5 text-[11px]">
              <span className={b.met ? 'text-[#3dd68c]' : 'text-[#f5a623]'}>{b.met ? '✓' : '○'}</span>
              <span className="text-[#c8c8d0]">{b.label}</span>
              <span className="ml-auto text-[#555560]">{b.detail}</span>
            </div>
          ))}
        </div>

        {/* File Delta */}
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-2">Files Changed</div>
          {fileEntries.length === 0 ? (
            <div className="text-[11px] text-[#555560]">No file changes detected</div>
          ) : (
            <div className="space-y-1">
              {fileEntries.map((entry: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-[#c8c8d0]">
                  <span className="text-[#3dd68c]">📁</span>
                  <span className="font-mono">{entry}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stream log */}
        <div className="bg-[#141416] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#888890] mb-2">Execution Log</div>
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {entries.length === 0 ? (
              <div className="text-[11px] text-[#555560]">No events recorded</div>
            ) : (
              entries.slice(-30).map((entry: string, i: number) => (
                <div key={i} className="text-[10px] text-[#555560] font-mono">{entry}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
