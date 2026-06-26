import React, { useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useAppStore } from '../../../store/appStore';

export default function TestNode({ id, data }: NodeProps) {
  const { updateNode } = useAppStore();
  const persistedData = useMemo(
    () => ((data.persistedData as Record<string, unknown> | undefined) ?? {}),
    [data.persistedData],
  );

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ pass: number; fail: number; output: string } | null>(
    typeof persistedData.lastResult === 'object' && persistedData.lastResult
      ? persistedData.lastResult as { pass: number; fail: number; output: string }
      : null,
  );

  const sessionId = String(data.sessionId || '');
  const repoPath = String(persistedData.repoPath || data.repoPath || '.');
  const runner = String(persistedData.runner || 'npm.cmd run build');
  const label = String(data.nodeLabel || persistedData.label || 'Repository Checks');

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

  const runTests = async () => {
    if (!sessionId) {
      return;
    }

    setRunning(true);
    try {
      const out = await window.dyson.shell.exec({ cwd: repoPath, cmd: runner });
      const combined = [out.stdout, out.stderr].filter(Boolean).join('\n');
      const pass = (combined.match(/(test .* ok|passing|passed)/gi) ?? []).length;
      const fail = (combined.match(/(FAILED|failing|failed|error)/gi) ?? []).length;
      const nextResult = {
        pass,
        fail: out.exitCode !== 0 ? Math.max(fail, 1) : fail,
        output: combined.slice(-1000),
      };

      setResult(nextResult);

      await persist({
        lastStatus: fail > 0 ? 'error' : 'done',
        lastResult: nextResult,
        lastOutput: combined,
        lastRunAt: new Date().toISOString(),
      });

      await window.dyson.graph.logExecution({
        sessionId,
        nodeId: id,
        input: runner,
        output: combined,
        status: out.exitCode !== 0 || fail > 0 ? 'error' : 'done',
        durationMs: out.durationMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResult({ pass: 0, fail: 1, output: message });

      await persist({
        lastStatus: 'error',
        lastResult: { pass: 0, fail: 1, output: message },
        lastOutput: message,
        lastRunAt: new Date().toISOString(),
      });

      await window.dyson.graph.logExecution({
        sessionId,
        nodeId: id,
        input: runner,
        output: message,
        status: 'error',
        durationMs: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-w-[260px] rounded-lg border border-fuchsia-500/30 bg-slate-950/95 shadow-[0_0_0_1px_rgba(217,70,239,0.08)]">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-fuchsia-400" />
      <div className="flex items-center justify-between border-b border-fuchsia-500/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-fuchsia-300">
        <span>Test</span>
        <button
          onClick={runTests}
          disabled={running}
          className="rounded border border-fuchsia-500/20 px-2 py-0.5 text-[10px] text-fuchsia-100 hover:bg-fuchsia-500/10 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      <div className="space-y-3 px-3 py-3 text-xs text-slate-200">
        <div className="font-semibold text-sm text-white">{label}</div>

        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">Command</div>
          <input
            value={runner}
            onChange={(event) => {
              void persist({ runner: event.target.value, repoPath });
            }}
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-2 text-xs text-slate-200 outline-none focus:border-fuchsia-500/40"
          />
        </div>

        <div className="rounded border border-fuchsia-500/15 bg-fuchsia-500/5 px-2 py-1 text-[11px] text-fuchsia-100 break-all">
          {repoPath}
        </div>

        {result && (
          <div className={`rounded border px-2 py-2 text-[11px] ${result.fail > 0 ? 'border-red-500/20 bg-red-500/5 text-red-100' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100'}`}>
            <div className="mb-1">pass {result.pass} | fail {result.fail}</div>
            <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap text-slate-200">
              {result.output}
            </pre>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-fuchsia-400" />
    </div>
  );
}