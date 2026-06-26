import React from 'react';
import { useAppStore } from '../store/appStore';
import { useIpc } from '../hooks/useIpc';

export default function RepoPicker() {
  const ipc = useIpc();
  const { repoPath, setRepoPath, setFileTree } = useAppStore();

  const handlePickRepo = async () => {
    const dir = await ipc.selectDirectory();
    if (dir) {
      setRepoPath(dir);
      const files = await ipc.listFiles(dir);
      setFileTree(files);
    }
  };

  return (
    <div className="px-3 py-2 border-b border-dyson-border">
      <button
        onClick={handlePickRepo}
        className="w-full text-left px-2 py-1.5 rounded text-xs bg-dyson-bg border border-dyson-border text-dyson-muted hover:text-dyson-text hover:border-dyson-accent transition-colors truncate"
      >
        {repoPath ? (
          <span className="flex items-center gap-2">
            <span className="text-dyson-green">📁</span>
            <span className="truncate">{repoPath.split(/[/\\]/).pop()}</span>
          </span>
        ) : (
          '📂 Open Repository...'
        )}
      </button>
    </div>
  );
}
