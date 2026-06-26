import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow,
  addEdge as addFlowEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  MiniMap,
  Node,
  NodeChange,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './nodes/AgentNode';
import RepoNode from './nodes/RepoNode';
import TestNode from './nodes/TestNode';
import VaultNode from './nodes/VaultNode';
import ModulePalette, { type PalettePosition } from './ModulePalette';
import { MODULE_REGISTRY, type ModuleDefinition } from '../../data/module-registry';
import { useLoadGraph } from '../../hooks/useIpc';
import { copyToClipboard } from '../../utils/clipboard';
import {
  CreateEdgeArgs,
  CreateNodeArgs,
  type EdgeSemanticType,
  ExecutionLogRecord,
  GraphEdge,
  GraphNode,
  SessionInfo,
  useAppStore,
} from '../../store/appStore';

const nodeTypes = {
  agent: AgentNode,
  repo: RepoNode,
  vault: VaultNode,
  test: TestNode,
};

// ── Edge semantic type → color + style mapping ──
const EDGE_COLORS: Record<EdgeSemanticType, { stroke: string; animated: boolean; dash?: string }> = {
  data:       { stroke: '#3b82f6', animated: false },
  challenge:  { stroke: '#ef4444', animated: true },
  synthesis:  { stroke: '#22c55e', animated: false, dash: undefined },
  memory:     { stroke: '#a855f7', animated: false, dash: '6 4' },
  trigger:    { stroke: '#eab308', animated: true,  dash: '4 2' },
  broadcast:  { stroke: '#ffffff', animated: false, dash: '2 2' },
};

function edgeStyle(type: string) {
  const cfg = EDGE_COLORS[type as EdgeSemanticType];
  if (!cfg) return { stroke: '#3b82f6' };
  return {
    stroke: cfg.stroke,
    strokeDasharray: cfg.dash,
    strokeWidth: type === 'synthesis' ? 2.5 : 1.5,
  };
}

function getUpstreamContext(targetNodeId: string, nodes: GraphNode[], edges: GraphEdge[]) {
  const incomingSourceIds = edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => edge.source);

  return nodes
    .filter((node) => incomingSourceIds.includes(node.id))
    .map((node) => {
      const output = typeof node.data.lastOutput === 'string'
        ? node.data.lastOutput
        : typeof node.data.intent === 'string'
          ? node.data.intent
          : typeof node.data.path === 'string'
            ? node.data.path
            : '';
      const title = node.label || node.type;
      return output ? `${title}: ${output}` : title;
    })
    .filter(Boolean)
    .join('\n\n');
}

function mapGraphNode(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): Node<Record<string, unknown>> {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      persistedData: node.data,
      nodeLabel: node.label,
      sessionId: node.sessionId,
      upstreamContext: getUpstreamContext(node.id, nodes, edges),
      rcScore: node.rcScore,
      repoPath: typeof node.data.path === 'string' ? node.data.path : undefined,
    },
    hidden: node.hidden,
    width: node.width ?? undefined,
    height: node.height ?? undefined,
  };
}

function mapGraphEdge(edge: GraphEdge, edgeType?: string): Edge {
  const semanticType = edgeType || edge.type;
  const cfg = EDGE_COLORS[semanticType as EdgeSemanticType];
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || semanticType || undefined,
    type: 'smoothstep',
    animated: cfg?.animated ?? edge.animated,
    style: edgeStyle(semanticType),
  };
}

function toLayoutPayload(nodes: Node<Record<string, unknown>>[]) {
  return nodes.map((node) => ({
    nodeId: node.id,
    mode: 'flow' as const,
    posX: node.position.x,
    posY: node.position.y,
    width: typeof node.width === 'number' ? node.width : null,
    height: typeof node.height === 'number' ? node.height : null,
    hidden: Boolean(node.hidden),
    zIndex: node.zIndex ?? 0,
  }));
}

