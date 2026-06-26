import { randomUUID } from 'crypto';
import { getDb } from './db';

export type GraphMode = 'flow' | 'canvas' | 'mesh';

export interface GraphNodeRecord {
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

export interface GraphEdgeRecord {
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

function parseNodeData(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function getGraph(sessionId: string, mode: GraphMode) {
  const db = await getDb();
  const nodeRows = db.prepare(
    `SELECT
       n.id,
       n.session_id,
       n.node_type,
       n.mode_origin,
       n.label,
       n.data,
       n.rc_score,
       n.created_at,
       n.updated_at,
       COALESCE(nv.pos_x, 0) AS pos_x,
       COALESCE(nv.pos_y, 0) AS pos_y,
       nv.width,
       nv.height,
       COALESCE(nv.hidden, 0) AS hidden,
       COALESCE(nv.z_index, 0) AS z_index
     FROM nodes n
     LEFT JOIN node_views nv ON nv.node_id = n.id AND nv.mode = ?
     WHERE n.session_id = ?
     ORDER BY n.created_at ASC`
  ).all(mode, sessionId) as Array<Record<string, unknown>>;

  const edgeRows = db.prepare(
    `SELECT
       id,
       session_id,
       source_id,
       target_id,
       edge_type,
       label,
       animated,
       mode_visible
     FROM edges
     WHERE session_id = ? AND (mode_visible = 'all' OR mode_visible = ?)
     ORDER BY rowid ASC`
  ).all(sessionId, mode) as Array<Record<string, unknown>>;

  const nodes: GraphNodeRecord[] = nodeRows.map((row) => ({
    id: String(row.id),
    sessionId: row.session_id ? String(row.session_id) : null,
    type: String(row.node_type),
    modeOrigin: String(row.mode_origin) as GraphMode,
    label: row.label ? String(row.label) : null,
    data: parseNodeData(String(row.data ?? '{}')),
    position: {
      x: Number(row.pos_x ?? 0),
      y: Number(row.pos_y ?? 0),
    },
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    hidden: Boolean(row.hidden),
    zIndex: Number(row.z_index ?? 0),
    rcScore: Number(row.rc_score ?? 0),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }));

  const edges: GraphEdgeRecord[] = edgeRows.map((row) => ({
    id: String(row.id),
    sessionId: row.session_id ? String(row.session_id) : null,
    source: String(row.source_id),
    target: String(row.target_id),
    type: String(row.edge_type ?? 'data'),
    label: row.label ? String(row.label) : null,
    animated: Boolean(row.animated),
    modeVisible: String(row.mode_visible ?? 'all'),
  }));

  return { nodes, edges };
}

export async function createNode(args: CreateNodeArgs) {
  const db = await getDb();
  const nodeId = randomUUID().replace(/-/g, '');

  const insertNode = db.prepare(
    `INSERT INTO nodes (id, session_id, node_type, mode_origin, label, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const upsertNodeView = db.prepare(
    `INSERT INTO node_views (node_id, mode, pos_x, pos_y, width, height, hidden, z_index, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
     ON CONFLICT(node_id, mode) DO UPDATE SET
       pos_x = excluded.pos_x,
       pos_y = excluded.pos_y,
       width = excluded.width,
       height = excluded.height,
       hidden = excluded.hidden,
       z_index = excluded.z_index,
       updated_at = unixepoch()`
  );

  db.transaction(() => {
    insertNode.run(
      nodeId,
      args.sessionId,
      args.nodeType,
      args.modeOrigin,
      args.label ?? null,
      JSON.stringify(args.data ?? {}),
    );
    upsertNodeView.run(
      nodeId,
      args.modeOrigin,
      args.posX ?? 0,
      args.posY ?? 0,
      args.width ?? null,
      args.height ?? null,
      args.hidden ? 1 : 0,
      args.zIndex ?? 0,
    );
  })();

  return nodeId;
}

export async function updateNode(args: UpdateNodeArgs) {
  const db = await getDb();
  db.prepare(
    `UPDATE nodes
     SET data = ?,
         label = COALESCE(?, label),
         updated_at = unixepoch()
     WHERE id = ?`
  ).run(JSON.stringify(args.data), args.label ?? null, args.nodeId);
}

export async function deleteNode(nodeId: string) {
  const db = await getDb();
  db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
}

export async function createEdge(args: CreateEdgeArgs) {
  const db = await getDb();
  const edgeId = randomUUID().replace(/-/g, '');
  db.prepare(
    `INSERT INTO edges (id, session_id, source_id, target_id, edge_type, label, animated, mode_visible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    edgeId,
    args.sessionId,
    args.sourceId,
    args.targetId,
    args.edgeType ?? 'data',
    args.label ?? null,
    args.animated ? 1 : 0,
    args.modeVisible ?? 'all',
  );
  return edgeId;
}

export async function deleteEdge(edgeId: string) {
  const db = await getDb();
  db.prepare('DELETE FROM edges WHERE id = ?').run(edgeId);
}

export async function updateLayout(views: NodeViewUpdate[]) {
  const db = await getDb();
  const upsertNodeView = db.prepare(
    `INSERT INTO node_views (node_id, mode, pos_x, pos_y, width, height, hidden, z_index, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
     ON CONFLICT(node_id, mode) DO UPDATE SET
       pos_x = excluded.pos_x,
       pos_y = excluded.pos_y,
       width = excluded.width,
       height = excluded.height,
       hidden = excluded.hidden,
       z_index = excluded.z_index,
       updated_at = unixepoch()`
  );

  db.transaction((items: NodeViewUpdate[]) => {
    for (const view of items) {
      upsertNodeView.run(
        view.nodeId,
        view.mode,
        view.posX,
        view.posY,
        view.width ?? null,
        view.height ?? null,
        view.hidden ? 1 : 0,
        view.zIndex ?? 0,
      );
    }
  })(views);
}

export async function logExecution(args: LogExecutionArgs) {
  const db = await getDb();
  db.prepare(
    `INSERT INTO execution_log (id, session_id, node_id, input, output, status, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID().replace(/-/g, ''),
    args.sessionId,
    args.nodeId,
    args.input,
    args.output,
    args.status,
    args.durationMs ?? null,
  );
}

export async function getExecutionLog(sessionId: string, nodeId?: string | null, limit = 20) {
  const db = await getDb();
  const rows = nodeId
    ? db.prepare(
        `SELECT id, session_id, node_id, input, output, status, duration_ms, created_at
         FROM execution_log
         WHERE session_id = ? AND node_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(sessionId, nodeId, limit)
    : db.prepare(
        `SELECT id, session_id, node_id, input, output, status, duration_ms, created_at
         FROM execution_log
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(sessionId, limit);

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    sessionId: row.session_id ? String(row.session_id) : null,
    nodeId: row.node_id ? String(row.node_id) : null,
    input: row.input ? String(row.input) : null,
    output: row.output ? String(row.output) : null,
    status: String(row.status ?? 'unknown'),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    createdAt: Number(row.created_at ?? 0),
  })) as ExecutionLogRecord[];
}