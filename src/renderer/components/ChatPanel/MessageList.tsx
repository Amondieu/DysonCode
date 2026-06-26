import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from './chat.types';
import { ToolBadge } from './ToolBadge';
import { ReasoningTrace } from './ReasoningTrace';
import { BlinkingCursor } from './BlinkingCursor';
import { ContextPill } from './ContextPill';

// ── Copy button SVG ────────────────────────────────────────────────────────
const COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

// ── Relative time ──────────────────────────────────────────────────────────
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Context Menu ─────────────────────────────────────────────────────────────
const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_PADDING = 6;

interface ContextMenuState {
  x: number;
  y: number;
  msg: ChatMessage;
}

function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const ipc = (window as any).dyson;

  // Close on click outside or Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(state.msg.content);
    } catch {}
    onClose();
  }, [state.msg.content, onClose]);

  const handlePerplexity = useCallback(async () => {
    try {
      const result = await ipc?.perplexitySearch?.(state.msg.content);
      if (!result?.ok) {
        // Fallback: open in system browser directly
        ipc?.openBrowser?.(`https://www.perplexity.ai/search?q=${encodeURIComponent(state.msg.content)}`);
      }
    } catch {
      ipc?.openBrowser?.(`https://www.perplexity.ai/search?q=${encodeURIComponent(state.msg.content)}`);
    }
    onClose();
  }, [state.msg.content, onClose, ipc]);

  // Clamp menu position to viewport
  const menuX = Math.min(state.x, window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_PADDING);
  const menuY = Math.min(state.y, window.innerHeight - 120);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: menuX,
        top: menuY,
        width: CONTEXT_MENU_WIDTH,
        zIndex: 99999,
        background: '#1a1b1e',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: `${CONTEXT_MENU_PADDING}px`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
      }}
    >
      <div
        onClick={handleCopy}
        style={{
          padding: '8px 10px',
          borderRadius: '4px',
          cursor: 'pointer',
          color: '#e2e4e8',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'background 80ms ease',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ fontSize: '14px' }}>📋</span>
        <span>Copy Message to Clipboard</span>
      </div>
      <div
        onClick={handlePerplexity}
        style={{
          padding: '8px 10px',
          borderRadius: '4px',
          cursor: 'pointer',
          color: '#e2e4e8',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'background 80ms ease',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ fontSize: '14px' }}>🔍</span>
        <span>Send to Browser (Perplexity)</span>
      </div>
    </div>
  );
}

// ── Message Row ─────────────────────────────────────────────────────────────
const COLLAPSE_THRESHOLD = 600;

