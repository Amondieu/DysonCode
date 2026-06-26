// src/renderer/components/ChatPanel/HeadroomBar.tsx
// P1.3 — Visual token budget display with mode badge and cost tracking

import React from 'react';

interface HeadroomBarProps {
  used: number;
  total: number;
  mode: string;
  sessionCost?: number; // in USD cents, optional
}

export const HeadroomBar: React.FC<HeadroomBarProps> = ({
  used, total, mode, sessionCost
}) => {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct < 70 ? '#6daa45'   // green
              : pct < 90 ? '#e8af34'   // gold/amber
              : '#a12c7b';             // red

  const label = `${used.toLocaleString()} / ${total.toLocaleString()} tokens`;
  const costLabel = sessionCost !== undefined
    ? ` · $${(sessionCost / 100).toFixed(4)}`
    : '';

  return (
    <div
      className="headroom-bar-wrapper"
      title={`${label}${costLabel} [${mode.toUpperCase()}]`}
      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
    >
      {/* Mode badge */}
      <span style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: color,
        opacity: 0.85,
        minWidth: '52px',
        textAlign: 'right'
      }}>
        {mode}
      </span>

      {/* Bar track */}
      <div style={{
        position: 'relative',
        width: '72px',
        height: '5px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '9999px',
        overflow: 'hidden',
        cursor: 'default'
      }}>
        {/* Fill */}
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: '9999px',
          transition: 'width 400ms ease, background 400ms ease',
          minWidth: pct > 0 ? '3px' : '0'
        }} />
      </div>

      {/* Percentage label */}
      <span style={{
        fontSize: '10px',
        color: color,
        minWidth: '30px',
        fontVariantNumeric: 'tabular-nums'
      }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
};

export const MODE_BUDGETS: Record<string, number> = {
  fast: 1000,
  balanced: 8000,
  deep: 32000,
  audit: 64000,
  inventor: 12000,
  stealth: 4000,
};
