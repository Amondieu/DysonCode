// src/renderer/components/ChatPanel/ChatPanel.tsx
// P1.3 — HeadroomBar wired into header | P4.9 — AUDIT mode single-pass enforcement

import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { useChatStream } from './useChatStream';
import { useChatIpc } from './useChatIpc';
import { RepoDropdown } from '../RepoDropdown';
import { HeadroomBar, MODE_BUDGETS } from './HeadroomBar';
import { DysonFrameModulator } from '../DysonFrameModulator';

// Read LLM API config from the exposed environment
// The LiteLLM proxy is used as the primary endpoint for frame transformations
const API_BASE_URL = (window as any).dyson?.env?.LITELLM_BASE_URL
  || (window as any).env?.LITELLM_BASE_URL
  || 'http://127.0.0.1:4000/v1';
const API_KEY = (window as any).dyson?.env?.LITELLM_API_KEY
  || (window as any).env?.LITELLM_API_KEY
  || 'grey-os-local';
// Use the same agent model that jcode uses for transforms
const FRAME_MODEL = (window as any).dyson?.env?.KORE_AGENT_MODEL
  || (window as any).env?.KORE_AGENT_MODEL
  || 'flash-k2';
// Cloud fallback for when proxy is not available
const CLOUD_API_URL = (window as any).dyson?.env?.KORE_CLOUD_API_URL
  || (window as any).env?.KORE_CLOUD_API_URL
  || 'https://api.deepseek.com/v1';
const CLOUD_API_KEY = (window as any).dyson?.env?.KORE_CLOUD_API_KEY
  || (window as any).env?.KORE_CLOUD_API_KEY
  || '';
const CLOUD_API_MODEL = (window as any).dyson?.env?.KORE_CLOUD_API_MODEL
  || (window as any).env?.KORE_CLOUD_API_MODEL
  || 'deepseek-chat';

const MODES = ['fast', 'balanced', 'deep', 'audit', 'inventor', 'stealth'] as const;
type Mode = typeof MODES[number];

