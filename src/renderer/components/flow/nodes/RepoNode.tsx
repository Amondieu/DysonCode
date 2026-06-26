import React, { useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export default function RepoNode({ data }: NodeProps) {
  const persistedData = useMemo(
    () => ((data.persistedData as Record<string, unknown> | undefined) ?? {}),
    [data.persistedData],
  );

  return (
    <div className="min-w-[260px] rounded-lg border border-emerald-500/30 bg-slate-950/95 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
      <div className="flex items-center justify-between border-b border-emerald-500/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300">
        <span>Repo</span>
        <span className="text-emerald-100">Self Host</span>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs text-slate-200">
        <div className="font-semibold text-sm text-white">{String(data.nodeLabel || persistedData.label || 'Current Workspace')}</div>
        <div className="break-all text-slate-400">{String(persistedData.path || '.')}</div>
        <div className="rounded border border-emerald-500/15 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-100">
          {String(persistedData.intent || 'Dogfood autonomic workflow on DysonCode')}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-emerald-400" />
    </div>
  );
}