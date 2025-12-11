import { IPty } from 'node-pty';
import { WebSocket } from 'ws';

export interface Session {
  id: string;
  name: string;
  directory: string;
  command: string;
  status: 'active' | 'configured' | 'stopped' | 'completed';
  type: 'interactive-pty' | 'non-interactive';
  created_at: string;
  updated_at: string;
  pid: number | null;
}

export interface SessionCreateInput {
  name: string;
  directory: string;
  command: string;
  type: 'interactive-pty' | 'non-interactive';
}

export interface PTYInstance {
  pty: IPty;
  session: Session;
  clients: Set<WebSocket>;
  buffer: string[];
}

export interface ProcessInstance {
  process: any;
  session: Session;
  buffer: string[];
}
