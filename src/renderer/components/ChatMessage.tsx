import React, { useCallback, useState } from 'react';
import type { MessageInfo } from '../store/appStore';
import { copyToClipboard } from '../utils/clipboard';

interface Props {
  message: MessageInfo;
}

// ── IDE Color Palette (VS Code Dark+ inspired) ──
const IDE = {
  bg:            '#1e1e1e',
  bgAlt:         '#252526',
  bgHover:       '#2a2d2e',
  border:        '#333333',
  fg:            '#d4d4d4',
  muted:         '#808080',
  comment:       '#6a9955',
  keyword:       '#569cd6',
  string:        '#ce9178',
  number:        '#b5cea8',
  function:      '#dcdcaa',
  type:          '#4ec9b0',
  operator:      '#d4d4d4',
  variable:      '#9cdcfe',
  error:         '#f44747',
  warning:       '#cca700',
  info:          '#3794ff',
} as const;

// ── Persona Role → IDE token color mapping ──
const PERSONA_COLORS: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  architect:     { color: IDE.keyword,   bg: '#569cd614', border: '#569cd633', icon: '🏛️' },
  reviewer:      { color: IDE.info,      bg: '#3794ff14', border: '#3794ff33', icon: '🔍' },
  builder:       { color: IDE.function,  bg: '#dcdcaa14', border: '#dcdcaa33', icon: '🔨' },
  critic:        { color: IDE.error,     bg: '#f4474714', border: '#f4474733', icon: '⚔️' },
  tester:        { color: IDE.warning,   bg: '#cca70014', border: '#cca70033', icon: '🧪' },
  memoryKeeper:  { color: '#c586c0',     bg: '#c586c014', border: '#c586c033', icon: '🧠' },
  system:        { color: IDE.comment,   bg: '#6a995510', border: '#6a995520', icon: '⚙️' },
};

function resolvePersona(content: string): { key: string; label: string } | null {
  // Match [🏛️ Architect], [🔨 Builder], [critic:...], [🧪 Tester], etc.
  const m = content.match(/^\[(?:[\u{1F300}-\u{1F9FF}]\s*)?(\w+)(?::.*?)?\]/u);
  if (!m) return null;
  const key = m[1].toLowerCase();
  // Map known persona keys
  const map: Record<string, string> = {
    architect: 'architect', reviewer: 'reviewer', builder: 'builder',
    critic: 'critic', tester: 'tester', memorykeeper: 'memoryKeeper',
    'memory keeper': 'memoryKeeper', blueprint: 'system', execute: 'system',
    error: 'system', system: 'system',
  };
  const resolved = map[key] || null;
  return resolved ? { key: resolved, label: m[1] } : null;
}

function outcomeType(content: string): 'pass' | 'warn' | 'fail' | null {
  const head = content.slice(0, 120).toLowerCase();
  if (/✅|pass|success|complete|done|built|green|critic pass/i.test(head)) return 'pass';
  if (/⚠️|warning|partial|needs|confirm|amber|caution|needs_review/i.test(head)) return 'warn';
  if (/❌|error|failed|blocked|broken|red|fatal/i.test(head)) return 'fail';
  return null;
}

// ── Lightweight Markdown renderer (IDE-style compact) ──
function renderContent(content: string) {
  const lines = content.split('\n');
  const els: React.ReactNode[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = '';

  const flush = () => {
    if (codeBuf.length === 0) return;
    const code = codeBuf.join('\n');
    els.push(<CodeBlock key={els.length} lang={codeLang} code={code} />);
    codeBuf = [];
    codeLang = '';
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) { flush(); inCode = false; }
      else { flush(); inCode = true; codeLang = line.trim().slice(3).trim(); }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    const t = line.trim();
    if (!t) { els.push(<div key={els.length} className="h-1.5" />); continue; }

    if (t.startsWith('### ')) {
      els.push(<div key={els.length} className="mt-2 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{color:IDE.keyword}}>{t.slice(4)}</div>);
    } else if (t.startsWith('## ')) {
      els.push(<div key={els.length} className="mt-2 mb-0.5 text-[12px] font-bold" style={{color:IDE.function}}>{t.slice(3)}</div>);
    } else if (t.startsWith('# ')) {
      els.push(<div key={els.length} className="mt-2 mb-1 text-[13px] font-bold" style={{color:IDE.type}}>{t.slice(2)}</div>);
    } else if (t.startsWith('---')) {
      els.push(<hr key={els.length} className="my-1.5 border-0 h-px" style={{background: IDE.border}} />);
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      els.push(<div key={els.length} className="flex gap-1.5 text-[11px] leading-[1.45]" style={{color:IDE.fg}}><span className="flex-shrink-0 select-none" style={{color:IDE.keyword}}>•</span><span>{t.slice(2)}</span></div>);
    } else if (/^\d+[.)]\s/.test(t)) {
      const m = t.match(/^(\d+)[.)]\s(.+)/)!;
      els.push(<div key={els.length} className="flex gap-1.5 text-[11px] leading-[1.45]" style={{color:IDE.fg}}><span className="flex-shrink-0 w-4 text-right font-mono select-none" style={{color:IDE.number}}>{m[1]}.</span><span>{m[2]}</span></div>);
    } else if (/^(✅|⚠️|❌|⚡|🔧|📁|🔍|🏛️|🔨|⚔️|🧪|🧠)/.test(t)) {
      els.push(<div key={els.length} className="flex items-center gap-1.5 text-[11px] leading-[1.45]" style={{color:IDE.fg}}><span>{t.slice(0,2)}</span><span>{t.slice(2).trim()}</span></div>);
    } else {
      els.push(<div key={els.length} className="text-[11px] leading-[1.5]" style={{color:IDE.fg}}>{t}</div>);
    }
  }
  flush();
  return els;
}

