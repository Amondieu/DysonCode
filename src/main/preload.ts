import { contextBridge, ipcRenderer } from 'electron';

// ---- Type definitions for IPC bridge ----

export interface SessionInfo {
  id: number;
  title: string;
  repo_path: string | null;
  text_id?: string | null;
  created_at: string;
  updated_at: string;
  is_active: number;
}

export interface MessageInfo {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  timestamp: string;
}

export interface SessionSummaryInfo {
  id: number;
  session_id: number;
  summary: string;
  key_files: string | null;
  key_decisions: string | null;
  created_at: string;
}

export interface LastSessionData {
  session: SessionInfo;
  messages: MessageInfo[];
}

export interface TerminalSessionInfo {
  id: string;
  title: string;
}

export interface MissionControlSnapshot {
  road: {
    current_node: string;
    node_state: string;
    total_nodes: number;
    completed_nodes: number;
  };
  stream: {
    entries: string[];
    channels: Record<string, string[]>;
  };
  constraint: {
    active_constraints: Array<Record<string, unknown>>;
    last_failure_type: string | null;
  };
  score: {
    total: number;
    pillars: Record<string, number>;
    hard_gates_pass: boolean | null;
    outcome: string | null;
  };
  badge: {
    kind: string;
    status: string;
    color: string;
  };
  self_completion_rate: number;
}

export interface MissionControlStatus {
  state: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
  message: string;
}

