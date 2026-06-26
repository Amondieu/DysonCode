import React, { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import SessionList from './SessionList';
import FileTree from './FileTree';
import RepoPicker from './RepoPicker';
import PromptVault from './PromptVault';
import UIAnalystPanel from './UIAnalystPanel';

const ICONS: Array<{ id: 'explorer' | 'browser' | 'vault' | 'lens'; label: string; icon: string }> = [
  { id: 'explorer', label: 'Explorer', icon: '📁' },
  { id: 'browser', label: 'Browser', icon: '🌐' },
  { id: 'vault', label: 'Vault', icon: '📋' },
  { id: 'lens', label: 'ΛENS UI Analyst', icon: '🔬' },
];

export default function Sidebar() {
  const {
    sidebarOpen, sidebarModule, sidebarWidth,
    setSidebarOpen, setSidebarModule, setSidebarWidth,
  } = useAppStore();
  const dragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ── Ctrl+B toggle ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarOpen, setSidebarOpen]);

  // ── Resize handle ──────────────────────────────────────────────
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const w = e.clientX - rect.left;
      setSidebarWidth(Math.max(160, Math.min(window.innerWidth * 0.6, w)));
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
  }, [setSidebarWidth]);

  const handleIconClick = (module: 'explorer' | 'browser' | 'vault' | 'lens') => {
    if (!sidebarOpen || sidebarModule !== module) {
      setSidebarModule(module);
      setSidebarOpen(true);
    }
  };

  return (
    <div ref={sidebarRef} className="flex h-full flex-shrink-0 min-h-0 overflow-hidden">
      {/* ── ICON STRIP ── */}
      <div className="w-9 bg-[#0e0e10] border-r border-[rgba(255,255,255,0.06)] flex flex-col items-center py-2 gap-0.5 flex-shrink-0">
        {ICONS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleIconClick(item.id)}
            className={`w-8 h-8 flex items-center justify-center rounded-md text-[14px] transition-all ${
              sidebarOpen && sidebarModule === item.id
                ? 'bg-[rgba(108,140,248,0.15)] text-[#6c8cf8]'
                : 'text-[#555560] hover:text-[#888890] hover:bg-[#141416]'
            }`}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[12px] text-[#444450] hover:text-[#888890] hover:bg-[#141416] transition-all"
          title={sidebarOpen ? 'Collapse sidebar (Ctrl+B)' : 'Expand sidebar (Ctrl+B)'}
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </div>

      {/* ── MAIN SIDEBAR ── */}
      {sidebarOpen && (
        <aside
          className="bg-[#111113] border-r border-[rgba(255,255,255,0.06)] flex flex-col overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[rgba(255,255,255,0.05)]">
            <span className="text-[11px] font-semibold text-[#e8e8ea] tracking-wide uppercase">
              {ICONS.find((i) => i.id === sidebarModule)?.label || 'Explorer'}
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-[#555560] hover:text-[#888890] hover:bg-[#1a1a1e] transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Module Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            {sidebarModule === 'explorer' && (
              <div className="flex flex-col h-full">
                <div className="px-2 py-1.5">
                  <RepoPicker />
                </div>
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-1">
                  <FileTree />
                </div>
                <SessionList />
              </div>
            )}
            {sidebarModule === 'browser' && <BrowserViewContainer />}
            {sidebarModule === 'vault' && (
              <PromptVault />
            )}
            {sidebarModule === 'lens' && (
              <UIAnalystPanel />
            )}
          </div>
        </aside>
      )}

      {/* ── RESIZE HANDLE ── */}
      {sidebarOpen && (
        <div
          onMouseDown={startResize}
          className="w-1 cursor-col-resize bg-[rgba(255,255,255,0.04)] hover:bg-[#6c8cf8]/60 active:bg-[#6c8cf8] transition-colors flex-shrink-0"
        />
      )}
    </div>
  );
}

// ── Browser panel placeholder — reports bounds to main process for WebContentsView overlay ──
function BrowserViewContainer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = (window as any).electronAPI ?? (window as any).dyson;
    const report = () => {
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      api.send?.('sidebar:browser-bounds', {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };

    api.send?.('sidebar:panel-visible', { panel: 'browser', visible: true });
    report();

    const obs = new ResizeObserver(report);
    if (containerRef.current) obs.observe(containerRef.current);

    return () => {
      obs.disconnect();
      api.send?.('sidebar:panel-visible', { panel: 'browser', visible: false });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, background: 'transparent' }}
    />
  );
}
