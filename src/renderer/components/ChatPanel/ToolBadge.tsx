import type { ToolCall } from './chat.types';

const TOOL_ICONS: Record<string, string> = {
  read: '📄', write: '✏️', shell: '⚡', list: '📁',
  search: '🔍', default: '🔧',
};

export function ToolBadge({ tool }: { tool: ToolCall }) {
  const icon = TOOL_ICONS[tool.name] || TOOL_ICONS.default;
  const isRunning = tool.status === 'running';

  return (
    <div
      className="tool-badge"
      data-status={tool.status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: "'JetBrains Mono', monospace",
        background: 'var(--surface-3, #191b1f)',
        border: '1px solid var(--border, rgba(255,255,255,0.06))',
        borderLeft: `3px solid ${
          tool.status === 'running' ? 'var(--cyan, #00d4d4)' :
          tool.status === 'error' ? 'var(--red, #ef4444)' :
          'var(--green, #22c55e)'
        }`,
        cursor: isRunning ? 'default' : 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {isRunning ? (
        <span className="spinner" style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>
          ⟳
        </span>
      ) : tool.status === 'done' ? (
        <span style={{ color: 'var(--green, #22c55e)' }}>✓</span>
      ) : (
        <span style={{ color: 'var(--red, #ef4444)' }}>✗</span>
      )}
      <span style={{ opacity: 0.7 }}>{icon}</span>
      <span>{tool.name}</span>
      {tool.durationMs != null && (
        <span style={{ opacity: 0.4, fontSize: '11px' }}>{tool.durationMs}ms</span>
      )}
    </div>
  );
}
