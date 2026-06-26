/**
 * PanelContentRenderer — routes panel type to the correct component.
 * Uses lazy loading to prevent circular dependency crashes on startup.
 */
import React, { lazy, Suspense } from 'react';

const ChatPanel = lazy(() => import('./ChatPanel'));
const BrowserPanel = lazy(() => import('./BrowserPanel'));
const CodeServerPanel = lazy(() => import('./CodeServerPanel'));
const TerminalPanel = lazy(() => import('./Terminal'));

export type PanelContent = 'chat' | 'browser' | 'editor' | 'terminal' | 'empty';

function Fallback() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#555555', fontSize: 11, fontFamily: 'monospace',
    }}>
      loading...
    </div>
  );
}

interface Props {
  content: PanelContent;
  activeSession?: any;
  repoPath?: string | null;
  activePanel?: string;
}

export default function PanelContentRenderer({ content, activeSession, repoPath, activePanel }: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      {content === 'chat' && <ChatPanel />}
      {content === 'browser' && <BrowserPanel activeMainTab={activePanel as any} activeCenterPanel="browser" />}
      {content === 'editor' && <CodeServerPanel />}
      {content === 'terminal' && <TerminalPanel />}
      {content === 'empty' && (
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#555555', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
        }}>
          Drop a panel here
        </div>
      )}
    </Suspense>
  );
}
