import { create } from 'zustand';
import type { CognitiveFrame, KORERole, ModuleCategory } from '../data/module-registry';

let layoutCommitTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLayoutViews: NodeViewUpdate[] = [];
let pendingLayoutResolvers: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

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

export interface TerminalInfo {
  id: string;
  title: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface PromptVaultItem {
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

export interface RepoEntry {
  name: string;
  path: string;
  lastUsed: string; // ISO date string
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

export type GraphMode = 'flow' | 'canvas' | 'mesh';

export type EdgeSemanticType = 'data' | 'challenge' | 'synthesis' | 'memory' | 'trigger' | 'broadcast';

export interface CognitiveNodeFields {
  frame?: CognitiveFrame;
  role?: KORERole;
  category?: ModuleCategory;
  moduleId?: string;
  persona?: string;
  capabilities?: string[];
}

export interface GraphNode {
  id: string;
  sessionId: string | null;
  type: string;
  modeOrigin: GraphMode;
  label: string | null;
  data: Record<string, unknown> & Partial<CognitiveNodeFields>;
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
  edgeType?: EdgeSemanticType | string;
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

function panelToGraphMode(panel: PanelView): GraphMode | null {
  if (panel === 'flow' || panel === 'canvas' || panel === 'mesh') {
    return panel;
  }
  return null;
}

function scheduleLayoutCommit(views: NodeViewUpdate[]) {
  pendingLayoutViews = views;

  return new Promise<void>((resolve, reject) => {
    pendingLayoutResolvers.push({ resolve, reject });
    if (layoutCommitTimer) {
      clearTimeout(layoutCommitTimer);
    }

    layoutCommitTimer = setTimeout(async () => {
      const resolvers = pendingLayoutResolvers;
      const nextViews = pendingLayoutViews;
      pendingLayoutResolvers = [];
      pendingLayoutViews = [];
      layoutCommitTimer = null;

      try {
        await window.dyson.graph.updateLayout(nextViews);
        resolvers.forEach((entry) => entry.resolve());
      } catch (error) {
        resolvers.forEach((entry) => entry.reject(error));
      }
    }, 500);
  });
}

export type PanelView = 'chat' | 'flow' | 'canvas' | 'mesh';

interface AppState {
  // Sessions
  sessions: SessionInfo[];
  activeSessionId: number | null;
  messages: MessageInfo[];

  // Terminals
  terminals: TerminalInfo[];
  activeTerminalId: string | null;

  // Editor
  openFilePath: string | null;
  openFileContent: string | null;

  // File Tree
  repoPath: string | null;
  fileTree: FileEntry[];
  expandedDirs: Set<string>;

  // UI
  activePanel: PanelView;
  activeMode: GraphMode;
  sidebarOpen: boolean;
  sidebarModule: 'explorer' | 'browser' | 'vault' | 'lens';
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  lastSessionData: { session: SessionInfo; messages: MessageInfo[] } | null;
  missionControl: MissionControlSnapshot | null;
  missionControlStatus: MissionControlStatus;
  missionControlSpec: string;
  chatDraft: string;
  graphSessionId: string | null;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  activeFlowNodeId: string | null;

  // Repos
  repos: RepoEntry[];
  activeRepo: RepoEntry | null;

  // Actions
  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (id: number | null) => void;
  setMessages: (messages: MessageInfo[]) => void;
  addMessage: (msg: MessageInfo) => void;

  setTerminals: (terminals: TerminalInfo[]) => void;
  setActiveTerminal: (id: string | null) => void;

  setOpenFile: (path: string | null, content: string | null) => void;

  setRepoPath: (path: string | null) => void;
  setFileTree: (entries: FileEntry[]) => void;
  toggleDir: (dirPath: string) => void;
  setRepos: (repos: RepoEntry[]) => void;
  setActiveRepo: (repo: RepoEntry | null) => void;
  resetChat: () => void;

  setActivePanel: (panel: PanelView) => void;
  setActiveMode: (mode: GraphMode) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarModule: (module: AppState['sidebarModule']) => void;
  setSidebarWidth: (width: number) => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelWidth: (width: number) => void;
  setLastSessionData: (data: AppState['lastSessionData']) => void;
  setMissionControl: (snapshot: MissionControlSnapshot | null) => void;
  setMissionControlStatus: (status: MissionControlStatus) => void;
  setMissionControlSpec: (spec: string) => void;
  setChatDraft: (draft: string) => void;
  setActiveFlowNodeId: (nodeId: string | null) => void;
  loadGraph: (sessionId: string, mode?: GraphMode) => Promise<void>;
  addNode: (args: CreateNodeArgs) => Promise<string>;
  updateNode: (args: UpdateNodeArgs) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  addEdge: (args: CreateEdgeArgs) => Promise<string>;
  removeEdge: (edgeId: string) => Promise<void>;
  commitLayout: (views: NodeViewUpdate[]) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],

  terminals: [],
  activeTerminalId: null,

  openFilePath: null,
  openFileContent: null,

  repoPath: null,
  fileTree: [],
  expandedDirs: new Set<string>(),

  activePanel: 'chat',
  activeMode: 'flow',
  sidebarOpen: true,
  sidebarModule: 'explorer',
  sidebarWidth: typeof localStorage !== 'undefined' ? Number(localStorage.getItem('kore-sidebar-width')) || 220 : 220,
  rightPanelOpen: false,
  rightPanelWidth: typeof localStorage !== 'undefined' ? Number(localStorage.getItem('kore-rightpanel-width')) || 300 : 300,
  lastSessionData: null,
  missionControl: null,
  missionControlStatus: { state: 'idle', message: 'idle' },
  missionControlSpec: 'MODULE: auth\nMODULE: api depends: auth',
  chatDraft: '',
  graphSessionId: null,
  graphNodes: [],
  graphEdges: [],
  activeFlowNodeId: null,

  repos: [],
  activeRepo: null,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  setTerminals: (terminals) => set({ terminals }),
  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  setOpenFile: (path, content) =>
    set({ openFilePath: path, openFileContent: content }),

  setRepoPath: (path) => set({ repoPath: path }),
  setFileTree: (entries) => set({ fileTree: entries }),
  toggleDir: (dirPath) =>
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return { expandedDirs: next };
    }),

  setRepos: (repos) => set({ repos }),
  setActiveRepo: (repo) => set({ activeRepo: repo }),
  resetChat: () => set({ messages: [], activeSessionId: null }),

  setActivePanel: (panel) =>
    set((state) => {
      const nextMode = panelToGraphMode(panel);
      return {
        activePanel: panel,
        activeMode: nextMode ?? state.activeMode,
      };
    }),
  setActiveMode: (mode) => set({ activeMode: mode }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarModule: (sidebarModule) => set({ sidebarModule }),
  setSidebarWidth: (sidebarWidth) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('kore-sidebar-width', String(sidebarWidth));
    set({ sidebarWidth });
  },
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setRightPanelWidth: (rightPanelWidth) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('kore-rightpanel-width', String(rightPanelWidth));
    set({ rightPanelWidth });
  },
  setLastSessionData: (data) => set({ lastSessionData: data }),
  setMissionControl: (missionControl) => set({ missionControl }),
  setMissionControlStatus: (missionControlStatus) => set({ missionControlStatus }),
  setMissionControlSpec: (missionControlSpec) => set({ missionControlSpec }),
  setChatDraft: (chatDraft) => set({ chatDraft }),
  setActiveFlowNodeId: (activeFlowNodeId) => set({ activeFlowNodeId }),

