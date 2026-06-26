import React, { useCallback, useEffect, useRef } from 'react';

export default function StreamPanel() {
  const ipc = (window as any).dyson;
  const containerRef = useRef<HTMLDivElement>(null);

  const syncBounds = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      ipc.streamSetBounds(rect.left, rect.top, rect.width, rect.height);
    }
  }, [ipc]);

  useEffect(() => {
    syncBounds();
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => syncBounds());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [syncBounds]);

  return (
    <div className="h-full flex flex-col bg-[#0e0e10]">
      <div className="flex items-center h-7 bg-[#111113] border-b border-[rgba(255,255,255,0.05)] px-2 flex-shrink-0">
        <span className="text-[10px] font-semibold text-[#3dd68c] uppercase tracking-wider">⚡ Execution Stream</span>
        <div className="flex-1" />
        <button
          onClick={() => ipc.streamClear()}
          className="text-[10px] px-2 py-0.5 rounded border border-[rgba(255,255,255,0.07)] text-[#555560] hover:text-[#888890] transition-colors"
        >
          Clear
        </button>
      </div>
      <div ref={containerRef} className="flex-1 bg-[#0e0e10] flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl block mb-2">⚡</span>
          <p className="text-[#888890] text-sm">Live execution stream</p>
          <p className="text-[#555560] text-[11px] mt-1">Start a build in FLOW mode to see events</p>
        </div>
      </div>
    </div>
  );
}
