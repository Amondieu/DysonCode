import React, { useCallback, useEffect, useState } from 'react';
import { usePanelManager } from '../hooks/usePanelManager';

interface BrowserTab {
  id: string;
  url: string;
}

let tabCounter = 1;

const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

interface Props {
  activeMainTab: 'chat' | 'flow' | 'canvas' | 'mesh';
  activeCenterPanel: 'browser' | 'monaco' | 'stream' | 'codeserver' | null;
}

export default function BrowserPanel({ activeMainTab, activeCenterPanel }: Props) {
  const ipc = (window as any).dyson;
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-0', url: 'https://www.google.com' },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-0');
  const [urlInput, setUrlInput] = useState('https://www.google.com');
  const [zoom, setZoom] = useState(1.0);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // ── Unified PanelManager hook — handles visibility, bounds, and tab sync ──
  const containerRef = usePanelManager('browser', activeMainTab, activeCenterPanel);

  // Navigate on tab change
  useEffect(() => {
    if (activeTab) {
      ipc.browserNavigate?.(activeTab.url);
    }
  }, [activeTabId]);

  // Listen for URL changes from browser
  useEffect(() => {
    const unsub = ipc.onBrowserUrlChanged?.((url: string) => {
      setUrlInput(url);
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url } : t)));
    });
    return () => unsub?.();
  }, [activeTabId, ipc]);

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
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url: finalUrl } : t)));
    ipc.browserNavigate?.(finalUrl);
  }, [activeTabId, ipc]);

  const addTab = () => {
    const id = `tab-${tabCounter++}`;
    setTabs((prev) => [...prev, { id, url: 'https://www.google.com' }]);
    setActiveTabId(id);
    setUrlInput('https://www.google.com');
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const newId = `tab-${tabCounter++}`;
        return [{ id: newId, url: 'https://www.google.com' }];
      }
      if (id === activeTabId) {
        const idx = prev.findIndex((t) => t.id === id);
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
        setUrlInput(newActive.url);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') navigate(urlInput);
  };

  // ── Zoom controls ──
  const adjustZoom = useCallback((direction: -1 | 1) => {
    const currentIdx = ZOOM_LEVELS.indexOf(zoom);
    const newIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, currentIdx + direction));
    const newZoom = ZOOM_LEVELS[newIdx];
    setZoom(newZoom);
    ipc.browserSetZoom?.(newZoom);
  }, [zoom, ipc]);

  const resetZoom = useCallback(() => {
    setZoom(1.0);
    ipc.browserSetZoom?.(1.0);
  }, [ipc]);

  return (
    <div className="h-full flex flex-col bg-[#0e0e10]">
      {/* ── Toolbar: nav + tabs + zoom + close ── */}
      <div className="flex items-center gap-1 h-7 bg-[#111113] border-b border-[rgba(255,255,255,0.05)] px-1 flex-shrink-0">
        {/* Navigation */}
        <button onClick={() => ipc.browserGoBack?.()} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] transition-colors flex-shrink-0" title="Back">◀</button>
        <button onClick={() => ipc.browserGoForward?.()} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] transition-colors flex-shrink-0" title="Forward">▶</button>
        <button onClick={() => ipc.browserReload?.()} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] transition-colors flex-shrink-0" title="Reload">↻</button>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0 mx-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => { setActiveTabId(tab.id); setUrlInput(tab.url); }}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-t-md text-[10px] cursor-pointer transition-colors max-w-[140px] ${
                tab.id === activeTabId
                  ? 'bg-[#0e0e10] text-[#e8e8ea] border-t border-x border-[rgba(255,255,255,0.06)]'
                  : 'text-[#555560] hover:text-[#888890] hover:bg-[#1a1a1e]'
              }`}
            >
              <span className="truncate">{tab.url.replace(/^https?:\/\//, '').split('/')[0] || 'New Tab'}</span>
              <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} className="w-3 h-3 flex items-center justify-center rounded-sm text-[9px] text-[#555560] hover:text-[#e8e8ea] hover:bg-[#2a2a2e] flex-shrink-0">×</button>
            </div>
          ))}
          <button onClick={addTab} className="w-4 h-4 flex items-center justify-center rounded text-[11px] text-[#555560] hover:text-[#e8e8ea] hover:bg-[#1a1a1e] transition-colors flex-shrink-0" title="New Tab">+</button>
        </div>

        {/* Zoom strip */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => adjustZoom(-1)} className="w-5 h-5 flex items-center justify-center rounded text-[12px] text-[#555560] hover:text-[#888890] transition-colors" title="Zoom out">−</button>
          <span className="text-[10px] text-[#888890] min-w-[34px] text-center cursor-pointer hover:text-[#e8e8ea]" onClick={resetZoom} title="Reset zoom">{Math.round(zoom * 100)}%</span>
          <button onClick={() => adjustZoom(1)} className="w-5 h-5 flex items-center justify-center rounded text-[12px] text-[#555560] hover:text-[#888890] transition-colors" title="Zoom in">+</button>
          <button onClick={resetZoom} className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#e8e8ea] transition-colors ml-0.5" title="Reset zoom">⊙</button>
        </div>

        {/* ✕ Close panel */}
        <button
          onClick={() => ipc.panelsSetActivePanel?.(null)}
          className="w-5 h-5 flex items-center justify-center rounded text-[13px] text-[#555560] hover:text-[#ff5c5c] hover:bg-[#2a1a1a] transition-colors flex-shrink-0 ml-0.5"
          title="Close browser panel"
        >
          ✕
        </button>
      </div>

      {/* Address Bar */}
      <div className="flex items-center gap-1.5 h-8 bg-[#111113] border-b border-[rgba(255,255,255,0.05)] px-2 flex-shrink-0">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-[#1a1a1e] border border-[rgba(255,255,255,0.06)] rounded-full px-3 py-1 text-[11px] text-[#e8e8ea] outline-none focus:border-[#6c8cf8] placeholder:text-[#444450] font-mono"
          placeholder="Search or enter URL"
        />
      </div>

      {/* WebContentsView overlay area — bounds managed by PanelManager hook */}
      <div ref={containerRef} className="flex-1 bg-[#0e0e10]" />
    </div>
  );
}
