import { useState } from 'react';
import type { ReasoningBlock } from './chat.types';

export function ReasoningTrace({ block }: { block: ReasoningBlock }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        margin: '4px 0',
        borderLeft: '2px solid #7c3aed',
        paddingLeft: '12px',
        fontSize: '13px',
        color: 'var(--text-muted, #6b7280)',
        fontStyle: 'italic',
        cursor: 'pointer',
        transition: 'max-height 0.2s ease',
        maxHeight: open ? '500px' : '28px',
        overflow: 'hidden',
      }}
      onClick={() => setOpen(!open)}
    >
      <div style={{ opacity: 0.6, fontSize: '11px', marginBottom: open ? '6px' : 0 }}>
        {open ? '▼' : '▶'} reasoning {block.collapsed ? '(collapsed)' : ''}
      </div>
      {open && <div style={{ whiteSpace: 'pre-wrap' }}>{block.text}</div>}
    </div>
  );
}
