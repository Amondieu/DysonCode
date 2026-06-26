export function BlinkingCursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '2px',
        height: '1em',
        background: 'var(--cyan, #00d4d4)',
        animation: 'blink 1s step-end infinite',
        verticalAlign: 'text-bottom',
        marginLeft: '1px',
      }}
    />
  );
}
