import * as pty from 'node-pty';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import * as fs from 'fs';
import {
  getAllSessions,
  createSession as dbCreateSession,
  updateSession,
  deleteSession,
  getSession as dbGetSession
} from './database';
import { PTYInstance, ProcessInstance, SessionCreateInput, Session } from './types';
import { getConfig } from './utils/config';

const BUFFER_SIZE = 1000;

export class SessionManager {
  private activePTYs: Map<string, PTYInstance> = new Map();
  private activeProcesses: Map<string, ProcessInstance> = new Map();

  async initialize(): Promise<void> {
    console.log('[SessionManager] Initializing...');
    
    const sessions = getAllSessions();
    console.log(`[SessionManager] Found ${sessions.length} sessions in database`);

    for (const session of sessions) {
      if (session.status === 'active' && session.pid) {
        if (this.isPidRunning(session.pid)) {
          console.log(`[SessionManager] Session ${session.name} (PID ${session.pid}) still running`);
        } else {
          console.log(`[SessionManager] Session ${session.name} (PID ${session.pid}) is dead, marking as stopped`);
          updateSession(session.id, { status: 'stopped', pid: null });
        }
      }
    }

    console.log('[SessionManager] Initialization complete');
  }

  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async createSessionConfig(input: SessionCreateInput): Promise<Session> {
    const id = uuidv4();
    
    // Validate directory
    if (!fs.existsSync(input.directory)) {
      throw new Error(`Directory does not exist: ${input.directory}`);
    }

    // Create DB record with 'configured' status (not running)
    const session = dbCreateSession({
      id,
      name: input.name,
      directory: input.directory,
      command: input.command,
      type: input.type
    });

    // Update status to 'configured'
    updateSession(id, { status: 'configured' });

    return dbGetSession(id)!;
  }

