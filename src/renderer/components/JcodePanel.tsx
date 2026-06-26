import React, { useState, useRef, useEffect, useCallback } from 'react';
import { parseDSML, runTool, ToolCall } from '../utils/dsml-parser';
import { callLLM } from '../utils/callLLM';
import { JCODE_SYSTEM_PROMPT } from '../../jcode/systemPrompt';

// ── Kore pipeline & memory helpers ──────────────────────────────────────────
const mem = () => (window as any).memory;
const pipe = () => (window as any).pipeline;

// ── Safe UUID generator (crypto.randomUUID not available in all Electron contexts) ──
function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  // Fallback: timestamp + random
  return 'j' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// ── Types ──────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'assistant' | 'tool-group';

interface ToolExecution {
  call: ToolCall;
  status: 'running' | 'done' | 'error';
  result: string;
  durationMs?: number;
}

interface Message {
  id: string;
  role: MessageRole;
  content?: string;
  tools?: ToolExecution[];
  isThinking?: boolean;
  isFinal?: boolean;
  timestamp: number;
}

// ── Tool Badge ──────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📄', write: '✏️', shell: '⚡', list: '📁',
  search: '🔍', default: '🔧'
};

function ToolBadge({ exec }: { exec: ToolExecution }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[exec.call.name] || TOOL_ICONS.default;
  const label = exec.call.params.filePath
    || exec.call.params.command
    || exec.call.params.path
    || exec.call.params.cmd
    || '';
  const shortLabel = label.length > 48 ? '…' + label.slice(-45) : label;

  return (
    <div
      onClick={() => exec.status !== 'running' && setExpanded(e => !e)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '5px 10px',
        margin: '2px 0',
        borderRadius: '6px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${
          exec.status === 'running' ? 'var(--color-gold)' :
          exec.status === 'error'   ? 'var(--color-error)' :
                                      'var(--color-success)'
        }`,
        cursor: exec.status !== 'running' ? 'pointer' : 'default',
        transition: 'all 150ms ease',
        fontFamily: 'monospace',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {exec.status === 'running' ? (
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
        ) : (
          <span>{exec.status === 'done' ? '✓' : '✗'}</span>
        )}
        <span style={{ opacity: 0.7 }}>{icon} {exec.call.name}</span>
        <span style={{ color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortLabel}
        </span>
        {exec.durationMs != null && (
          <span style={{ color: 'var(--color-text-faint)', fontSize: '11px' }}>
            {exec.durationMs}ms
          </span>
        )}
        {exec.status !== 'running' && (
          <span style={{ color: 'var(--color-text-faint)', fontSize: '10px' }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>
      {expanded && exec.result && (
        <pre style={{
          marginTop: '6px',
          padding: '6px 8px',
          background: 'var(--color-bg)',
          borderRadius: '4px',
          fontSize: '11px',
          color: exec.status === 'error' ? 'var(--color-error)' : 'var(--color-text-muted)',
          maxHeight: '200px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {exec.result.slice(0, 2000)}{exec.result.length > 2000 ? '\n[truncated]' : ''}
        </pre>
      )}
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
        <div style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: '14px 14px 4px 14px',
          background: 'var(--color-primary)',
          color: 'var(--color-text-inverse)',
          fontSize: '14px',
          lineHeight: 1.5,
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.role === 'tool-group') {
    return (
      <div style={{ margin: '6px 0 6px 0' }}>
        {msg.tools?.map((exec, i) => (
          <ToolBadge key={i} exec={exec} />
        ))}
      </div>
    );
  }

  // Assistant message — thinking or final
  if (msg.isThinking) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        margin: '4px 0',
        opacity: 0.6,
      }}>
        <span style={{ fontSize: '12px', marginTop: '2px' }}>🧠</span>
        <div style={{
          fontSize: '13px',
          color: 'var(--color-text-muted)',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Final clean result
  return (
    <div style={{ margin: '12px 0 4px 0' }}>
      <div style={{
        padding: '12px 16px',
        borderRadius: '4px 14px 14px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'var(--color-text)',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
      </div>
    </div>
  );
}

// ── Thinking Indicator ──────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0', opacity: 0.5 }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: 'var(--color-text-muted)',
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Jcode is working…</span>
    </div>
  );
}

// ── Main JcodePanel ─────────────────────────────────────────────────────────

// ── Internal error boundary ────────────────────────────────────────────────
class JcodeInternalBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: '' }; }
  static getDerivedStateFromError(e: Error) { return { hasError: true, error: e.message }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>Jcode encountered an error</div>
          <pre style={{ fontSize: '11px', color: 'var(--color-error)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.slice(0, 400)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function JcodePanelInner() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [history, setHistory] = useState<{role: string, content: string}[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom whenever messages update
  // Use parentElement scrollTop instead of scrollIntoView to avoid scrolling
  // the Electron viewport (scrollIntoView propagates up the DOM tree).
  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const full: Message = { ...msg, id: uid(), timestamp: Date.now() };
    setMessages(prev => [...prev, full]);
    return full.id;
  }, []);

  const updateToolGroup = useCallback((groupId: string, exec: ToolExecution) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== groupId) return m;
      const existing = m.tools?.find(t =>
        t.call.name === exec.call.name &&
        JSON.stringify(t.call.params) === JSON.stringify(exec.call.params) &&
        t.status === 'running'
      );
      if (existing) {
        return { ...m, tools: m.tools?.map(t => t === existing ? exec : t) };
      }
      return { ...m, tools: [...(m.tools || []), exec] };
    }));
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isWorking) return;
    setInput('');
    setIsWorking(true);

    addMessage({ role: 'user', content: text });

    const userMsg = { role: 'user', content: text };
    let ctx: { role: string; content: string }[] = [
      { role: 'system', content: JCODE_SYSTEM_PROMPT },
      ...history,
      userMsg
    ];

    // ── Load memory context for this session ──
    const sessionId = 'jcode-' + Date.now().toString(36);
    try {
      const m = mem();
      if (m?.getContext) {
        const ctxResult = await m.getContext(sessionId);
        if (ctxResult.ok && ctxResult.nodes?.length) {
          const memoryCtx = ctxResult.nodes.map((n: any) =>
            `[${n.kind} (${n.temperature})]: ${n.content.slice(0, 500)}`
          ).join('\n');
          ctx.push({ role: 'system', content: `Session memory:\n${memoryCtx}` });
        }
      }
    } catch {}

    // ── Optional PreCheck badge ──
    try {
      const p = pipe();
      if (p?.precheck) {
        const result = await p.precheck({ text });
        if (result.ok) {
          addMessage({
            role: 'tool-group',
            tools: [{
              call: { name: 'precheck', params: {} },
              status: result.passed ? 'done' as const : 'error' as const,
              result: result.passed
                ? 'PreCheck passed — all invariant gates clear.'
                : 'PreCheck found issues: ' + JSON.stringify(result.gates),
            }]
          });
        }
      }
    } catch {}

    try {
      for (let round = 0; round < 12; round++) {
        const raw: string = await callLLM(ctx);
        const { text: visText, calls } = parseDSML(raw);

        if (calls.length === 0) {
          // Final clean response
          addMessage({ role: 'assistant', content: visText, isFinal: true });
          setHistory(prev => [...prev, userMsg, { role: 'assistant', content: visText }]);
          break;
        }

        // Show brief thinking text if present before tools
        if (visText) {
          addMessage({ role: 'assistant', content: visText, isThinking: true });
        }

        // Create tool group for this round
        const groupId = addMessage({
          role: 'tool-group',
          tools: calls.map(c => ({ call: c, status: 'running' as const, result: '' }))
        });

        // Execute all tools, update badges as they complete
        const results = await Promise.all(
          calls.map(async (call) => {
            const start = Date.now();
            try {
              const result = await runTool(call);
              const durationMs = Date.now() - start;
              updateToolGroup(groupId, { call, status: 'done', result, durationMs });
              return result;
            } catch (e) {
              const result = `ERROR: ${(e as Error).message}`;
              updateToolGroup(groupId, { call, status: 'error', result });
              return result;
            }
          })
        );

        // Store in memory (fire-and-forget)
        try {
          const m = mem();
          if (m?.store) {
            m.store(sessionId, 'turn', `User: ${text.slice(0, 200)}`);
            m.store(sessionId, 'observation', results.map(r => r.slice(0, 200)).join('\n').slice(0, 500));
          }
        } catch {}

        // Feed results back to LLM
        ctx = [
          ...ctx,
          { role: 'assistant', content: raw },
          { role: 'user', content: `Tool results:\n${results.join('\n---\n')}` }
        ];
      }

      // ── Optional Pipeline badge after completion ──
      try {
        const p = pipe();
        if (p?.run) {
          const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
          const pipelineInput = [text, lastAssistant?.content].filter(Boolean).join('\n');
          const result = await p.run({ text: pipelineInput });
          if (result.ok && result.stages?.length) {
            const pipelineTools = result.stages.map((s: any) => ({
              call: { name: s.name, params: {} },
              status: (s.passed ? 'done' : 'error') as 'done' | 'error',
              result: `Score: ${s.score} | ${s.details}`,
            }));
            addMessage({ role: 'tool-group', tools: pipelineTools });
          }
        }
      } catch {}
    } finally {
      setIsWorking(false);
      inputRef.current?.focus();
    }
  }, [input, isWorking, history, addMessage, updateToolGroup]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--color-bg)',
    }}>
      {/* Message list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-faint)',
            fontSize: '14px',
            gap: '8px',
          }}>
            <div style={{ fontSize: '28px' }}>◈</div>
            <div>Jcode — autonomous coding agent</div>
            <div style={{ fontSize: '12px' }}>Type a task. It will be executed, not planned.</div>
          </div>
        )}

        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {isWorking && <ThinkingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        borderTop: '1px solid var(--color-border)',
        padding: '12px 16px',
        background: 'var(--color-surface)',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Give Jcode a task to execute…"
          disabled={isWorking}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '10px 12px',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontSize: '14px',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            outline: 'none',
            maxHeight: '160px',
            overflowY: 'auto',
            transition: 'border-color 150ms ease',
          }}
          onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-primary)'}
          onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-border)'}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 160) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={isWorking || !input.trim()}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: isWorking || !input.trim() ? 'var(--color-surface-offset)' : 'var(--color-primary)',
            color: isWorking || !input.trim() ? 'var(--color-text-faint)' : 'white',
            border: 'none',
            cursor: isWorking || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            transition: 'all 150ms ease',
            flexShrink: 0,
          }}
        >
          {isWorking ? '⟳' : '↑'}
        </button>
      </div>
    </div>
  );
}

export function JcodePanel() {
  return (
    <JcodeInternalBoundary>
      <JcodePanelInner />
    </JcodeInternalBoundary>
  );
}