function CopyCanvasButton({
  graphNodes,
  graphEdges,
  sessionTextId,
  activeFlowNodeId,
  executionLog,
}: {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  sessionTextId: string | null;
  activeFlowNodeId: string | null;
  executionLog: ExecutionLogRecord[];
}) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');

  const handleCopy = useCallback(async () => {
    const summary = [
      `DysonCode Flow Canvas`,
      `Session: ${sessionTextId || 'none'}`,
      `Nodes: ${graphNodes.length}`,
      `Edges: ${graphEdges.length}`,
      `Active Node: ${activeFlowNodeId || 'none'}`,
      '',
      '--- Nodes ---',
      ...graphNodes.map((n) => `  [${n.type}] ${n.label || n.id} | rc=${n.rcScore ?? '-'}`),
      '',
      '--- Edges ---',
      ...graphEdges.map((e) => `  ${e.source.slice(0, 8)} -> ${e.target.slice(0, 8)} [${e.type}]`),
      '',
      '--- Execution Log (last 5) ---',
      ...executionLog.slice(-5).map((entry) =>
        `  [${entry.status}] ${entry.nodeId?.slice(0, 8) ?? '?'} | ${entry.durationMs ?? 0}ms`
      ),
    ].join('\n');

    await copyToClipboard(summary);
    setState('copied');
    setTimeout(() => setState('idle'), 2000);
  }, [graphNodes, graphEdges, sessionTextId, activeFlowNodeId, executionLog]);

  return (
    <button
      onClick={handleCopy}
      className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded border border-dyson-border hover:bg-dyson-border transition-colors"
      aria-label={state === 'copied' ? 'Canvas copied' : 'Copy canvas to clipboard'}
      title={state === 'copied' ? 'Copied!' : 'Copy canvas'}
    >
      {state === 'copied' ? 'copied' : 'copy canvas'}
    </button>
  );
}

