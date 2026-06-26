import React, { useEffect, useState } from 'react';
import { useAppStore, type PromptVaultItem } from '../store/appStore';
import { useIpc } from '../hooks/useIpc';

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function PromptVault() {
  const ipc = useIpc();
  const {
    activeSessionId,
    activePanel,
    chatDraft,
    sessions,
    setActivePanel,
    setActiveSession,
    setChatDraft,
    setSessions,
  } = useAppStore();
  const [items, setItems] = useState<PromptVaultItem[]>([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState('general');
  const [tags, setTags] = useState('');
  const [template, setTemplate] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [importBusy, setImportBusy] = useState(false);

  const load = async (query = search) => {
    const rows = await ipc.getPromptVault(query);
    setItems(rows as PromptVaultItem[]);
  };

  useEffect(() => {
    load('');
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      load(search);
    }, 120);
    return () => window.clearTimeout(handle);
  }, [search]);

  const ensureSession = async () => {
    if (activeSessionId) {
      return activeSessionId;
    }
    const session = await ipc.createSession('Prompt Session');
    setSessions([session, ...sessions]);
    setActiveSession(session.id);
    return session.id;
  };

  const injectPrompt = async (item: PromptVaultItem) => {
    await ensureSession();
    const nextDraft = chatDraft.trim()
      ? `${chatDraft.trim()}\n\n${item.template}`
      : item.template;
    setChatDraft(nextDraft);
    setActivePanel('chat');
    await ipc.recordPromptVaultUse(item.id);
    await load(search);
  };

  const togglePinned = async (item: PromptVaultItem) => {
    await ipc.setPromptVaultPinned(item.id, item.pinned === 0);
    await load(search);
  };

  const createEntry = async () => {
    const trimmedTitle = title.trim();
    const trimmedTemplate = template.trim();
    if (!trimmedTitle || !trimmedTemplate) {
      return;
    }
    const tagList = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    await ipc.createPromptVaultEntry(
      trimmedTitle,
      taskType.trim() || 'general',
      'v1',
      JSON.stringify(tagList),
      trimmedTemplate
    );
    setTitle('');
    setTaskType('general');
    setTags('');
    setTemplate('');
    setExpanded(false);
    await load(search);
  };

  const importFromFile = async () => {
    setImportStatus('');
    const filePath = await ipc.pickPromptVaultImportFile();
    if (!filePath) {
      return;
    }

    setImportBusy(true);
    try {
      const result = await ipc.importPromptVaultFromFile(filePath);
      setImportStatus(`Imported ${result.imported}, skipped ${result.skipped}`);
      await load(search);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportStatus(`Import failed: ${message}`);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="border-t border-dyson-border flex flex-col max-h-80">
      <div className="px-3 py-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-dyson-muted uppercase tracking-wider">
          Prompt Vault
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={importFromFile}
            disabled={importBusy}
            className="text-xs text-dyson-accent hover:opacity-80 disabled:opacity-40"
            title="Import prompts from JSON"
          >
            {importBusy ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={() => setExpanded((value) => !value)}
            className="text-xs text-dyson-accent hover:opacity-80"
            title="Add prompt"
          >
            {expanded ? 'Close' : 'New'}
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="px-2 pb-2">
          <div className="text-[11px] text-dyson-muted bg-dyson-panel rounded px-2 py-1 border border-dyson-border">
            {importStatus}
          </div>
        </div>
      )}

      <div className="px-2 pb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prompts..."
          className="w-full text-xs bg-dyson-bg border border-dyson-border rounded px-2 py-1 text-dyson-text placeholder-dyson-muted outline-none focus:border-dyson-accent"
        />
      </div>

      {expanded && (
        <div className="px-2 pb-2 space-y-1 border-b border-dyson-border">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Prompt title"
            className="w-full text-xs bg-dyson-bg border border-dyson-border rounded px-2 py-1 text-dyson-text outline-none focus:border-dyson-accent"
          />
          <input
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            placeholder="Task type"
            className="w-full text-xs bg-dyson-bg border border-dyson-border rounded px-2 py-1 text-dyson-text outline-none focus:border-dyson-accent"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tag1, tag2"
            className="w-full text-xs bg-dyson-bg border border-dyson-border rounded px-2 py-1 text-dyson-text outline-none focus:border-dyson-accent"
          />
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={4}
            placeholder="Prompt template"
            className="w-full resize-none text-xs bg-dyson-bg border border-dyson-border rounded px-2 py-1 text-dyson-text outline-none focus:border-dyson-accent font-mono"
          />
          <button
            onClick={createEntry}
            className="w-full text-xs bg-dyson-accent text-white rounded px-2 py-1 hover:opacity-80"
          >
            Save Prompt
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-dyson-muted text-center py-4">No prompts found</p>
        )}
        {items.map((item) => {
          const tagsList = parseTags(item.tags_json);
          return (
            <div key={item.id} className="border border-dyson-border rounded bg-dyson-bg/60 p-2">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => togglePinned(item)}
                  className={`text-xs ${item.pinned ? 'text-dyson-accent' : 'text-dyson-muted hover:text-dyson-text'}`}
                  title="Toggle pin"
                >
                  {item.pinned ? '★' : '☆'}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-dyson-text truncate">{item.title}</span>
                    <span className="text-[10px] text-dyson-muted uppercase">{item.task_type}</span>
                  </div>
                  <p className="text-[11px] text-dyson-muted mt-1 line-clamp-3">{item.template}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tagsList.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-dyson-panel text-dyson-muted">
                        {tag}
                      </span>
                    ))}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-dyson-panel text-dyson-muted">
                      used {item.use_count}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => injectPrompt(item)}
                  className="flex-1 text-xs bg-dyson-accent/20 text-dyson-accent rounded px-2 py-1 hover:bg-dyson-accent/30"
                >
                  Inject
                </button>
                <button
                  onClick={async () => {
                    await ipc.deletePromptVaultEntry(item.id);
                    await load(search);
                  }}
                  className="text-xs text-dyson-muted hover:text-dyson-red px-2 py-1"
                  title="Delete prompt"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}