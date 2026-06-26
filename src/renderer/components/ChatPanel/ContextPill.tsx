import type { ContextRef } from './chat.types';

const ICONS: Record<string, string> = { file: '📄', symbol: '🔣', url: '🔗' };

export function ContextPill({ ref }: { ref: ContextRef }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '1px 7px',
        borderRadius: '4px',
        fontSize: '11px',
        fontFamily: "'JetBrains Mono', monospace",
        background: '#0b0c0e',
        border: '1px solid var(--cyan-dim, rgba(0,212,212,0.3))',
        color: 'var(--cyan, #00d4d4)',
        cursor: 'pointer',
        marginRight: '4px',
      }}
      title={ref.path || ref.label}
    >
      {ICONS[ref.type] || '📎'}
      <span>{ref.label}</span>
    </span>
  );
}