export default function FlowCanvas({
  activeSession,
  repoPath,
}: {
  activeSession: SessionInfo | null;
  repoPath: string | null;
}) {
  const {
    graphNodes,
    graphEdges,
    activeFlowNodeId,
    addNode,
    addEdge,
    commitLayout,
    setActiveFlowNodeId,
  } = useAppStore();

  const sessionTextId = activeSession?.text_id ?? null;
  useLoadGraph(sessionTextId, 'flow');

  const [nodes, setNodes] = useState<Node<Record<string, unknown>>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [executionLog, setExecutionLog] = useState<ExecutionLogRecord[]>([]);
  const [palettePos, setPalettePos] = useState<PalettePosition | null>(null);
  const rfInstanceRef = useRef<any>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNodes(graphNodes.map((node) => mapGraphNode(node, graphNodes, graphEdges)));
  }, [graphEdges, graphNodes]);

  useEffect(() => {
    setEdges(graphEdges.map(mapGraphEdge));
  }, [graphEdges]);

  useEffect(() => {
    if (!sessionTextId) {
      setExecutionLog([]);
      return;
    }

    window.dyson.graph.getExecutionLog(sessionTextId, activeFlowNodeId, 12)
      .then((entries) => setExecutionLog(entries))
      .catch((error) => {
        console.error('Failed to load execution log:', error);
      });
  }, [activeFlowNodeId, graphNodes, sessionTextId]);

  const repoNode = useMemo(
    () => graphNodes.find((node) => node.type === 'repo'),
    [graphNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<Record<string, unknown>>>[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        const shouldCommit = changes.some(
          (change) => change.type === 'position' && change.dragging === false,
        );
        if (shouldCommit) {
          void commitLayout(toLayoutPayload(next));
        }
        return next;
      });
    },
    [commitLayout],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<Record<string, unknown>>) => {
    setActiveFlowNodeId(node.id);
  }, [setActiveFlowNodeId]);

  // ── jcode Pipeline Auto-Trigger ──────────────────────────────────────────
  // When jcode pipeline nodes connect, auto-trigger the 4-layer pipeline.
  const jcodePipelineModuleIds = new Set([
    'precheck_gate', 'manifold_detector', 'gap_geometry',
    'harvest_auditor', 'field_collapse', 'fixpoint_check',
    'ratchet_scorer', 'omega_router', 'jcode_pipeline',
  ]);

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!sessionTextId || !connection.source || !connection.target) {
        return;
      }

      const edgeArgs: CreateEdgeArgs = {
        sessionId: sessionTextId,
        sourceId: connection.source,
        targetId: connection.target,
        edgeType: 'data',
        animated: false,
        modeVisible: 'all',
      };
      const edgeId = await addEdge(edgeArgs);
      const style = edgeStyle('data');
      setEdges((current) => addFlowEdge({ ...connection, id: edgeId, type: 'smoothstep', animated: false, style, label: 'data' }, current));

      // ── Auto-trigger jcode pipeline ──
      const sourceNode = graphNodes.find((n) => n.id === connection.source);
      const targetNode = graphNodes.find((n) => n.id === connection.target);
      const sourceModuleId = sourceNode?.data?.moduleId as string | undefined;
      const targetModuleId = targetNode?.data?.moduleId as string | undefined;

      const isJcodeConnection =
        (sourceModuleId && jcodePipelineModuleIds.has(sourceModuleId)) ||
        (targetModuleId && jcodePipelineModuleIds.has(targetModuleId));

      // jcode pipeline auto-trigger: deferred until IPC bridge is registered.
      // When jcode pipeline nodes connect, log the connection for future execution.
      if (isJcodeConnection && sourceNode && targetNode) {
        console.log(
          '[FlowCanvas] jcode pipeline connection detected:',
          sourceModuleId || sourceNode.label,
          '->',
          targetModuleId || targetNode.label,
          '(auto-trigger deferred — IPC bridge pending)',
        );
      }
    },
    [addEdge, graphNodes, sessionTextId],
  );

  // ── Right-click → Module Palette ──
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPalettePos({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  }, []);

  const handleSelectModule = useCallback(async (mod: ModuleDefinition) => {
    if (!sessionTextId || !palettePos || !rfInstanceRef.current) return;
    const pos = rfInstanceRef.current.screenToFlowPosition({ x: palettePos.x, y: palettePos.y });
    setPalettePos(null);

    await addNode({
      sessionId: sessionTextId,
      nodeType: mod.nodeType,
      modeOrigin: 'flow',
      label: mod.label,
      data: {
        label: mod.label,
        frame: mod.frame,
        role: mod.role,
        category: mod.category,
        moduleId: mod.id,
        capabilities: mod.capabilities,
        prompt: mod.defaultPrompt || '',
        model: 'fast',
      },
      posX: pos.x,
      posY: pos.y,
      width: 260,
    } satisfies CreateNodeArgs);
  }, [sessionTextId, palettePos, addNode]);

  const bootstrapSelfHost = useCallback(async () => {
    if (!sessionTextId) {
      return;
    }

    setBootstrapping(true);
    try {
      const nodeIndex = new Map(graphNodes.map((node) => [node.type, node]));

      let repoId = nodeIndex.get('repo')?.id ?? null;
      if (!repoId) {
        repoId = await addNode({
          sessionId: sessionTextId,
          nodeType: 'repo',
          modeOrigin: 'flow',
          label: 'DysonCode Workspace',
          data: {
            label: 'DysonCode Workspace',
            path: repoPath || activeSession?.repo_path || '.',
            intent: 'Dogfood autonomic coding workflow on this repo',
          },
          posX: 80,
          posY: 140,
        } satisfies CreateNodeArgs);
      }

      let vaultId = nodeIndex.get('vault')?.id ?? null;
      if (!vaultId) {
        vaultId = await addNode({
          sessionId: sessionTextId,
          nodeType: 'vault',
          modeOrigin: 'flow',
          label: 'Prompt Vault',
          data: {
            label: 'Prompt Vault',
            tags: ['builder', 'critic', 'memory', 'self-host'],
          },
          posX: 80,
          posY: 320,
        } satisfies CreateNodeArgs);
      }

      let agentId = nodeIndex.get('agent')?.id ?? null;
      if (!agentId) {
        agentId = await addNode({
          sessionId: sessionTextId,
          nodeType: 'agent',
          modeOrigin: 'flow',
          label: 'Autonomic Coding Loop',
          data: {
            label: 'Autonomic Coding Loop',
            model: 'fast',
            prompt: 'Review the current DysonCode graph context and propose the next smallest safe implementation step for this repo.',
            objective: 'Use DysonCode to improve DysonCode with local graph + mission control feedback',
          },
          posX: 420,
          posY: 220,
        } satisfies CreateNodeArgs);
      }

      let testId = nodeIndex.get('test')?.id ?? null;
      if (!testId) {
        testId = await addNode({
          sessionId: sessionTextId,
          nodeType: 'test',
          modeOrigin: 'flow',
          label: 'Repository Checks',
          data: {
            label: 'Repository Checks',
            repoPath: repoPath || activeSession?.repo_path || '.',
            runner: 'npm.cmd run build',
          },
          posX: 420,
          posY: 390,
        } satisfies CreateNodeArgs);
      }

      const edgeKeys = new Set(graphEdges.map((edge) => `${edge.source}->${edge.target}`));
      if (repoId && agentId && !edgeKeys.has(`${repoId}->${agentId}`)) {
        await addEdge({
          sessionId: sessionTextId,
          sourceId: repoId,
          targetId: agentId,
          edgeType: 'dependency',
          modeVisible: 'all',
        });
      }
      if (vaultId && agentId && !edgeKeys.has(`${vaultId}->${agentId}`)) {
        await addEdge({
          sessionId: sessionTextId,
          sourceId: vaultId,
          targetId: agentId,
          edgeType: 'reference',
          modeVisible: 'all',
        });
      }
      if (repoId && testId && !edgeKeys.has(`${repoId}->${testId}`)) {
        await addEdge({
          sessionId: sessionTextId,
          sourceId: repoId,
          targetId: testId,
          edgeType: 'dependency',
          modeVisible: 'all',
        });
      }
      if (testId && agentId && !edgeKeys.has(`${testId}->${agentId}`)) {
        await addEdge({
          sessionId: sessionTextId,
          sourceId: testId,
          targetId: agentId,
          edgeType: 'reference',
          modeVisible: 'all',
        });
      }
    } finally {
      setBootstrapping(false);
    }
  }, [activeSession?.repo_path, addEdge, addNode, graphEdges, graphNodes, repoPath, sessionTextId]);

  if (!activeSession || !sessionTextId) {
    return (
      <div className="h-full flex items-center justify-center bg-dyson-bg px-8">
        <div className="max-w-lg text-center">
          <div className="text-5xl mb-4">🔀</div>
          <h2 className="text-xl font-semibold text-dyson-text mb-3">Autonomic Flow</h2>
          <p className="text-sm text-dyson-muted leading-6">
            Select or create a session first. Flow mode uses the session text id as the canonical graph anchor, so the same IDE can operate on its own workspace and persist that topology.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-dyson-bg">
      <div className="flex items-center gap-3 border-b border-dyson-border bg-dyson-panel px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-dyson-text">Autonomic Coding Workflow</div>
          <div className="truncate text-[11px] text-dyson-muted font-mono">
            {repoPath || activeSession.repo_path || 'No repo linked'}
          </div>
        </div>
        <button
          onClick={bootstrapSelfHost}
          disabled={bootstrapping}
          className="rounded border border-dyson-border px-3 py-1.5 text-xs text-dyson-text hover:bg-dyson-border disabled:opacity-50"
        >
          {bootstrapping ? 'Bootstrapping...' : 'Bootstrap Self-Host'}
        </button>
      </div>

      <div className="flex items-center gap-4 border-b border-dyson-border bg-dyson-bg px-4 py-2 text-[11px] text-dyson-muted font-mono">
        <span>session {sessionTextId}</span>
        <span>nodes {graphNodes.length}</span>
        <span>edges {graphEdges.length}</span>
        <span>{repoNode ? 'repo attached' : 'repo node missing'}</span>
        <span>{activeFlowNodeId ? `active ${activeFlowNodeId.slice(0, 8)}` : 'no active node'}</span>
        <CopyCanvasButton
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          sessionTextId={sessionTextId}
          activeFlowNodeId={activeFlowNodeId}
          executionLog={executionLog}
        />
      </div>

      <div className="grid flex-1 min-h-0 grid-rows-[minmax(0,1fr),170px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onInit={(instance) => { rfInstanceRef.current = instance; }}
          onNodeClick={handleNodeClick}
          snapToGrid
          snapGrid={[20, 20]}
          fitView
          onContextMenu={handleContextMenu}
          className="bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.08),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.08),_transparent_24%),#050816]"
        >
          {palettePos && (
            <ModulePalette
              position={palettePos}
              onSelect={handleSelectModule}
              onClose={() => setPalettePos(null)}
            />
          )}
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            style={{ width: 100, height: 70 }}
            className="!bg-slate-950/80"
            maskColor="rgba(5, 8, 22, 0.7)"
          />
          <Controls className="!bg-slate-950/85 !border !border-dyson-border !rounded-lg" />
          <Background gap={20} size={1} color="rgba(148, 163, 184, 0.18)" />
        </ReactFlow>

        <div className="border-t border-dyson-border bg-dyson-panel/80 px-4 py-3 min-h-0 overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-dyson-muted">
              Execution Log
            </div>
            <div className="text-[11px] text-dyson-muted font-mono">
              {activeFlowNodeId ? 'active node scope' : 'session scope'}
            </div>
          </div>
          <div className="space-y-2">
            {executionLog.length === 0 && (
              <div className="text-xs text-dyson-muted font-mono">No executions yet</div>
            )}
            {executionLog.map((entry) => (
              <div key={entry.id} className="rounded border border-dyson-border bg-dyson-bg px-3 py-2 text-xs">
                <div className="mb-1 flex items-center gap-3 text-[11px] font-mono text-dyson-muted">
                  <span className={entry.status === 'done' ? 'text-dyson-green' : 'text-red-400'}>{entry.status}</span>
                  <span>{entry.nodeId?.slice(0, 8) || 'session'}</span>
                  <span>{entry.durationMs ?? 0}ms</span>
                </div>
                {entry.input && (
                  <div className="mb-1 line-clamp-2 text-dyson-text whitespace-pre-wrap">in: {entry.input.slice(0, 180)}</div>
                )}
                {entry.output && (
                  <div className="line-clamp-3 whitespace-pre-wrap text-dyson-muted">out: {entry.output.slice(0, 260)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

