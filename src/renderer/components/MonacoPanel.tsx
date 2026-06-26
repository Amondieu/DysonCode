import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function MonacoPanel() {
  const ipc = (window as any).dyson;
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentFile, setCurrentFile] = useState('');
  const [fileInput, setFileInput] = useState('');

  // Sync bounds to main process
  const syncBounds = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      ipc.monacoSetBounds(rect.left, rect.top, rect.width, rect.height);
    }
  }, [ipc]);

  useEffect(() => {
    syncBounds();
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => syncBounds());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [syncBounds]);

  const openFile = (filePath: string) => {
    const path = filePath.trim();
    if (!path) return;
    setCurrentFile(path);
    setFileInput(path);
    ipc.monacoOpen(path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') openFile(fileInput);
  };

  return (
    <div className="h-full flex flex-col bg-[#0e0e10]">
      {/* Toolbar */}
      <div className="flex items-center h-7 bg-[#111113] border-b border-[rgba(255,255,255,0.05)] px-2 gap-2 flex-shrink-0">
        <span className="text-[10px] font-semibold text-[#6c8cf8] uppercase tracking-wider">Monaco Editor</span>
        <div className="flex-1 flex items-center gap-1.5">
          <input
            value={fileInput}
            onChange={(e) => setFileInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="File path (Enter to open)..."
            className="flex-1 bg-[#1a1a1e] border border-[rgba(255,255,255,0.06)] rounded px-2 py-0.5 text-[10px] text-[#e8e8ea] outline-none focus:border-[#6c8cf8] placeholder:text-[#444450] font-mono"
          />
          <button onClick={() => openFile(fileInput)} className="text-[10px] px-2 py-0.5 rounded bg-[rgba(108,140,248,0.15)] text-[#6c8cf8] hover:bg-[rgba(108,140,248,0.25)] transition-colors">Open</button>
        </div>
      </div>
      {/* WebContentsView overlay area */}
      <div ref={containerRef} className="flex-1 bg-[#0e0e10] flex items-center justify-center">
        {!currentFile && (
          <div className="text-center">
            <span className="text-4xl block mb-2">📝</span>
            <p className="text-[#555560] text-sm">Open a file to edit</p>
            <p className="text-[#444450] text-[11px] mt-1">Enter a path above or use the Explorer</p>
          </div>
        )}
      </div>
    </div>
  );
}
