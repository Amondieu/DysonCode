import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import TerminalPanel from './components/Terminal';
import ChatPanel from './components/ChatPanel';
import BrowserPanel from './components/BrowserPanel';
import FlowCanvas from './components/flow/FlowCanvas';
import { useAppStore } from './store/appStore';
import { useLoadSessions, useLoadMessages, useMissionControlBridge } from './hooks/useIpc';

function ChatWorkspace({ activePanel }: { activePanel: string }) {
  const ipc = (window as any).dyson;

  const [termHeight, setTermHeight] = useState(100);
  const [termVisible, setTermVisible] = useState(true);
  const [centerPanelContent, setCenterPanelContent] = useState<'chat' | 'browser'>('chat');
  const draggingV = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipc?.panelsSetActiveTab?.(activePanel);
  }, [activePanel, ipc]);

  // Sync center panel content choice to panel-manager
  useEffect(() => {
    if (centerPanelContent === 'browser') {
      ipc?.panelsSetActivePanel?.('browser');
    } else {
      ipc?.panelsSetActivePanel?.(null);
    }
  }, [centerPanelContent, ipc]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!containerRef.current || !draggingV.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const h = rect.bottom - e.clientY;
      setTermHeight(Math.max(60, Math.min(400, h)));
    };
    const up = () => {
      if (draggingV.current) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      draggingV.current = false;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const startV = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingV.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-dyson-bg min-h-0">
      {/* Center panel toggle bar */}
      <div className="flex items-center h-6 bg-dyson-panel border-b border-dyson-border px-2 gap-1 flex-shrink-0">
        {(['chat', 'browser'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setCenterPanelContent(mode)}
            className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
              centerPanelContent === mode
                ? 'text-[#6c8cf8] bg-[rgba(108,140,248,0.1)]'
                : 'text-[#555560] hover:text-[#888890]'
            }`}
          >
            {mode === 'chat' ? '💬 Chat' : '🌐 Browser'}
          </button>
        ))}
      </div>
      {/* Center panel content */}
      {centerPanelContent === 'chat' ? (
        <div className="flex-1 min-h-0 chat-panel-root">
          <ChatPanel />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <BrowserPanel activeMainTab={activePanel as any} activeCenterPanel="browser" />
        </div>
      )}
      <div className="flex items-center h-5 bg-dyson-panel border-t border-dyson-border gap-0 flex-shrink-0">
        <div className="flex items-center gap-0.5 px-1">
          {['terminal', 'output', 'problems'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                localStorage.setItem('kore-console-tab', tab);
              }}
              className={`px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded transition-colors ${
                ((typeof localStorage !== 'undefined' ? localStorage.getItem('kore-console-tab') || 'terminal' : 'terminal') === tab)
                  ? 'text-[#6c8cf8] bg-[rgba(108,140,248,0.1)]'
                  : 'text-[#555560] hover:text-[#888890]'
              }`}
            >
              {tab === 'terminal' ? '⌨️ Terminal' : tab === 'output' ? '📤 Output' : '⚠️ Problems'}
            </button>
          ))}
        </div>
        <div onMouseDown={startV} className="flex-1 h-2 cursor-row-resize hover:bg-dyson-accent/60 active:bg-dyson-accent transition-colors" />
        <button onClick={() => setTermVisible(!termVisible)} className="text-[10px] text-[#444450] hover:text-[#888890] px-1.5 transition-colors" title={termVisible ? 'Hide console' : 'Show console'}>
          {termVisible ? '▼' : '▲'}
        </button>
      </div>
      {termVisible && (
        <div className="shrink-0 bg-dyson-bg" style={{ height: termHeight }}>
          <TerminalPanel />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const ipc = (window as any).dyson;
  const { activePanel, setActivePanel, sidebarOpen, setSidebarOpen, repoPath, rightPanelOpen, setRightPanelOpen } = useAppStore();
  useLoadSessions();
  useLoadMessages(null);
  useMissionControlBridge();

  return (
    <div className="flex flex-col bg-dyson-bg" style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden' }}>
      <div className="flex-1 flex min-h-0">
        {sidebarOpen && <Sidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center h-7 bg-dyson-panel border-b border-dyson-border px-2 gap-1 flex-shrink-0">
            {(['chat', 'flow', 'canvas', 'mesh'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActivePanel(tab)}
                className={`px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
                  activePanel === tab
                    ? 'text-[#6c8cf8] bg-[rgba(108,140,248,0.1)]'
                    : 'text-[#555560] hover:text-[#888890]'
                }`}
              >
                {tab === 'chat' ? '💬 Chat' : tab === 'flow' ? '🔀 Flow' : tab === 'canvas' ? '🎨 Canvas' : '🕸️ Mesh'}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-[10px] text-[#444450] hover:text-[#888890] px-1 transition-colors" title="Toggle left sidebar">
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className="text-[10px] text-[#444450] hover:text-[#888890] px-1 transition-colors" title="Toggle right panel">
              {rightPanelOpen ? '▶' : '◀'}
            </button>
          </div>
          {activePanel === 'chat' && <ChatWorkspace activePanel={activePanel} />}
          {activePanel === 'flow' && <FlowCanvas activeSession={null} repoPath={repoPath} />}
        </div>
        {rightPanelOpen && <RightPanel />}
      </div>
    </div>
  );
}
