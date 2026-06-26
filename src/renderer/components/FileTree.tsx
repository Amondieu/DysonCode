import React, { useCallback } from 'react';
import { useAppStore, FileEntry } from '../store/appStore';
import { useIpc } from '../hooks/useIpc';

function TreeNode({ entry, depth }: { entry: FileEntry; depth: number }) {
  const ipc = useIpc();
  const { expandedDirs, toggleDir, setFileTree, repoPath, setOpenFile, setActivePanel } =
    useAppStore();

  const handleClick = useCallback(async () => {
    if (entry.isDirectory) {
      toggleDir(entry.path);
      const files = await ipc.listFiles(entry.path);
      // Merge into existing tree — for simplicity we just replace
      // In a full impl you'd insert children in-place
      setFileTree(files);
    } else {
      try {
        const content = await ipc.readFile(entry.path);
        setOpenFile(entry.path, content);
        setActivePanel('chat');
      } catch {
        // binary file, ignore
      }
    }
  }, [entry]);

  const isExpanded = expandedDirs.has(entry.path);

  return (
    <div>
      <div
        onClick={handleClick}
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-dyson-border/50 text-xs select-none"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-dyson-muted w-4 text-center">
          {entry.isDirectory ? (isExpanded ? '▾' : '▸') : ''}
        </span>
        <span className="mr-1">{entry.isDirectory ? '📁' : '📄'}</span>
        <span className="truncate text-dyson-text">{entry.name}</span>
      </div>
    </div>
  );
}

export default function FileTree() {
  const { repoPath, fileTree } = useAppStore();

  if (!repoPath) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-dyson-muted text-center">
          Open a repository to browse files
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {fileTree.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={0} />
      ))}
    </div>
  );
}
