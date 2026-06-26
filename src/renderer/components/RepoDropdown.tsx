import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore, RepoEntry } from '../store/appStore';

/**
 * RepoDropdown — A slim dropdown for selecting the active workspace/repository.
 * Shows the active repo name, with a dropdown to switch or browse for a new one.
 * The active repo is passed to jcode as the cwd/workspace for tool execution.
 * Repository context (modules, docs, exports) is harvested on selection.
 */
export function RepoDropdown() {
  const { repos, activeRepo, setRepos, setActiveRepo, setRepoPath, setFileTree, resetChat } = useAppStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [scanRoot, setScanRoot] = useState('');
  const [scanning, setScanning] = useState(false);
  const [contextStatus, setContextStatus] = useState<'idle' | 'harvesting' | 'ready' | 'error'>('idle');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const api = (window as any).dyson;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Harvest repo context from the active repo on first mount
  useEffect(() => {
    if (activeRepo) {
      refreshContext(activeRepo.path);
    }
  }, []);

  const refreshContext = useCallback(async (repoPath: string) => {
    if (!api?.refreshRepoContext) return;
    setContextStatus('harvesting');
    try {
      const ctx = await api.refreshRepoContext(repoPath);
      if (ctx) setContextStatus('ready');
      else setContextStatus('error');
    } catch {
      setContextStatus('error');
    }
  }, [api]);

  // Scan common repo roots on first mount
  useEffect(() => {
    if (repos.length > 0) return;
    const scanHomeDirs = async () => {
      setScanning(true);
      const rootsToTry: string[] = [];

      // User home
      const home = process.env.USERPROFILE || process.env.HOME || '';
      if (home) {
        rootsToTry.push(home);
        // Common subdirectories
        const subs = ['source', 'projects', 'repos', 'dev', 'code', 'workspace', 'git', 'src', 'Desktop', 'Documents'];
        for (const sub of subs) {
          rootsToTry.push(home + '\\' + sub);
        }
      }

      // Drive roots
      for (const drive of ['D:\\', 'E:\\', 'F:\\', 'G:\\', 'H:\\']) {
        rootsToTry.push(drive);
      }

      const seen = new Set<string>();
      for (const root of rootsToTry) {
        if (seen.has(root)) continue;
        seen.add(root);
        try {
          const entries = await api.scanRepos(root);
          if (entries && entries.length > 0) {
            setRepos(entries);
            setScanRoot(root);
            // Auto-select the first repo if none active
            const store = useAppStore.getState();
            if (!store.activeRepo && entries.length > 0) {
              await activateRepo(entries[0]);
            }
            setScanning(false);
            return;
          }
        } catch {}
      }
      setScanning(false);
    };
    scanHomeDirs();
  }, []);

  const activateRepo = useCallback(async (repo: RepoEntry) => {
    useAppStore.getState().setActiveRepo(repo);
    useAppStore.getState().setRepoPath(repo.path);
    try {
      const files = await api.listFiles(repo.path);
      useAppStore.getState().setFileTree(files);
    } catch {}
    // Harvest repo context
    refreshContext(repo.path);
    useAppStore.getState().resetChat();
  }, [api, refreshContext]);

  const handleBrowse = useCallback(async () => {
    const dir = await api.browseRepo();
    if (!dir) return;
    const entry: RepoEntry = {
      name: dir.split(/[/\\]/).pop() || 'repo',
      path: dir.replace(/\\/g, '/'),
      lastUsed: new Date().toISOString(),
    };
    // Also scan for repos inside the chosen folder
    let foundRepos: RepoEntry[] = [];
    try {
      const scanned = await api.scanRepos(dir);
      if (scanned && scanned.length > 0) {
        foundRepos = scanned;
      }
    } catch {}

    // If we found repos inside, show them all; otherwise use the folder itself
    const allRepos = foundRepos.length > 0
      ? foundRepos
      : [entry];

    useAppStore.getState().setRepos([...allRepos, ...useAppStore.getState().repos.filter(r => !allRepos.some(a => a.path === r.path))]);
    await activateRepo(allRepos[0]);
    setOpen(false);
    setSearch('');
  }, [api, activateRepo]);

  const handleSelectRepo = useCallback(async (repo: RepoEntry) => {
    await activateRepo(repo);
    setOpen(false);
    setSearch('');
  }, [activateRepo]);

  const filteredRepos = search
    ? repos.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.path.toLowerCase().includes(search.toLowerCase()))
    : repos;

  const sortedRepos = [...filteredRepos].sort(
    (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
  );

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={activeRepo ? `Repository: ${activeRepo.path}` : 'Select a repository'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 10px',
          borderRadius: '6px',
          border: '1px solid var(--jcode-border, rgba(255,255,255,0.06))',
          background: activeRepo ? 'var(--jcode-surface-2, #141518)' : 'transparent',
          color: activeRepo ? 'var(--jcode-cyan, #00d4d4)' : 'var(--jcode-text-muted, #6b7280)',
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer',
          transition: 'all 150ms ease',
          maxWidth: '220px',
        }}
        onMouseEnter={e => {
          (e.target as HTMLElement).style.borderColor = 'var(--jcode-cyan-dim, #00a8a8)';
        }}
        onMouseLeave={e => {
          (e.target as HTMLElement).style.borderColor = 'var(--jcode-border, rgba(255,255,255,0.06))';
        }}
      >
        <span style={{ fontSize: '11px', opacity: 0.8 }}>
          {scanning ? '🔎' : activeRepo ? '📁' : '📂'}
        </span>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {scanning ? 'Scanning...' : activeRepo ? activeRepo.name : 'No repo'}
        </span>
        {activeRepo && (
          <span style={{ fontSize: '9px', marginLeft: '2px', opacity: 0.5 }} title={
            contextStatus === 'ready' ? 'Context ready' :
            contextStatus === 'harvesting' ? 'Harvesting context...' :
            contextStatus === 'error' ? 'Context failed' : ''
          }>
            {contextStatus === 'ready' ? '✓' :
             contextStatus === 'harvesting' ? '⟳' :
             contextStatus === 'error' ? '⚠' : ''}
          </span>
        )}
        <span style={{ fontSize: '8px', opacity: 0.6, marginLeft: 'auto' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '300px',
            maxWidth: '400px',
            maxHeight: '360px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--jcode-surface, #0f1012)',
            border: '1px solid var(--jcode-border-bright, rgba(255,255,255,0.12))',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: 1000,
          }}
        >
          {/* Search bar */}
          <div style={{
            padding: '8px',
            borderBottom: '1px solid var(--jcode-border, rgba(255,255,255,0.06))',
          }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search repos…"
              style={{
                width: '100%',
                border: '1px solid var(--jcode-border, rgba(255,255,255,0.06))',
                borderRadius: '4px',
                padding: '6px 8px',
                background: 'var(--jcode-surface-3, #191b1f)',
                color: 'var(--jcode-text, #e2e4e8)',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--jcode-cyan-dim, #00a8a8)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--jcode-border, rgba(255,255,255,0.06))';
              }}
            />
          </div>

          {/* Repo list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px',
          }}>
            {scanning && (
              <div style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--jcode-text-faint, #374151)',
                fontSize: '11px',
              }}>
                🔎 Scanning for repositories...
              </div>
            )}
            {!scanning && sortedRepos.length === 0 && (
              <div style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--jcode-text-faint, #374151)',
                fontSize: '11px',
              }}>
                {search ? 'No repos match your search' : 'No repos found — click "Browse" below'}
              </div>
            )}
            {sortedRepos.slice(0, 20).map(repo => (
              <button
                key={repo.path}
                onClick={() => handleSelectRepo(repo)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  background: activeRepo?.path === repo.path ? 'var(--jcode-cyan-glow, rgba(0,212,212,0.08))' : 'transparent',
                  color: activeRepo?.path === repo.path ? 'var(--jcode-cyan, #00d4d4)' : 'var(--jcode-text, #e2e4e8)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={e => {
                  if (activeRepo?.path !== repo.path) {
                    (e.target as HTMLElement).style.background = 'var(--jcode-surface-2, #141518)';
                  }
                }}
                onMouseLeave={e => {
                  if (activeRepo?.path !== repo.path) {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '10px', opacity: 0.6 }}>📁</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: activeRepo?.path === repo.path ? 600 : 400,
                  }}>
                    {repo.name}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--jcode-text-faint, #374151)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {repo.path}
                  </div>
                </div>
                {activeRepo?.path === repo.path && (
                  <span style={{ fontSize: '10px', color: 'var(--jcode-cyan, #00d4d4)' }}>✓</span>
                )}
              </button>
            ))}
          </div>

          {/* Browse + rescan actions */}
          <div style={{
            padding: '4px',
            borderTop: '1px solid var(--jcode-border, rgba(255,255,255,0.06))',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            <button
              onClick={handleBrowse}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: '6px 8px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--jcode-text-muted, #6b7280)',
                fontSize: '11px',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: "'JetBrains Mono', monospace",
                transition: 'color 100ms ease',
              }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.color = 'var(--jcode-text, #e2e4e8)';
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.color = 'var(--jcode-text-muted, #6b7280)';
              }}
            >
              <span>🔍</span>
              <span>Browse for folder…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
