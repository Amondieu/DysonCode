import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useAppStore } from '../store/appStore';
import { useIpc, useTerminalLifecycle } from '../hooks/useIpc';
import 'xterm/css/xterm.css';

export default function TerminalPanel() {
  const ipc = useIpc();
  const { activeTerminalId, terminals } = useAppStore();
  const { createTerminal, killTerminal } = useTerminalLifecycle();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Initialize xterm.js
  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ff7b72',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Listen for data from main process
    const unsub = ipc.onTerminalData(({ data }) => {
      term.write(data);
    });

    // Send user input to main process
    term.onData((data) => {
      if (activeTerminalId) {
        ipc.terminalWrite(activeTerminalId, data);
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (activeTerminalId) {
        ipc.terminalResize(activeTerminalId, term.cols, term.rows);
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(termRef.current);

    return () => {
      observer.disconnect();
      unsub();
      term.dispose();
    };
  }, []);

  // Switch active terminal
  useEffect(() => {
    if (!activeTerminalId || !xtermRef.current) return;
    xtermRef.current.clear();
    fitAddonRef.current?.fit();
  }, [activeTerminalId]);

  const handleNewTerminal = async () => {
    await createTerminal('Shell');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Terminal Tabs */}
      <div className="flex items-center h-8 bg-dyson-panel border-b border-dyson-border px-1 gap-0 overflow-x-auto">
        {terminals.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-1 px-3 py-1 text-xs cursor-pointer border-r border-dyson-border whitespace-nowrap ${
              t.id === activeTerminalId
                ? 'bg-dyson-bg text-dyson-text'
                : 'text-dyson-muted hover:text-dyson-text'
            }`}
            onClick={() => useAppStore.getState().setActiveTerminal(t.id)}
          >
            <span>{t.title}</span>
            {terminals.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  killTerminal(t.id);
                }}
                className="text-dyson-muted hover:text-dyson-red ml-1"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleNewTerminal}
          className="px-2 text-xs text-dyson-muted hover:text-dyson-text transition-colors"
        >
          +
        </button>
      </div>

      {/* Terminal Output */}
      <div ref={termRef} className="flex-1" />
    </div>
  );
}