  async launchSession(id: string): Promise<Session> {
    const session = dbGetSession(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    if (session.status === 'active') {
      throw new Error(`Session ${id} is already running`);
    }

    // Update status to active
    updateSession(id, { status: 'active' });

    try {
      if (session.type === 'interactive-pty') {
        await this.spawnPTY(session);
      } else {
        await this.spawnProcess(session);
      }
    } catch (error) {
      updateSession(id, { status: 'stopped' });
      throw error;
    }

    return dbGetSession(id)!;
  }

  async createSession(input: SessionCreateInput): Promise<Session> {
    const id = uuidv4();
    
    // Validate directory
    if (!fs.existsSync(input.directory)) {
      throw new Error(`Directory does not exist: ${input.directory}`);
    }

    // Create DB record first
    const session = dbCreateSession({
      id,
      name: input.name,
      directory: input.directory,
      command: input.command,
      type: input.type
    });

    try {
      if (input.type === 'interactive-pty') {
        await this.spawnPTY(session);
      } else {
        await this.spawnProcess(session);
      }
    } catch (error) {
      updateSession(id, { status: 'stopped' });
      throw error;
    }

    return dbGetSession(id)!;
  }

  private async spawnPTY(session: Session): Promise<void> {
    console.log(`[SessionManager] Spawning PTY for session ${session.id}: ${session.command}`);
    const config = getConfig();
    const shell = config.shell.defaultShell;
    
    // Parse command into shell and args
    const [cmd, ...args] = session.command.split(' ');
    
    // Use login shell to get proper PATH
    const ptyProcess = pty.spawn(shell, ['-l', '-c', session.command], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: session.directory,
      env: process.env as { [key: string]: string }
    });

    const instance: PTYInstance = {
      pty: ptyProcess,
      session,
      clients: new Set(),
      buffer: []
    };

    this.activePTYs.set(session.id, instance);
    console.log(`[SessionManager] PTY added to activePTYs. Total PTYs: ${this.activePTYs.size}`);

    // Update PID in database
    updateSession(session.id, { pid: ptyProcess.pid });

    // Handle data output
    ptyProcess.onData((data) => {
      // Add to buffer
      instance.buffer.push(data);
      if (instance.buffer.length > BUFFER_SIZE) {
        instance.buffer.shift();
      }

      // Broadcast to all connected clients
      instance.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'output', data }));
        }
      });
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[SessionManager] PTY ${session.name} exited with code ${exitCode}`);
      updateSession(session.id, { 
        status: exitCode === 0 ? 'completed' : 'stopped',
        pid: null
      });
      
      // Notify clients
      instance.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'exit', code: exitCode }));
        }
      });

      this.activePTYs.delete(session.id);
    });

    console.log(`[SessionManager] PTY spawned for ${session.name} (PID: ${ptyProcess.pid})`);
  }

  private async spawnProcess(session: Session): Promise<void> {
    const [cmd, ...args] = session.command.split(' ');
    
    const proc = spawn(cmd, args, {
      cwd: session.directory,
      env: process.env,
      shell: true
    });

    const instance: ProcessInstance = {
      process: proc,
      session,
      buffer: []
    };

    this.activeProcesses.set(session.id, instance);
    updateSession(session.id, { pid: proc.pid || null });

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      instance.buffer.push(text);
      if (instance.buffer.length > BUFFER_SIZE) {
        instance.buffer.shift();
      }
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      instance.buffer.push(text);
      if (instance.buffer.length > BUFFER_SIZE) {
        instance.buffer.shift();
      }
    });

    proc.on('exit', (code) => {
      console.log(`[SessionManager] Process ${session.name} exited with code ${code}`);
      updateSession(session.id, {
        status: code === 0 ? 'completed' : 'stopped',
        pid: null
      });
      this.activeProcesses.delete(session.id);
    });

    console.log(`[SessionManager] Process spawned for ${session.name} (PID: ${proc.pid})`);
  }

  stopSession(id: string): void {
    const ptyInstance = this.activePTYs.get(id);
    if (ptyInstance) {
      ptyInstance.pty.kill();
      this.activePTYs.delete(id);
      updateSession(id, { status: 'stopped', pid: null });
      console.log(`[SessionManager] Stopped PTY session ${id}`);
      return;
    }

    const procInstance = this.activeProcesses.get(id);
    if (procInstance) {
      procInstance.process.kill();
      this.activeProcesses.delete(id);
      updateSession(id, { status: 'stopped', pid: null });
      console.log(`[SessionManager] Stopped process session ${id}`);
      return;
    }

    throw new Error(`Session ${id} is not running`);
  }

  getSession(id: string): Session | undefined {
    return dbGetSession(id);
  }

  getAllSessions(): Session[] {
    return getAllSessions();
  }

  updateSession(id: string, updates: Partial<Session>): void {
    const session = dbGetSession(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    if (session.status === 'active') {
      throw new Error('Cannot update active session');
    }

    updateSession(id, updates);
    console.log(`[SessionManager] Updated session ${id}`);
  }

  deleteSession(id: string): void {
    // Stop if running
    try {
      this.stopSession(id);
    } catch {
      // Already stopped
    }
    
    // Delete from database
    deleteSession(id);
    console.log(`[SessionManager] Deleted session ${id}`);
  }

  attachClient(sessionId: string, ws: WebSocket): void {
    console.log(`[SessionManager] Attempting to attach client to session ${sessionId}`);
    console.log(`[SessionManager] Active PTYs:`, Array.from(this.activePTYs.keys()));
    console.log(`[SessionManager] Active Processes:`, Array.from(this.activeProcesses.keys()));
    
    const ptyInstance = this.activePTYs.get(sessionId);
    if (ptyInstance) {
      ptyInstance.clients.add(ws);

      // Send buffered history
      if (ptyInstance.buffer.length > 0) {
        ws.send(JSON.stringify({ 
          type: 'history', 
          data: ptyInstance.buffer.join('') 
        }));
      }

      console.log(`[SessionManager] Client attached to PTY session ${sessionId}`);
      return;
    }

    const processInstance = this.activeProcesses.get(sessionId);
    if (processInstance) {
      // Send buffered output for non-interactive process
      if (processInstance.buffer.length > 0) {
        ws.send(JSON.stringify({ 
          type: 'history', 
          data: processInstance.buffer.join('') 
        }));
      }

      console.log(`[SessionManager] Client attached to Process session ${sessionId}`);
      return;
    }

    console.error(`[SessionManager] Session ${sessionId} not found in activePTYs or activeProcesses`);
    ws.send(JSON.stringify({ type: 'error', message: 'Session not found or not active' }));
    ws.close();
  }

  detachClient(sessionId: string, ws: WebSocket): void {
    const instance = this.activePTYs.get(sessionId);
    if (instance) {
      instance.clients.delete(ws);
      console.log(`[SessionManager] Client detached from session ${sessionId}`);
    }
  }

  sendInput(sessionId: string, data: string): void {
    const instance = this.activePTYs.get(sessionId);
    if (instance) {
      instance.pty.write(data);
    }
  }

  resizePTY(sessionId: string, cols: number, rows: number): void {
    const instance = this.activePTYs.get(sessionId);
    if (instance) {
      instance.pty.resize(cols, rows);
    }
  }

  getBuffer(sessionId: string): string[] {
    const ptyInstance = this.activePTYs.get(sessionId);
    if (ptyInstance) return ptyInstance.buffer;

    const procInstance = this.activeProcesses.get(sessionId);
    if (procInstance) return procInstance.buffer;

    return [];
  }

  async cleanup(): Promise<void> {
    console.log('[SessionManager] Cleaning up...');

    // Kill all PTYs
    for (const [id, instance] of this.activePTYs) {
      console.log(`[SessionManager] Killing PTY ${instance.session.name}`);
      instance.pty.kill();
      updateSession(id, { status: 'stopped', pid: null });
    }

    // Kill all processes
    for (const [id, instance] of this.activeProcesses) {
      console.log(`[SessionManager] Killing process ${instance.session.name}`);
      instance.process.kill();
      updateSession(id, { status: 'stopped', pid: null });
    }

    this.activePTYs.clear();
    this.activeProcesses.clear();

    console.log('[SessionManager] Cleanup complete');
  }
}