function MessageRow({ msg, onToggle }: { msg: ChatMessage; onToggle: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, [msg]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [msg.content]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0', gap: '8px' }} onContextMenu={handleContextMenu}>
        <div style={{ position: 'relative', maxWidth: '70%' }} className="user-message-group">
          <div
            style={{
              padding: '8px 14px',
              borderRadius: '14px 14px 4px 14px',
              background: 'var(--jcode-cyan-dim, #00a8a8)',
              color: '#0b0c0e',
              fontSize: '13px',
              lineHeight: 1.5,
              fontFamily: 'var(--jcode-font-ui, Inter, sans-serif)',
            }}
          >
            {msg.content}
          </div>
          {/* Copy button — visible on hover */}
          {!msg.streaming && msg.content && (
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              aria-label="Copy message"
              style={{
                position: 'absolute',
                bottom: '-4px',
                right: '0',
                opacity: 0,
                transition: 'opacity 180ms ease',
                padding: '4px 6px',
                borderRadius: '4px',
                background: 'var(--jcode-surface-2, #141518)',
                border: '1px solid var(--jcode-border, rgba(255,255,255,0.06))',
                color: copied ? 'var(--jcode-green, #22c55e)' : 'var(--jcode-cyan, #00d4d4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                zIndex: 2,
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { if (!copied) e.currentTarget.style.opacity = '0'; }}
              onFocus={e => e.currentTarget.style.opacity = '1'}
              onBlur={e => { if (!copied) e.currentTarget.style.opacity = '0'; }}
              dangerouslySetInnerHTML={{ __html: copied ? CHECK_SVG + ' Copied' : COPY_SVG }}
            />
          )}
        </div>
        <style>{`
          .user-message-group:hover button {
            opacity: 1 !important;
          }
        `}</style>
        {contextMenu && <ContextMenu state={contextMenu} onClose={closeContextMenu} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '8px', margin: '8px 0' }} onContextMenu={handleContextMenu}>
      {/* Avatar badge — 'jc' in cyan */}
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          background: 'var(--jcode-surface-3, #191b1f)',
          border: '1px solid var(--jcode-cyan, #00d4d4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--jcode-cyan, #00d4d4)',
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        jc
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Context pills */}
        {msg.contextRefs.length > 0 && (
          <div style={{ marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {msg.contextRefs.map((ref, i) => <ContextPill key={i} ref={ref} />)}
          </div>
        )}

        {/* Reasoning trace */}
        {msg.reasoning && <ReasoningTrace block={msg.reasoning} />}

        {/* Typing indicator (B1) — bouncing dots before first token */}
        {msg.streaming && !msg.content && (
          <div style={{ display: 'flex', gap: '4px', padding: '8px 0' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--jcode-text-muted, #6b7280)',
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Content — collapsible (auto-collapse long messages) */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'var(--text, #e2e4e8)',
              whiteSpace: 'pre-wrap',
              fontFamily: msg.content.includes('```') ? "'JetBrains Mono', monospace" : 'inherit',
              overflow: 'hidden',
              transition: 'max-height 280ms cubic-bezier(0.16, 1, 0.3, 1)',
              maxHeight: msg.collapsed ? 'calc(4 * 1.6em)' : (msg.content.length > COLLAPSE_THRESHOLD && !msg.streaming ? '9999px' : 'none'),
              position: 'relative',
            }}
          >
            {msg.content}
            {msg.streaming && <BlinkingCursor />}

            {/* Fade mask when collapsed */}
            {msg.collapsed && (
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '3rem',
                background: 'linear-gradient(to bottom, transparent, var(--jcode-surface, #0f1012))',
                pointerEvents: 'none',
              }} />
            )}
          </div>

          {/* Collapse toggle — only for non-streaming messages over threshold */}
          {!msg.streaming && msg.content.length > COLLAPSE_THRESHOLD && (
            <button
              onClick={() => onToggle(msg.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: 'var(--jcode-text-muted, #6b7280)',
                fontFamily: "'JetBrains Mono', monospace",
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                marginTop: '2px',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--jcode-cyan, #00d4d4)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--jcode-text-muted, #6b7280)'}
            >
              {msg.collapsed ? '▼ Show more' : '▲ Collapse'}
            </button>
          )}

          {/* Copy button (Feature 4) — visible on hover */}
          {!msg.streaming && msg.content && (
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              aria-label="Copy message"
              style={{
                position: 'absolute',
                bottom: '-4px',
                right: '0',
                opacity: 0,
                transition: 'opacity 180ms ease',
                padding: '4px 6px',
                borderRadius: '4px',
                background: 'var(--jcode-surface-2, #141518)',
                border: '1px solid var(--jcode-border, rgba(255,255,255,0.06))',
                color: copied ? 'var(--jcode-green, #22c55e)' : 'var(--jcode-text-muted, #6b7280)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { if (!copied) e.currentTarget.style.opacity = '0'; }}
              onFocus={e => e.currentTarget.style.opacity = '1'}
              onBlur={e => { if (!copied) e.currentTarget.style.opacity = '0'; }}
              dangerouslySetInnerHTML={{ __html: copied ? CHECK_SVG + ' Copied' : COPY_SVG }}
            />
          )}
        </div>

        {/* B2: Collapsible step groups — wrap tool badges in details */}
        {msg.toolCalls.length > 0 && (
          <details
            open={!msg.streaming}
            style={{ marginTop: '8px', fontSize: '12px' }}
          >
            <summary style={{
              cursor: 'pointer',
              color: 'var(--jcode-text-muted, #6b7280)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              marginBottom: '4px',
              userSelect: 'none',
            }}>
              {msg.toolCalls.filter(t => t.status === 'done').length}/{msg.toolCalls.length} steps
              {' '}
              {!msg.streaming && msg.toolCalls.every(t => t.status === 'done')
                ? '✓ Done'
                : msg.toolCalls.some(t => t.status === 'error')
                  ? '✗ Failed'
                  : '⟳ Running'}
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {msg.toolCalls.map(tc => <ToolBadge key={tc.id} tool={tc} />)}
            </div>
          </details>
        )}

        {/* B3: Relative timestamp on hover */}
        <div style={{
          fontSize: '10px',
          color: 'var(--jcode-text-faint, #374151)',
          marginTop: '2px',
          opacity: 0,
          transition: 'opacity 180ms ease',
          fontFamily: "'JetBrains Mono', monospace",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0'}
        >
          {relativeTime(msg.ts)}
        </div>
      </div>
      {contextMenu && <ContextMenu state={contextMenu} onClose={closeContextMenu} />}
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onToggleCollapse?: (msgId: string) => void;
}

// ── Message List ────────────────────────────────────────────────────────────
export function MessageList({ messages, busy, onToggleCollapse }: Props) {

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolled = useRef(false);
  const tokenCount = useRef(0);
  const streamStartTime = useRef(0);
  const [tps, setTps] = useState('');

  // B6: Track manual scroll — pause auto-scroll if user scrolled up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 60;
    userScrolled.current = !atBottom;
  }, []);

  // B5: Token speed indicator
  useEffect(() => {
    if (!busy) {
      setTps('');
      tokenCount.current = 0;
      return;
    }
    if (!streamStartTime.current) streamStartTime.current = Date.now();
    tokenCount.current = messages.reduce((sum, m) => sum + m.content.length, 0);
  }, [messages, busy]);

  // Update TPS every 500ms while streaming
  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - streamStartTime.current) / 1000;
      if (elapsed > 0) {
        const rate = (tokenCount.current / elapsed).toFixed(1);
        setTps(`${rate} tok/s`);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [busy]);

  // Auto-scroll (B6: respects manual scroll override)
  useEffect(() => {
    if (!busy && !messages.length) return;
    // Use scrollTop = scrollHeight for reliable scroll-to-bottom
    const scroll = () => {
      if (userScrolled.current) return;
      const el = containerRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(scroll, 80);
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
    // Also react to content growth of the last message during streaming
  }, [messages.length, messages[messages.length - 1]?.content?.length, busy]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="chat-scrollbar"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        padding: '16px 20px',
        position: 'relative',
      }}
    >
      {/* B5: Token speed badge */}
      {tps && (
        <div style={{
          position: 'sticky',
          top: '4px',
          textAlign: 'right',
          fontSize: '10px',
          color: 'var(--jcode-text-faint, #374151)',
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: '4px',
          zIndex: 2,
        }}>
          {tps}
        </div>
      )}

      {messages.map(msg => <MessageRow key={msg.id} msg={msg} onToggle={onToggleCollapse || (() => {})} />)}
      <div ref={bottomRef} />
    </div>
  );
}
