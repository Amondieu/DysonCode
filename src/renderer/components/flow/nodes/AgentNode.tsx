import React, { useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useAppStore, type CognitiveNodeFields } from '../../../store/appStore';
import { MODULE_REGISTRY } from '../../../data/module-registry';

type AgentStatus = 'idle' | 'running' | 'done' | 'error';

function statusDot(status: AgentStatus) {
  return {
    idle: '⚫',
    running: '🔵',
    done: '🟢',
    error: '🔴',
  }[status];
}

export default function AgentNode({ id, data }: NodeProps) {
  const { updateNode } = useAppStore();
  const persistedData = useMemo(
    () => ((data.persistedData as Record<string, unknown> | undefined) ?? {}),
    [data.persistedData],
  );

  const [status, setStatus] = useState<AgentStatus>(
    (persistedData.lastStatus as AgentStatus | undefined) ?? 'idle',
  );
  const [output, setOutput] = useState(String(persistedData.lastOutput || ''));

  const label = String(data.nodeLabel || persistedData.label || 'Autonomic Agent');
  const model = String(persistedData.model || 'local-placeholder');
  const prompt = String(persistedData.prompt || persistedData.objective || '');
  const upstreamContext = String(data.upstreamContext || '');
  const sessionId = String(data.sessionId || '');

  // ── Cognitive fields ──
  const frame = String(persistedData.frame || '');
  const role = String(persistedData.role || '');
  const moduleId = String(persistedData.moduleId || '');
  const moduleDef = moduleId ? MODULE_REGISTRY.find((m) => m.id === moduleId) : undefined;
  const icon = moduleDef?.icon || '🤖';
  const accentColor = moduleDef?.color || '#6c8cf8';

  const persist = async (patch: Record<string, unknown>) => {
    await updateNode({
      nodeId: id,
      data: {
        ...persistedData,
        ...patch,
      },
      label,
    });
  };

  const executeAgent = async () => {
    if (!sessionId) {
      setStatus('error');
      setOutput('Missing session id');
      return;
    }

    const startedAt = Date.now();
    setStatus('running');
    setOutput('');

    try {
      const result = await window.dyson.agent.execute({
        sessionId,
        nodeId: id,
        prompt,
        model,
        context: upstreamContext,
      });

      setStatus('done');
      setOutput(result.content);

      await persist({
        lastStatus: 'done',
        lastOutput: result.content,
        lastRunAt: new Date().toISOString(),
      });

      await window.dyson.graph.logExecution({
        sessionId,
        nodeId: id,
        input: prompt,
        output: result.content,
        status: 'done',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus('error');
      setOutput(message);

      await persist({
        lastStatus: 'error',
        lastOutput: message,
        lastRunAt: new Date().toISOString(),
      });

      await window.dyson.graph.logExecution({
        sessionId,
        nodeId: id,
        input: prompt,
        output: message,
        status: 'error',
        durationMs: Date.now() - startedAt,
      });
    }
  };

  return (
    <div className="min-w-[220px] rounded-lg border border-[rgba(255,255,255,0.06)] bg-slate-950/95 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      <Handle type="target" position={Position.Left} className="!h-4 !w-4 !border-2 !border-slate-950 !bg-cyan-400" />

      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">{icon}</span>
          <span className="text-[12px] font-semibold text-[#e8e8ea] truncate">{label}</span>
          {frame && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
              style={{ backgroundColor: accentColor + '20', color: accentColor, border: `1px solid ${accentColor}40` }}
            >
              {frame}
            </span>
          )}
          {role && !frame && (
            <span className="px-1.5 py-0.5 rounded bg-[#1a1a1e] text-[9px] text-[#888890] uppercase flex-shrink-0">
              {role}
            </span>
          )}
          <span className="text-[10px]">{statusDot(status)}</span>
        </div>
        <button
          onClick={executeAgent}
          disabled={status === 'running'}
          className="rounded border border-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
        >
          {status === 'running' ? 'Running...' : 'Run'}
        </button>
      </div>

      <div className="space-y-3 px-3 py-3 text-xs text-slate-200">
        <div>
          <div className="font-semibold text-sm text-white">{label}</div>
          <div className="mt-1 rounded border border-cyan-500/15 bg-cyan-500/5 px-2 py-1 text-[11px] text-cyan-100">
            {model}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">Prompt</div>
          <textarea
            value={prompt}
            onChange={(event) => {
              void persist({ prompt: event.target.value });
            }}
            rows={4}
            className="w-full resize-none rounded border border-slate-800 bg-slate-900 px-2 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/40"
            placeholder="Prompt for this agent node..."
          />
        </div>

        {upstreamContext && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">Upstream Context</div>
            <div className="max-h-24 overflow-y-auto rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-300 whitespace-pre-wrap">
              {upstreamContext}
            </div>
          </div>
        )}

        {output && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">Output</div>
            <pre className="max-h-36 overflow-y-auto rounded border border-slate-800 bg-slate-900 px-2 py-2 text-[11px] text-slate-200 whitespace-pre-wrap">
              {output.slice(0, 1000)}
            </pre>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-cyan-400" />
    </div>
  );
}