  loadGraph: async (sessionId, mode) => {
    const activeMode = mode ?? useAppStore.getState().activeMode;
    const graph = await window.dyson.graph.getGraph(sessionId, activeMode);
    const previousActiveNodeId = useAppStore.getState().activeFlowNodeId;
    const nextActiveNodeId = graph.nodes.some((node) => node.id === previousActiveNodeId)
      ? previousActiveNodeId
      : graph.nodes.find((node) => node.type === 'agent')?.id ?? null;
    set({
      graphSessionId: sessionId,
      graphNodes: graph.nodes,
      graphEdges: graph.edges,
      activeFlowNodeId: nextActiveNodeId,
    });
  },

  addNode: async (args) => {
    const nodeId = await window.dyson.graph.createNode(args);
    if (useAppStore.getState().graphSessionId === args.sessionId) {
      await useAppStore.getState().loadGraph(args.sessionId, args.modeOrigin);
    }
    return nodeId;
  },

  updateNode: async (args) => {
    await window.dyson.graph.updateNode(args);
    const state = useAppStore.getState();
    if (state.graphSessionId) {
      await state.loadGraph(state.graphSessionId, state.activeMode);
    }
  },

  removeNode: async (nodeId) => {
    await window.dyson.graph.deleteNode(nodeId);
    const state = useAppStore.getState();
    if (state.graphSessionId) {
      await state.loadGraph(state.graphSessionId, state.activeMode);
    }
  },

  addEdge: async (args) => {
    const edgeId = await window.dyson.graph.createEdge(args);
    if (useAppStore.getState().graphSessionId === args.sessionId) {
      await useAppStore.getState().loadGraph(args.sessionId, useAppStore.getState().activeMode);
    }
    return edgeId;
  },

  removeEdge: async (edgeId) => {
    await window.dyson.graph.deleteEdge(edgeId);
    const state = useAppStore.getState();
    if (state.graphSessionId) {
      await state.loadGraph(state.graphSessionId, state.activeMode);
    }
  },

  commitLayout: async (views) => {
    await scheduleLayoutCommit(views);
  },
}));
