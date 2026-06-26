import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useIpc } from '../hooks/useIpc';

export default function SessionList() {
  const ipc = useIpc();
  const {
    sessions,
    activeSessionId,
    repoPath,
    setActiveSession,
    setSessions,
    setMessages,
    setRepoPath,
    setFileTree,
  } = useAppStore();
  const [newTitle, setNewTitle] = useState('');

  const handleNewSession = async () => {
    const title = newTitle.trim() || 'New Session';
    const session = await ipc.createSession(title, repoPath ?? undefined);
    setSessions([session, ...sessions]);
    setActiveSession(session.id);
    setNewTitle('');
  };

  const handleSelect = async (id: number) => {
    setActiveSession(id);
    const msgs = await ipc.getMessagesBySession(id);
    setMessages(msgs);
    const session = sessions.find((item) => item.id === id);
    if (session?.repo_path) {
      setRepoPath(session.repo_path);
      const files = await ipc.listFiles(session.repo_path);
      setFileTree(files);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await ipc.deleteSession(id);
    setSessions(sessions.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSession(null);
      setMessages([]);
    }
  };

  return (
    <div className="border-t border-dyson-border flex flex-col max-h-48">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-dyson-muted uppercase tracking-wider">
          Sessions
        </span>
      </div>

      {/* New Session Input */}
      <div className="px-2 pb-1 flex gap-1">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleNewSession()}
          placeholder="Session name..."
          className="flex-1 text-xs bg-dyson-bg border border-dyson-border rounded px-2 py-1 text-dyson-text placeholder-dyson-muted outline-none focus:border-dyson-accent"
        />
        <button
          onClick={handleNewSession}
          className="text-xs bg-dyson-accent text-white rounded px-2 py-1 hover:opacity-80 transition-opacity"
        >
          +
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="text-xs text-dyson-muted text-center py-4">No sessions yet</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => handleSelect(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
              s.id === activeSessionId
                ? 'bg-dyson-accent/15 text-dyson-accent border-l-2 border-dyson-accent'
                : 'text-dyson-text hover:bg-dyson-border/30 border-l-2 border-transparent'
            }`}
          >
            <span className="truncate flex-1">{s.title}</span>
            <button
              onClick={(e) => handleDelete(s.id, e)}
              className="text-dyson-muted hover:text-dyson-red opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete session"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
