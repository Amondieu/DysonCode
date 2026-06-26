import React, { useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export default function VaultNode({ data }: NodeProps) {
  const persistedData = useMemo(
    () => ((data.persistedData as Record<string, unknown> | undefined) ?? {}),
    [data.persistedData],
  );
  const tags = Array.isArray(persistedData.tags) ? persistedData.tags : [];

  return (
    <div className="min-w-[220px] rounded-lg border border-amber-500/30 bg-slate-950/95 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]">
      <div className="flex items-center justify-between border-b border-amber-500/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-300">
        <span>Vault</span>
        <span className="text-amber-100">Context</span>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs text-slate-200">
        <div className="font-semibold text-sm text-white">{String(data.nodeLabel || persistedData.label || 'Prompt Vault')}</div>
        <div className="flex flex-wrap gap-1">
          {tags.length === 0 && <span className="text-slate-500">No tags yet</span>}
          {tags.map((tag) => (
            <span key={String(tag)} className="rounded-full border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-100">
              {String(tag)}
            </span>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-amber-400" />
    </div>
  );
}