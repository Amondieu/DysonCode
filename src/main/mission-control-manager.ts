import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

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

function resolveBridgePath(workspaceRoot: string) {
  const candidateRoots = [
    process.env.DYSONCODE_KORE_ROOT,
    workspaceRoot,
    process.cwd(),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', '..'),
  ].filter((value): value is string => Boolean(value));

  const checkedPaths: string[] = [];
  for (const root of candidateRoots) {
    const bridgePath = path.join(root, 'kore', 'ui', 'electron_bridge.py');
    checkedPaths.push(bridgePath);
    if (fs.existsSync(bridgePath)) {
      return { bridgePath, checkedPaths };
    }
  }

  return { bridgePath: null, checkedPaths };
}

export class MissionControlManager extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private latestSnapshot: MissionControlSnapshot | null = null;
  private status: MissionControlStatus = { state: 'idle', message: 'idle' };

  start(spec: string, workspaceRoot: string, maxSteps = 2, executeBuilder = false): MissionControlStatus {
    this.stop();
    this.status = { state: 'starting', message: 'starting mission control' };
    this.emit('status', this.status);

    const { bridgePath, checkedPaths } = resolveBridgePath(workspaceRoot);
    if (!bridgePath) {
      this.status = {
        state: 'error',
        message: `mission control bridge not found; checked: ${checkedPaths.join(', ')}`,
      };
      this.emit('status', this.status);
      return this.status;
    }

    const args = ['-u', bridgePath, spec, '--workspace-root', workspaceRoot, '--max-steps', String(maxSteps)];
    if (executeBuilder) {
      args.push('--execute-builder');
    }

    this.proc = spawn('python', args, {
      cwd: path.dirname(path.dirname(path.dirname(bridgePath))),
      env: process.env,
      stdio: 'pipe',
    });

    const stdout = readline.createInterface({ input: this.proc.stdout });
    stdout.on('line', (line) => {
      try {
        const payload = JSON.parse(line) as {
          type: string;
          state?: MissionControlSnapshot;
          message?: string;
        };
        if (payload.type === 'snapshot' && payload.state) {
          this.latestSnapshot = payload.state;
          this.status = { state: 'running', message: 'streaming mission control' };
          this.emit('status', this.status);
          this.emit('snapshot', this.latestSnapshot);
          // Relay to stream panel via unified PanelManager
          try {
            const { getStreamView } = require('./panel-manager');
            const sv = getStreamView();
            if (sv) {
              sv.webContents.executeJavaScript(`
                window.postMessage({ type: 'snapshot', state: ${JSON.stringify(this.latestSnapshot)}, timestamp: '${new Date().toISOString()}' }, '*');
              `).catch(() => {});
            }
          } catch { /* panel manager not initialized yet */ }
        } else if (payload.type === 'complete' && payload.state) {
          this.latestSnapshot = payload.state;
          this.status = { state: 'stopped', message: 'mission control complete' };
          this.emit('snapshot', this.latestSnapshot);
          // Relay to stream panel via unified PanelManager
          try {
            const { getStreamView } = require('./panel-manager');
            const sv = getStreamView();
            if (sv) {
              sv.webContents.executeJavaScript(`
                window.postMessage({ type: 'snapshot', state: ${JSON.stringify(this.latestSnapshot)}, timestamp: '${new Date().toISOString()}' }, '*');
              `).catch(() => {});
            }
          } catch { /* panel manager not initialized yet */ }
          this.emit('status', this.status);
        } else if (payload.type === 'error') {
          this.status = { state: 'error', message: payload.message || 'bridge error' };
          this.emit('status', this.status);
        }
      } catch (error) {
        this.status = { state: 'error', message: `invalid bridge output: ${String(error)}` };
        this.emit('status', this.status);
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      const message = String(chunk).trim();
      if (!message) {
        return;
      }
      this.status = { state: 'error', message };
      this.emit('status', this.status);
    });

    this.proc.on('exit', (code) => {
      if (this.status.state !== 'error') {
        this.status = { state: 'stopped', message: `mission control exited (${code ?? 0})` };
        this.emit('status', this.status);
      }
      this.proc = null;
    });

    return this.status;
  }

  stop(): MissionControlStatus {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.status = { state: 'stopped', message: 'mission control stopped' };
    this.emit('status', this.status);
    return this.status;
  }

  getState(): MissionControlSnapshot | null {
    return this.latestSnapshot;
  }

  getStatus(): MissionControlStatus {
    return this.status;
  }
}

export const missionControlManager = new MissionControlManager();