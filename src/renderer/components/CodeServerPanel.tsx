import React, { useCallback, useEffect, useRef } from 'react';

export default function CodeServerPanel() {
  const ipc = (window as any).dyson;
  const containerRef = useRef<HTMLDivElement>(null);

  const syncBounds = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      ipc.codeserverSetBounds(rect.left, rect.top, rect.width, rect.height);
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
        <span className="text-[10px] font-semibold text-[#6c8cf8] uppercase tracking-wider">💻 VS Code (code-server)</span>
        <span className="ml-2 text-[9px] text-[#555560]">Starting...</span>
      </div>
      <div ref={containerRef} className="flex-1 bg-[#0e0e10] flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl block mb-2">💻</span>
          <p className="text-[#888890] text-sm">VS Code loading</p>
          <p className="text-[#555560] text-[11px] mt-1">code-server initializing...</p>
        </div>
      </div>
    </div>
  );
}
