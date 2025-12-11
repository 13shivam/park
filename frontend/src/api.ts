const API_BASE = '/api';

export interface Session {
  id: string;
  name: string;
  directory: string;
  command: string;
  status: 'active' | 'paused' | 'stopped' | 'completed';
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

export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  const data = await res.json();
  return data.sessions;
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  const data = await res.json();
  return data.session;
}

export async function createSession(input: SessionCreateInput): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const data = await res.json();
  return data.session;
}

export async function stopSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${id}/stop`, {
    method: 'POST'
  });
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/sessions/${id}`, {
    method: 'DELETE'
  });
}

export async function cleanupCompletedSessions(): Promise<number> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'DELETE'
  });
  const data = await res.json();
  return data.deleted;
}

export async function getConfig(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/config`);
  const data = await res.json();
  return data.config;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  command: string;
  defaultDirectory: string;
  category: string;
}

export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  const res = await fetch(`${API_BASE}/system/prompts`);
  const data = await res.json();
  return data.prompts;
}
