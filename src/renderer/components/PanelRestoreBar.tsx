/**
 * PanelRestoreBar — shows closed panels as clickable buttons to restore them.
 */
import React from 'react';

const PANEL_LABELS: Record<string, string> = {
  chat: '💬 Chat',
  browser: '🌐 Browser',
  editor: '📝 Editor',
  terminal: '⬛ Terminal',
  flow: '🔀 Flow',
};

interface Props {
  hiddenSlots: Array<{ content: string; visible: boolean }>;
  onRestore: (content: string) => void;
  onReset: () => void;
}

export default function PanelRestoreBar({ hiddenSlots, onRestore, onReset }: Props) {
  if (hiddenSlots.length === 0) return null;

  return (
    <div style={{
      height: 22,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 6px',
      background: '#111113',
      borderTop: '1px solid #333333',
      fontSize: 10,
    }}>
      <span style={{ color: '#555555', marginRight: 4 }}>Closed:</span>
      {hiddenSlots.map((slot) => (
        <button
          key={slot.content}
          onClick={() => onRestore(slot.content)}
          style={{
            background: '#252526',
            border: '1px solid #333333',
            color: '#808080',
            cursor: 'pointer',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 9,
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {PANEL_LABELS[slot.content] || slot.content}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        onClick={onReset}
        style={{
          background: 'none',
          border: '1px solid #333333',
          color: '#555555',
          cursor: 'pointer',
          padding: '1px 6px',
          borderRadius: 3,
          fontSize: 9,
          fontFamily: '"JetBrains Mono", monospace',
        }}
        title="Reset to default layout"
      >
        ↺ Reset
      </button>
    </div>
  );
}