export function ChatPanel() {
  const { messages, busy, dispatch } = useChatStream();
  const { send, cancel, reset } = useChatIpc(dispatch);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // P1.3: Mode + token tracking for HeadroomBar
  const [currentMode, setCurrentMode] = useState<Mode>('balanced');
  const [tokenState, setTokenState] = useState({ used: 0 });

  // P4.9: AUDIT mode single-pass enforcement
  const auditPassCount = useRef(0);
  const auditSessionActive = useRef(false);

  const handleModeChange = useCallback((newMode: Mode) => {
    // P4.9: Block second AUDIT pass
    if (newMode === 'audit') {
      if (auditSessionActive.current && auditPassCount.current >= 1) {
        alert('AUDIT mode is single-pass. Start a new session for a second audit domain.');
        return;
      }
      auditSessionActive.current = true;
      auditPassCount.current++;
    }
    if (currentMode === 'audit' && newMode !== 'audit') {
      auditPassCount.current = 0;
      auditSessionActive.current = false;
    }
    setCurrentMode(newMode);
    setTokenState({ used: 0 });
  }, [currentMode]);

  // B4: Keyboard shortcuts — Escape to cancel, Ctrl+K to focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busy) {
        e.preventDefault();
        cancel();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy, cancel]);

  // Collapse toggle
  const handleToggleCollapse = useCallback((msgId: string) => {
    dispatch({ type: 'TOGGLE_COLLAPSE', msgId });
  }, [dispatch]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    // Interrupt-and-send: if busy (streaming in progress), cancel first
    if (busy) {
      cancel(); // aborts current jcode stream with [⚡ Aborted] marker
    }

    setInput('');

    // P1.3: Track outgoing user message tokens
    setTokenState(prev => ({ used: prev.used + Math.ceil(text.length / 4) }));

    // Add user message to chat history
    const userMsgId = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dispatch({ type: 'MSG_START', id: userMsgId, role: 'user' });
    dispatch({ type: 'TOKEN', id: userMsgId, token: text });
    dispatch({ type: 'MSG_END', id: userMsgId });

    // Send to jcode — use flash-k2 as model (jcode model name), NOT the UI mode name
    send(text);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input, busy, send, cancel, dispatch, currentMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="chat-scanlines"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--jcode-bg, #0b0c0e)',
        color: 'var(--text, #e2e4e8)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        .chat-scanlines::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 212, 212, 0.02) 2px,
            rgba(0, 212, 212, 0.02) 4px
          );
          pointer-events: none;
          z-index: 0;
        }
      `}</style>

      {/* Header bar — repo + mode selector + HeadroomBar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
          background: 'var(--surface, #0f1012)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <RepoDropdown />

        {/* P1.3: Mode selector dropdown */}
        <select
          value={currentMode}
          onChange={e => handleModeChange(e.target.value as Mode)}
          style={{
            background: 'var(--surface-2, #141518)',
            border: '1px solid var(--border, rgba(255,255,255,0.06))',
            borderRadius: '4px',
            color: 'var(--cyan, #00d4d4)',
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            padding: '2px 6px',
            cursor: 'pointer',
            outline: 'none',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {MODES.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {/* P1.3: HeadroomBar — visual token budget */}
        <HeadroomBar
          used={tokenState.used}
          total={MODE_BUDGETS[currentMode] ?? 8000}
          mode={currentMode}
        />

        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-faint, #374151)',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {busy ? 'BUSY' : 'READY'}
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        <MessageList
          messages={messages}
          busy={busy}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--border, rgba(255,255,255,0.06))',
          padding: '12px 16px',
          background: 'var(--surface, #0f1012)',
          position: 'relative',
          zIndex: 1,
          flexShrink: 0,
        }}
      >
        {/* Context pills row */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '8px',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-faint, #374151)',
          }}
        >
          <button
            onClick={() => setInput(prev => prev + '@file ')}
            style={{
              background: 'var(--surface-2, #141518)',
              border: '1px solid var(--border, rgba(255,255,255,0.06))',
              borderRadius: '4px',
              padding: '2px 8px',
              color: 'var(--cyan, #00d4d4)',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            + @file
          </button>
        </div>

        {/* Dyson Frame Modulator — cognitive frames that transform input text */}
        <DysonFrameModulator
          value={input}
          onChange={setInput}
          onSend={(text) => {
            setInput(text);
            // User would press enter after editing transformed text
          }}
          busy={busy}
          apiBaseUrl={API_BASE_URL}
          apiKey={API_KEY}
          model={FRAME_MODEL}
          fallbackModel={CLOUD_API_MODEL}
          fallbackBaseUrl={CLOUD_API_URL}
          fallbackApiKey={CLOUD_API_KEY}
        />

        {/* Input row */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={busy ? "Type to add context or redirect — press Enter to send (cancels current)" : "Ask jcode to do something…"}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              border: busy
                ? '1px solid rgba(255,92,92,0.25)'
                : '1px solid var(--border-bright, rgba(255,255,255,0.12))',
              borderRadius: '8px',
              padding: '10px 12px',
              background: 'var(--surface-2, #141518)',
              color: 'var(--text, #e2e4e8)',
              fontSize: '14px',
              lineHeight: 1.5,
              fontFamily: 'inherit',
              outline: 'none',
              maxHeight: '160px',
              overflowY: 'auto',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
              boxShadow: input.trim()
                ? (busy ? '0 0 20px rgba(255,92,92,0.06)' : '0 0 20px rgba(0,212,212,0.06)')
                : 'none',
            }}
            onFocus={e => {
              e.target.style.borderColor = busy ? 'rgba(255,92,92,0.5)' : 'var(--cyan, #00d4d4)';
              e.target.style.boxShadow = busy ? '0 0 20px rgba(255,92,92,0.06)' : '0 0 20px rgba(0,212,212,0.06)';
            }}
            onBlur={e => {
              e.target.style.borderColor = busy ? 'rgba(255,92,92,0.25)' : 'var(--border-bright, rgba(255,255,255,0.12))';
              e.target.style.boxShadow = 'none';
            }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 160) + 'px';
            }}
          />
          <button
            onClick={busy ? cancel : handleSend}
            disabled={!busy && !input.trim()}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: busy
                ? 'rgba(255,92,92,0.2)'
                : (input.trim() ? 'var(--cyan, #00d4d4)' : 'var(--surface-3, #191b1f)'),
              color: busy
                ? '#ff5c5c'
                : (input.trim() ? '#0b0c0e' : 'var(--text-faint, #374151)'),
              border: busy ? '1px solid rgba(255,92,92,0.3)' : 'none',
              cursor: (!busy && !input.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
            title={busy ? 'Stop processing' : 'Send'}
          >
            {busy ? (
              <span style={{ color: '#ff5c5c', fontSize: '14px', fontWeight: 700 }}>■</span>
            ) : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