// ── Copy button with feedback ──────────────────────────────────────────────
const CopyButton: React.FC<{ text: string; className?: string; style?: React.CSSProperties }> = ({ text, className = '', style }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 transition-opacity hover:opacity-100 ${state === 'idle' ? 'opacity-50' : 'opacity-100'} ${className}`}
      style={style}
      aria-label={state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed — click to retry' : 'Copy message to clipboard'}
      title={state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : 'Copy'}
    >
      {state === 'copied' ? (
        <span className="text-[9px]" style={{ color: IDE.comment }}>copied</span>
      ) : state === 'failed' ? (
        <span className="text-[9px]" style={{ color: IDE.error }}>retry</span>
      ) : (
        <span className="text-[9px]">copy</span>
      )}
    </button>
  );
};

// ── Code block with syntax-style coloring ──
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-1.5 rounded-md overflow-hidden border" style={{borderColor: IDE.border, background: '#0d0d0d'}}>
      {lang && (
        <div className="flex items-center justify-between px-2.5 py-1 border-b" style={{borderColor: IDE.border, background: '#121212'}}>
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] font-mono" style={{color: IDE.muted}}>{lang}</span>
          <CopyButton text={code} />
        </div>
      )}
      <pre className="px-2.5 py-1.5 text-[10.5px] leading-[1.55] overflow-x-auto font-mono" style={{color: IDE.fg, fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace'}}>
        {code}
      </pre>
    </div>
  );
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // ── System messages: centered, dim, monospaced ──
  if (isSystem) {
    const cleanSystem = message.content.replace(/^\[.*?\]\s*/, '');
    return (
      <div className="flex justify-center items-center gap-1.5 py-0.5 group">
        <span className="text-[9.5px] font-mono px-2 py-0.5 rounded opacity-60" style={{color: IDE.comment, fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace'}}>
          {cleanSystem}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={cleanSystem} style={{ color: IDE.muted }} />
        </span>
      </div>
    );
  }

  // ── User messages: right-aligned, keyword-colored ──
  if (isUser) {
    return (
      <div className="flex justify-end py-0.5 group">
        <div className="max-w-[85%] rounded-md px-2.5 py-1.5 border" style={{background: '#569cd60d', borderColor: '#569cd625'}}>
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] font-mono" style={{color: IDE.keyword}}>You</div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
              <CopyButton text={message.content} style={{ color: IDE.keyword }} />
            </span>
          </div>
          <div className="text-[11px] leading-[1.45] font-mono" style={{color: IDE.fg, fontFamily: `"JetBrains Mono","Fira Code","Cascadia Code",monospace`}}>
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant messages with persona detection ──
  const persona = resolvePersona(message.content);
  const colors = persona ? PERSONA_COLORS[persona.key] : null;
  const cleanContent = persona
    ? message.content.replace(/^\[.*?\]\s*\n?/, '')
    : message.content;
  const outcome = outcomeType(cleanContent);

  return (
    <div className="py-0.5 group">
      <div
        className="rounded-r-md border-l-[3px] pl-2.5 pr-2.5 py-1.5"
        style={{
          background: colors?.bg || IDE.bgAlt,
          borderColor: colors?.border || IDE.border,
          borderLeftColor: colors?.color || IDE.border,
        }}
      >
        {/* Persona header bar */}
        <div className="flex items-center gap-1.5 mb-1">
          {persona && (
            <>
              <span className="text-[11px]">{colors?.icon || '🤖'}</span>
              <span
                className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded font-mono"
                style={{ background: colors?.bg, color: colors?.color, border: `1px solid ${colors?.border}` }}
              >
                {persona.label}
              </span>
            </>
          )}
          {outcome && (
            <span
              className="text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: outcome === 'pass' ? '#22c55e15' : outcome === 'warn' ? '#eab30815' : '#ef444415',
                color: outcome === 'pass' ? IDE.comment : outcome === 'warn' ? IDE.warning : IDE.error,
                border: `1px solid ${outcome === 'pass' ? '#22c55e30' : outcome === 'warn' ? '#eab30830' : '#ef444430'}`,
              }}
            >
              {outcome === 'pass' ? '✅ pass' : outcome === 'warn' ? '⚠️ review' : '❌ fail'}
            </span>
          )}
          {/* Copy button — always visible in header bar */}
          <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
            <CopyButton text={cleanContent} style={{ color: colors?.color || IDE.muted }} />
          </span>
        </div>

        {/* Content body — monospaced, compact */}
        <div className="font-mono" style={{fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code","Consolas",monospace'}}>
          {renderContent(cleanContent)}
        </div>
      </div>
    </div>
  );
}
