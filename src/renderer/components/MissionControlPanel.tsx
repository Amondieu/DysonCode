import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useIpc } from '../hooks/useIpc';

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-mono text-dyson-muted">
      <span>{label}</span>
      <span className="text-dyson-text">{value}</span>
    </div>
  );
}

export default function MissionControlPanel() {
  const ipc = useIpc();
  const {
    repoPath,
    missionControl,
    missionControlStatus,
    missionControlSpec,
    setMissionControlSpec,
  } = useAppStore();
  const [running, setRunning] = useState(false);

  const startRun = async () => {
    setRunning(true);
    try {
      await ipc.startMissionControl(
        missionControlSpec,
        repoPath || '.',
        3,
        false
      );
    } finally {
      setRunning(false);
    }
  };

  const stopRun = async () => {
    await ipc.stopMissionControl();
  };

  const channels = missionControl?.stream.channels || { role: [], tool: [], system: [] };

  return (
    <div className="h-full flex flex-col bg-dyson-bg">
      <div className="flex items-center justify-between h-10 px-4 border-b border-dyson-border bg-dyson-panel">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-dyson-text">Mission Control</span>
          <span className={`text-xs font-mono ${missionControlStatus.state === 'error' ? 'text-red-400' : missionControlStatus.state === 'running' ? 'text-dyson-green' : 'text-dyson-muted'}`}>
            {missionControlStatus.state}
          </span>
          <span className="text-xs text-dyson-muted">{missionControlStatus.message}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startRun}
            disabled={running}
            className="px-3 py-1 text-xs rounded bg-dyson-accent text-white hover:opacity-80 disabled:opacity-40"
          >
            Run
          </button>
          <button
            onClick={stopRun}
            className="px-3 py-1 text-xs rounded border border-dyson-border text-dyson-text hover:bg-dyson-border"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-4 p-4 flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col gap-4 min-h-0">
          <section className="bg-dyson-panel border border-dyson-border rounded p-3">
            <div className="text-xs uppercase tracking-wide text-dyson-muted mb-2">Spec</div>
            <textarea
              value={missionControlSpec}
              onChange={(e) => setMissionControlSpec(e.target.value)}
              className="w-full h-32 resize-none text-xs bg-dyson-bg border border-dyson-border rounded px-3 py-2 text-dyson-text font-mono outline-none focus:border-dyson-accent"
            />
          </section>

          <section className="bg-dyson-panel border border-dyson-border rounded p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-dyson-muted">Road</div>
            <MetricRow label="node" value={missionControl?.road.current_node || '-'} />
            <MetricRow label="state" value={missionControl?.road.node_state || 'IDLE'} />
            <MetricRow
              label="progress"
              value={`${missionControl?.road.completed_nodes || 0}/${missionControl?.road.total_nodes || 0}`}
            />
          </section>

          <section className="bg-dyson-panel border border-dyson-border rounded p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-dyson-muted">Score</div>
            <MetricRow label="total" value={(missionControl?.score.total || 0).toFixed(3)} />
            <MetricRow label="outcome" value={missionControl?.score.outcome || '-'} />
            <MetricRow
              label="self-completion"
              value={`${((missionControl?.self_completion_rate || 0) * 100).toFixed(0)}%`}
            />
            <div className="pt-2 space-y-1">
              {Object.entries(missionControl?.score.pillars || {}).map(([key, value]) => (
                <MetricRow key={key} label={key} value={value.toFixed(2)} />
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          {(['system', 'role', 'tool'] as const).map((channel) => (
            <section key={channel} className="bg-dyson-panel border border-dyson-border rounded p-3 flex flex-col min-h-0">
              <div className="text-xs uppercase tracking-wide text-dyson-muted mb-2">{channel}</div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {(channels[channel] || []).length === 0 && (
                  <div className="text-xs text-dyson-muted font-mono">No events</div>
                )}
                {(channels[channel] || []).map((entry, index) => (
                  <div key={`${channel}-${index}`} className="text-xs text-dyson-text font-mono border-b border-dyson-border/50 pb-2">
                    {entry}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}