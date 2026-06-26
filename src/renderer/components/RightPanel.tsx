import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';

/**
 * RightPanel — adjustable side panel on the right side of the screen.
 * Can show a browser (WebContentsView overlay) or other content.
 * Resizes independently of the left sidebar.
 */
export default function RightPanel() {
  const { rightPanelWidth, setRightPanelWidth, setRightPanelOpen } = useAppStore();
  const [activeTab, setActiveTab] = useState<'browser'>('browser');
  const [urlInput, setUrlInput] = useState('https://www.google.com');
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const ipc = (window as any).dyson;

  const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

  // ── Resize handle (drags from the LEFT edge of this panel) ──
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      const rect = panelRef.current.parentElement!.getBoundingClientRect();
      const w = rect.right - e.clientX;
      setRightPanelWidth(Math.max(160, Math.min(window.innerWidth * 0.5, w)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [setRightPanelWidth]);

  // ── Sync browser bounds to main process for WebContentsView ──
  useEffect(() => {
    if (activeTab !== 'browser' || !containerRef.current) return;
    const el = containerRef.current;
    const sync = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      ipc?.panelsSetRightPanelBounds?.({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();

    // Register visible
    ipc?.electronAPI?.send?.('sidebar:panel-visible', { panel: 'right-browser', visible: true }) ??
      ipc?.send?.('sidebar:panel-visible', { panel: 'right-browser', visible: true });

    return () => {
      ro.disconnect();
      ipc?.electronAPI?.send?.('sidebar:panel-visible', { panel: 'right-browser', visible: false });
    };
  }, [activeTab, ipc, rightPanelWidth]);

  const navigate = useCallback((url: string) => {
    let finalUrl = url.trim();
    if (!finalUrl) return;
    if (!/^https?:\/\//i.test(finalUrl)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
      }
    }
    setUrlInput(finalUrl);
    ipc?.panelsRightBrowserNavigate?.(finalUrl);
  }, [ipc]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') navigate(urlInput);
  };

  const adjustZoom = useCallback((direction: -1 | 1) => {
    const currentIdx = ZOOM_LEVELS.indexOf(zoom);
    const newIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, currentIdx + direction));
    const newZoom = ZOOM_LEVELS[newIdx];
    setZoom(newZoom);
    ipc?.panelsRightBrowserSetZoom?.(newZoom);
  }, [zoom, ipc]);

  const resetZoom = useCallback(() => {
    setZoom(1.0);
    ipc?.panelsRightBrowserSetZoom?.(1.0);
  }, [ipc]);

  return (
    <div
      ref={panelRef}
      className="flex h-full flex-shrink-0"
    >
      {/* ── RESIZE HANDLE (left edge) ── */}
      <div
        onMouseDown={startResize}
        className="w-1 cursor-col-resize bg-[rgba(255,255,255,0.04)] hover:bg-[#6c8cf8]/60 active:bg-[#6c8cf8] transition-colors flex-shrink-0"
      />

      {/* ── PANEL CONTENT ── */}
      <aside
        className="bg-[#111113] border-l border-[rgba(255,255,255,0.06)] flex flex-col overflow-hidden"
        style={{ width: rightPanelWidth }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-1">
            {(['browser'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
                  activeTab === tab
                    ? 'text-[#6c8cf8] bg-[rgba(108,140,248,0.1)]'
                    : 'text-[#555560] hover:text-[#888890]'
                }`}
              >
                🌐 {tab}
              </button>
            ))}
          </div>
          <button
            onClick={() => setRightPanelOpen(false)}
            className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] hover:bg-[#1a1a1e] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Browser address bar */}
        {activeTab === 'browser' && (
          <div className="flex items-center gap-1.5 h-8 bg-[#111113] border-b border-[rgba(255,255,255,0.05)] px-2 flex-shrink-0">
            <button onClick={() => ipc?.panelsRightBrowserGoBack?.()} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] transition-colors flex-shrink-0" title="Back">◀</button>
            <button onClick={() => ipc?.panelsRightBrowserGoForward?.()} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] transition-colors flex-shrink-0" title="Forward">▶</button>
            <button onClick={() => ipc?.panelsRightBrowserReload?.()} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] transition-colors flex-shrink-0" title="Reload">↻</button>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-[#1a1a1e] border border-[rgba(255,255,255,0.06)] rounded-full px-3 py-1 text-[11px] text-[#e8e8ea] outline-none focus:border-[#6c8cf8] placeholder:text-[#444450] font-mono"
              placeholder="Search or enter URL"
            />
            {/* Zoom controls */}
            <button onClick={() => adjustZoom(-1)} className="w-5 h-5 flex items-center justify-center rounded text-[12px] text-[#555560] hover:text-[#888890] transition-colors" title="Zoom out">−</button>
            <span className="text-[10px] text-[#888890] min-w-[30px] text-center cursor-pointer hover:text-[#e8e8ea]" onClick={resetZoom} title="Reset zoom">{Math.round(zoom * 100)}%</span>
            <button onClick={() => adjustZoom(1)} className="w-5 h-5 flex items-center justify-center rounded text-[12px] text-[#555560] hover:text-[#888890] transition-colors" title="Zoom in">+</button>
          </div>
        )}

        {/* WebContentsView overlay area */}
        <div ref={containerRef} className="flex-1 bg-[#0e0e10]" />
      </aside>
    </div>
  );
}
