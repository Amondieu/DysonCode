import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useAppStore } from '../store/appStore';
import { useIpc } from '../hooks/useIpc';

export default function EditorPanel() {
  const ipc = useIpc();
  const { openFilePath, openFileContent, setOpenFile } = useAppStore();

  const handleSave = async () => {
    if (!openFilePath || !openFileContent) return;
    await ipc.saveFile(openFilePath, openFileContent);
  };

  const getLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      ps1: 'powershell',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      md: 'markdown',
      sql: 'sql',
      graphql: 'graphql',
      dockerfile: 'dockerfile',
      toml: 'toml',
      ini: 'ini',
      env: 'plaintext',
      gitignore: 'plaintext',
    };
    return map[ext || ''] || 'plaintext';
  };

  if (!openFilePath) {
    return (
      <div className="h-full flex items-center justify-center bg-dyson-bg">
        <div className="text-center">
          <span className="text-4xl block mb-3">📝</span>
          <p className="text-dyson-muted text-sm">No file open</p>
          <p className="text-dyson-muted text-xs mt-1">
            Click a file in the sidebar to open it
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor Toolbar */}
      <div className="flex items-center h-8 bg-dyson-panel border-b border-dyson-border px-2 gap-2 text-xs">
        <span className="text-dyson-muted truncate max-w-md">
          {openFilePath}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-dyson-accent text-white rounded hover:opacity-80 transition-opacity"
        >
          Save
        </button>
        <button
          onClick={() => setOpenFile(null, null)}
          className="px-3 py-1 text-dyson-muted hover:text-dyson-text transition-colors"
        >
          Close
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <MonacoEditor
          language={getLanguage(openFilePath)}
          value={openFileContent ?? ''}
          onChange={(value) => setOpenFile(openFilePath, value ?? '')}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontLigatures: true,
            minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            tabSize: 2,
            wordWrap: 'off',
            bracketPairColorization: { enabled: true },
            automaticLayout: true,
            padding: { top: 8 },
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <span className="text-dyson-muted text-sm">Loading editor...</span>
            </div>
          }
        />
      </div>
    </div>
  );
}