export interface PromptVaultInfo {
  id: number;
  title: string;
  task_type: string;
  version: string;
  tags_json: string;
  template: string;
  pinned: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface PromptVaultImportResult {
  imported: number;
  skipped: number;
}

export type GraphMode = 'flow' | 'canvas' | 'mesh';

export interface GraphNode {
  id: string;
  sessionId: string | null;
  type: string;
  modeOrigin: GraphMode;
  label: string | null;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  width: number | null;
  height: number | null;
  hidden: boolean;
  zIndex: number;
  rcScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface GraphEdge {
  id: string;
  sessionId: string | null;
  source: string;
  target: string;
  type: string;
  label: string | null;
  animated: boolean;
  modeVisible: string;
}

export interface CreateNodeArgs {
  sessionId: string;
  nodeType: string;
  modeOrigin: GraphMode;
  label?: string | null;
  data?: Record<string, unknown>;
  posX?: number;
  posY?: number;
  width?: number | null;
  height?: number | null;
  hidden?: boolean;
  zIndex?: number;
}

export interface UpdateNodeArgs {
  nodeId: string;
  data: Record<string, unknown>;
  label?: string | null;
}

export interface CreateEdgeArgs {
  sessionId: string;
  sourceId: string;
  targetId: string;
  edgeType?: string;
  label?: string | null;
  animated?: boolean;
  modeVisible?: string;
}

export interface NodeViewUpdate {
  nodeId: string;
  mode: GraphMode;
  posX: number;
  posY: number;
  width?: number | null;
  height?: number | null;
  hidden?: boolean;
  zIndex?: number;
}

export interface LogExecutionArgs {
  sessionId: string;
  nodeId: string;
  input: string | null;
  output: string | null;
  status: string;
  durationMs?: number | null;
}

export interface ExecutionLogRecord {
  id: string;
  sessionId: string | null;
  nodeId: string | null;
  input: string | null;
  output: string | null;
  status: string;
  durationMs: number | null;
  createdAt: number;
}

export interface AgentExecuteArgs {
  sessionId: string;
  nodeId: string;
  prompt: string;
  model?: string;
  context?: string;
}

export interface AgentExecuteResult {
  content: string;
  tokensUsed: number;
}

export interface ShellExecArgs {
  cwd: string;
  cmd: string;
}

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

// ---- Exposed API ----

const api = {
  // ---- Sessions ----
  createSession: (title: string, repoPath?: string): Promise<SessionInfo> =>
    ipcRenderer.invoke('db:createSession', title, repoPath),

  getAllSessions: (): Promise<SessionInfo[]> =>
    ipcRenderer.invoke('db:getAllSessions'),

  getSessionById: (id: number): Promise<SessionInfo | undefined> =>
    ipcRenderer.invoke('db:getSessionById', id),

  updateSessionTitle: (id: number, title: string): Promise<void> =>
    ipcRenderer.invoke('db:updateSessionTitle', id, title),

  deleteSession: (id: number): Promise<void> =>
    ipcRenderer.invoke('db:deleteSession', id),

  // ---- Messages ----
  insertMessage: (
    sessionId: number,
    role: MessageInfo['role'],
    content: string,
    toolCalls?: string,
    toolResults?: string
  ): Promise<MessageInfo> =>
    ipcRenderer.invoke('db:insertMessage', sessionId, role, content, toolCalls, toolResults),

  getMessagesBySession: (sessionId: number): Promise<MessageInfo[]> =>
    ipcRenderer.invoke('db:getMessagesBySession', sessionId),

  getLastSessionWithMessages: (): Promise<LastSessionData | null> =>
    ipcRenderer.invoke('db:getLastSessionWithMessages'),

  // ---- Summaries ----
  upsertSessionSummary: (
    sessionId: number,
    summary: string,
    keyFiles?: string,
    keyDecisions?: string
  ): Promise<void> =>
    ipcRenderer.invoke('db:upsertSessionSummary', sessionId, summary, keyFiles, keyDecisions),

  getSessionSummary: (sessionId: number): Promise<SessionSummaryInfo | undefined> =>
    ipcRenderer.invoke('db:getSessionSummary', sessionId),

  // ---- Prompt Vault ----
  getPromptVault: (search?: string): Promise<PromptVaultInfo[]> =>
    ipcRenderer.invoke('vault:list', search),

  createPromptVaultEntry: (
    title: string,
    taskType: string,
    version: string,
    tagsJson: string,
    template: string
  ): Promise<PromptVaultInfo> =>
    ipcRenderer.invoke('vault:create', title, taskType, version, tagsJson, template),

  setPromptVaultPinned: (id: number, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke('vault:setPinned', id, pinned),

  recordPromptVaultUse: (id: number): Promise<void> =>
    ipcRenderer.invoke('vault:recordUse', id),

  deletePromptVaultEntry: (id: number): Promise<void> =>
    ipcRenderer.invoke('vault:delete', id),

  pickPromptVaultImportFile: (): Promise<string | null> =>
    ipcRenderer.invoke('vault:pickImportFile'),

  importPromptVaultFromFile: (filePath: string): Promise<PromptVaultImportResult> =>
    ipcRenderer.invoke('vault:importFromFile', filePath),

  graph: {
    getGraph: (sessionId: string, mode: GraphMode): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> =>
      ipcRenderer.invoke('graph:getGraph', sessionId, mode),

    createNode: (args: CreateNodeArgs): Promise<string> =>
      ipcRenderer.invoke('graph:createNode', args),

    updateNode: (args: UpdateNodeArgs): Promise<{ ok: true }> =>
      ipcRenderer.invoke('graph:updateNode', args),

    deleteNode: (nodeId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('graph:deleteNode', nodeId),

    createEdge: (args: CreateEdgeArgs): Promise<string> =>
      ipcRenderer.invoke('graph:createEdge', args),

    deleteEdge: (edgeId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('graph:deleteEdge', edgeId),

    updateLayout: (views: NodeViewUpdate[]): Promise<{ ok: true }> =>
      ipcRenderer.invoke('graph:updateLayout', views),

    logExecution: (args: LogExecutionArgs): Promise<{ ok: true }> =>
      ipcRenderer.invoke('graph:logExecution', args),

    getExecutionLog: (sessionId: string, nodeId?: string | null, limit?: number): Promise<ExecutionLogRecord[]> =>
      ipcRenderer.invoke('graph:getExecutionLog', sessionId, nodeId, limit),
  },

  agent: {
    execute: (args: AgentExecuteArgs): Promise<AgentExecuteResult> =>
      ipcRenderer.invoke('agent:execute', args),
  },

  shell: {
    exec: (args: ShellExecArgs): Promise<ShellExecResult> =>
      ipcRenderer.invoke('shell:exec', args),
  },

  // ---- Terminal ----
  createTerminal: (title?: string): Promise<TerminalSessionInfo> =>
    ipcRenderer.invoke('terminal:create', title),

  terminalWrite: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:write', id, data),

  terminalResize: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),

  terminalKill: (id: string): Promise<void> =>
    ipcRenderer.invoke('terminal:kill', id),

  terminalList: (): Promise<TerminalSessionInfo[]> =>
    ipcRenderer.invoke('terminal:list'),

  // ---- Terminal Events (main -> renderer) ----
  onTerminalData: (callback: (data: { id: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; data: string }) =>
      callback(data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },

  onTerminalExit: (callback: (data: { id: string; exitCode: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; exitCode: number }) =>
      callback(data);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // ---- Mission Control ----
  startMissionControl: (
    spec: string,
    workspaceRoot: string,
    maxSteps = 2,
    executeBuilder = false
  ): Promise<MissionControlStatus> =>
    ipcRenderer.invoke('missionControl:start', spec, workspaceRoot, maxSteps, executeBuilder),

  stopMissionControl: (): Promise<MissionControlStatus> =>
    ipcRenderer.invoke('missionControl:stop'),

  getMissionControlState: (): Promise<MissionControlSnapshot | null> =>
    ipcRenderer.invoke('missionControl:getState'),

  getMissionControlStatus: (): Promise<MissionControlStatus> =>
    ipcRenderer.invoke('missionControl:getStatus'),

  onMissionControlSnapshot: (callback: (data: MissionControlSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: MissionControlSnapshot) =>
      callback(data);
    ipcRenderer.on('mission-control:snapshot', handler);
    return () => ipcRenderer.removeListener('mission-control:snapshot', handler);
  },

  onMissionControlStatus: (callback: (data: MissionControlStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: MissionControlStatus) =>
      callback(data);
    ipcRenderer.on('mission-control:status', handler);
    return () => ipcRenderer.removeListener('mission-control:status', handler);
  },

  // ---- File System ----
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:selectDirectory'),

  listFiles: (dirPath: string): Promise<{ name: string; path: string; isDirectory: boolean }[]> =>
    ipcRenderer.invoke('fs:listFiles', dirPath),

  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  saveFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:saveFile', filePath, content),

  isDirectory: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:isDirectory', filePath),

  // ---- Unified Panel Manager (panels:* namespace) ----
  panelsSetActiveTab: (tab: string): Promise<void> =>
    ipcRenderer.invoke('panels:setActiveTab', tab),

  panelsSetActivePanel: (panel: string | null): Promise<void> =>
    ipcRenderer.invoke('panels:setActivePanel', panel),

  panelsSetBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('panels:setBounds', bounds),

  // Right panel (browser)
  panelsSetRightPanelBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('panels:setRightPanelBounds', bounds),

  panelsRightBrowserNavigate: (url: string): Promise<void> =>
    ipcRenderer.invoke('panels:rightBrowserNavigate', url),

  panelsRightBrowserGoBack: (): Promise<void> =>
    ipcRenderer.invoke('panels:rightBrowserGoBack'),

  panelsRightBrowserGoForward: (): Promise<void> =>
    ipcRenderer.invoke('panels:rightBrowserGoForward'),

  panelsRightBrowserReload: (): Promise<void> =>
    ipcRenderer.invoke('panels:rightBrowserReload'),

  panelsRightBrowserSetZoom: (factor: number): Promise<void> =>
    ipcRenderer.invoke('panels:rightBrowserSetZoom', factor),

  // Browser navigation
  panelsBrowserNavigate: (url: string): Promise<void> =>
    ipcRenderer.invoke('panels:browserNavigate', url),

  panelsBrowserGoBack: (): Promise<void> =>
    ipcRenderer.invoke('panels:browserGoBack'),

  panelsBrowserGoForward: (): Promise<void> =>
    ipcRenderer.invoke('panels:browserGoForward'),

  panelsBrowserReload: (): Promise<void> =>
    ipcRenderer.invoke('panels:browserReload'),

  panelsBrowserSetZoom: (factor: number): Promise<void> =>
    ipcRenderer.invoke('panels:browserSetZoom', factor),

  panelsBrowserGetZoom: (): Promise<number> =>
    ipcRenderer.invoke('panels:browserGetZoom'),

  onPanelsBrowserUrlChanged: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('panels:browserUrlChanged', handler);
    return () => ipcRenderer.removeListener('panels:browserUrlChanged', handler);
  },

  // Monaco file operations
  panelsMonacoOpen: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('panels:monacoOpen', filePath),

  panelsMonacoSave: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('panels:monacoSave', filePath, content),

  // Stream events
  panelsStreamSnapshot: (snapshot: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('panels:streamSnapshot', snapshot),

  panelsStreamEvent: (event: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('panels:streamEvent', event),

  panelsStreamClear: (): Promise<void> =>
    ipcRenderer.invoke('panels:streamClear'),

  // Code-server
  panelsCodeserverSetUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('panels:codeserverSetUrl', url),

  // AdBlock
  panelsGetAdBlockState: (): Promise<{ enabled: boolean; blocked: number }> =>
    ipcRenderer.invoke('panels:getAdBlockState'),

  panelsToggleAdBlock: (): Promise<{ enabled: boolean }> =>
    ipcRenderer.invoke('panels:toggleAdBlock'),

  // ---- Backward compat aliases (deprecated, use panels:* above) ----
  browserNavigate: (url: string): Promise<void> =>
    ipcRenderer.invoke('panels:browserNavigate', url),

  browserGoBack: (): Promise<void> =>
    ipcRenderer.invoke('panels:browserGoBack'),

  browserGoForward: (): Promise<void> =>
    ipcRenderer.invoke('panels:browserGoForward'),

  browserReload: (): Promise<void> =>
    ipcRenderer.invoke('panels:browserReload'),

  browserSetZoom: (factor: number): Promise<void> =>
    ipcRenderer.invoke('panels:browserSetZoom', factor),

  browserGetZoom: (): Promise<number> =>
    ipcRenderer.invoke('panels:browserGetZoom'),

  onBrowserUrlChanged: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('panels:browserUrlChanged', handler);
    return () => ipcRenderer.removeListener('panels:browserUrlChanged', handler);
  },

  panelsDebugViews: (): Promise<unknown> =>
    ipcRenderer.invoke('panels:debugViews'),

  monacoOpen: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('panels:monacoOpen', filePath),

  monacoSave: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('panels:monacoSave', filePath, content),

  streamClear: (): Promise<void> =>
    ipcRenderer.invoke('panels:streamClear'),

  // ---- DysonSphere Intelligence ----
  getDysonIntelligence: (): Promise<{
    knowledgeItems: Array<{ id: string; content: string; hScore: number; source: string; harvestedAt: string }>;
    summary: string;
    harvestedAt: string;
  } | null> => ipcRenderer.invoke('dyson:getIntelligence'),

  refreshDysonIntelligence: (): Promise<{
    knowledgeItems: Array<{ id: string; content: string; hScore: number; source: string; harvestedAt: string }>;
    summary: string;
    harvestedAt: string;
  } | null> => ipcRenderer.invoke('dyson:refreshIntelligence'),

  // ---- Repo Context ----
  getRepoContext: (workspaceRoot: string): Promise<{
    workspaceRoot: string;
    harvestedAt: string;
    modules: string[];
    docs: string[];
    entryPoints: string[];
    lastBuildHash: string | null;
    sprintCount: number;
    summary: string;
    reviewerPersona?: string;
    builderPersona?: string;
    criticPersona?: string;
  }> => ipcRenderer.invoke('repo:getContext', workspaceRoot),

  refreshRepoContext: (workspaceRoot: string): Promise<{
    workspaceRoot: string;
    harvestedAt: string;
    modules: string[];
    docs: string[];
    entryPoints: string[];
    lastBuildHash: string | null;
    sprintCount: number;
    summary: string;
    reviewerPersona?: string;
    builderPersona?: string;
    criticPersona?: string;
  }> => ipcRenderer.invoke('repo:refreshContext', workspaceRoot),

  getRepoPrimer: (workspaceRoot: string): Promise<string> =>
    ipcRenderer.invoke('repo:getPrimer', workspaceRoot),

  // ---- Repo Scanning ----
  scanRepos: (dirPath: string): Promise<Array<{ name: string; path: string; lastUsed: string }>> =>
    ipcRenderer.invoke('repos:scan', dirPath),

  browseRepo: (): Promise<string | null> =>
    ipcRenderer.invoke('repos:browse'),

  // ---- App ----
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),

  openBrowser: (url?: string): Promise<void> =>
    ipcRenderer.invoke('app:openBrowser', url),

  openVSCode: (repoPath?: string): Promise<void> =>
    ipcRenderer.invoke('app:openVSCode', repoPath),

  openCursor: (repoPath?: string): Promise<void> =>
    ipcRenderer.invoke('app:openCursor', repoPath),

  openEmbeddedBrowser: (url: string): Promise<{ id: number }> =>
    ipcRenderer.invoke('app:openEmbeddedBrowser', url),

  // ---- Environment (read-only config) ----
  env: {
    LITELLM_BASE_URL: process.env.LITELLM_BASE_URL || 'http://127.0.0.1:4000/v1',
    LITELLM_API_KEY: process.env.LITELLM_API_KEY || 'grey-os-local',
    KORE_AGENT_MODEL: process.env.KORE_AGENT_MODEL || 'flash-k2',
    KORE_CLOUD_API_URL: process.env.KORE_CLOUD_API_URL || '',
    KORE_CLOUD_API_KEY: process.env.KORE_CLOUD_API_KEY || '',
    KORE_CLOUD_API_MODEL: process.env.KORE_CLOUD_API_MODEL || '',
    KORE_LOCAL_URL: process.env.KORE_LOCAL_URL || '',
    KORE_LOCAL_API_KEY: process.env.KORE_LOCAL_API_KEY || '',
    KORE_LOCAL_MODEL: process.env.KORE_LOCAL_MODEL || '',
    KORE_ROUTING_MODE: process.env.KORE_ROUTING_MODE || 'hybrid',
  },

  // ---- Perplexity Search ----
  perplexitySearch: (query: string): Promise<{ ok: boolean; method?: string; error?: string }> =>
    ipcRenderer.invoke('perplexity:search', query),

  // ---- Jcode Bridge ----
  sendToJcode: (message: string, repoPath?: string): Promise<{ status: string }> =>
    ipcRenderer.invoke('jcode:send', message, repoPath),

  platform: process.platform,
};

contextBridge.exposeInMainWorld('dyson', api);

// ── window.api shim (fix-toolbridge.ps1 contract) ──────────────────────────
// Exposes the same IPC bridge under `window.api` with the contract expected
// by dsml-parser's `runTool` function: readFile → {ok,content}, shellExec(cmd: string).
const apiShim = {
  readFile: (filePath: string): Promise<{ ok: boolean; content?: string; error?: string }> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  saveFile: (filePath: string, content: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:saveFile', filePath, content),

  listDir: (dirPath: string): Promise<{ ok: boolean; entries?: Array<{ name: string; isDir: boolean; path: string }>; error?: string }> =>
    ipcRenderer.invoke('fs:listDir', dirPath),

  shellExec: (cmd: string): Promise<{ ok: boolean; output: string }> =>
    ipcRenderer.invoke('shell:exec', cmd),
};

contextBridge.exposeInMainWorld('api', apiShim);

// ── kore-exec subprocess bridge ─────────────────────────────────────────────
// Runs tool calls through the Rust kore-exec binary via IPC.
const koreApi = {
  execute: (tool: string, args: Record<string, string>, workspaceRoot?: string): Promise<{
    status: string;
    output: string;
    error?: string;
  }> => ipcRenderer.invoke('kore:execute', { tool, args, workspaceRoot }),
};

contextBridge.exposeInMainWorld('kore', koreApi);

// ── kore Python pipeline bridge ─────────────────────────────────────────────
const pipelineApi = {
  precheck: (input: { text: string; repoPath?: string }): Promise<{
    ok: boolean; passed?: boolean; gates?: any[]; error?: string;
  }> => ipcRenderer.invoke('kore:precheck', input),

  run: (input: { text: string; repoPath?: string }): Promise<{
    ok: boolean; passed?: boolean; stages?: any[]; latency_ms?: number; error?: string;
  }> => ipcRenderer.invoke('kore:pipeline', input),
};

contextBridge.exposeInMainWorld('pipeline', pipelineApi);

// ── kore memory graph bridge ────────────────────────────────────────────────
const memoryApi = {
  store: (sessionId: string, kind: string, content: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('memory:store', { sessionId, kind, content }),

  getContext: (sessionId: string): Promise<{
    ok: boolean; nodes?: Array<{ kind: string; content: string; temperature: string }>; error?: string;
  }> => ipcRenderer.invoke('memory:getContext', sessionId),

  clear: (sessionId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('memory:clear', sessionId),
};

contextBridge.exposeInMainWorld('memory', memoryApi);

// ── Real jcode v0.29.0+ bridge ──────────────────────────────────────────────
const jcodeApi = {
  run: (message: string, options?: { provider?: string; model?: string }): Promise<{
    ok: boolean;
    events: Array<{ type: string; content?: string; tool?: string; input?: string }>;
    error?: string;
  }> => ipcRenderer.invoke('jcode:run', { message, ...options }),
};

contextBridge.exposeInMainWorld('jcode', jcodeApi);

// ── Unified IPC surface for ChatPanel hooks ─────────────────────────────────
// send(ch, data?)  — fire-and-forget to main process
// invoke(ch, data?) — request/response to main process
// on(ch, cb)       — subscribe to event, returns unsubscribe fn
const electronApi = {
  send: (ch: string, data?: unknown) => ipcRenderer.send(ch, data),
  invoke: (ch: string, data?: unknown) => ipcRenderer.invoke(ch, data),
  on: (ch: string, cb: (...args: any[]) => void) => {
    const listener = (_: Electron.IpcRendererEvent, ...args: any[]) => cb(...args);
    ipcRenderer.on(ch, listener);
    return () => ipcRenderer.removeListener(ch, listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

export type DysonAPI = typeof api;
