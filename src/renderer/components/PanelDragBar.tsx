/**
 * PanelDragBar — thin grab bar at top of each panel.
 * Drag to rearrange panels. × to close. Visual grip dots.
 */
import React from 'react';
import { useAppStore } from '../store/appStore';

import React from 'react';

const PANEL_ICONS: Record<string, string> = {
  chat: '💬 Chat',
  browser: '🌐 Browser',
  editor: '📝 Editor',
  terminal: '⬛ Terminal',
  empty: '📌 Empty',
};

interface Props {
  label: string;
  onDragStart: () => void;
  onDrop: () => void;
  onClose: () => void;
}

export default function PanelDragBar({ label, onClose }: Props) {
  return (
    <div
      style={{
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        background: '#16161a',
        borderBottom: '1px solid #222',
        userSelect: 'none' as const,
        fontSize: 10,
        color: '#808080',
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {PANEL_ICONS[label] || label}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          background: 'none',
          border: 'none',
          color: '#555555',
          cursor: 'pointer',
          padding: '1px 5px',
          borderRadius: 3,
          fontSize: 14,
          lineHeight: 1,
        }}
        title="Close panel"
      >
        ×
      </button>
    </div>
  );
}
