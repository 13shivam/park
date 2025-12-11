import Database from 'better-sqlite3';
import { getDbPath } from './utils/paths';

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
  id: string;
  name: string;
  directory: string;
  command: string;
  type: 'interactive-pty' | 'non-interactive';
  pid?: number | null;
}

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = getDbPath();
  console.log(`[Database] Initializing database at: ${dbPath}`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  // Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      directory TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'stopped', 'completed', 'configured')),
      type TEXT NOT NULL CHECK(type IN ('interactive-pty', 'non-interactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      pid INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
  `);

  // Create trigger for updated_at
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_sessions_timestamp 
    AFTER UPDATE ON sessions
    BEGIN
      UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('[Database] Initialized at:', getDbPath());
}

export function getSession(id: string): Session | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const session = stmt.get(id) as Session | undefined;
  console.log(`[Database] getSession(${id}) returned:`, session ? `${session.name} (${session.status})` : 'undefined');
  return session;
}

export function getAllSessions(): Session[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
  const sessions = stmt.all() as Session[];
  console.log(`[Database] getAllSessions() returned ${sessions.length} sessions`);
  return sessions;
}

export function createSession(input: SessionCreateInput): Session {
  console.log(`[Database] Creating session: ${input.name} (${input.id})`);
  const stmt = db.prepare(`
    INSERT INTO sessions (id, name, directory, command, type, status, pid)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `);
  
  stmt.run(input.id, input.name, input.directory, input.command, input.type, input.pid || null);
  const session = getSession(input.id)!;
  console.log(`[Database] Session created successfully: ${session.id}`);
  return session;
}

export function updateSession(id: string, data: Partial<Session>): void {
  const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return;

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => (data as any)[f]);
  
  const stmt = db.prepare(`UPDATE sessions SET ${setClause} WHERE id = ?`);
  stmt.run(...values, id);
}

export function deleteSession(id: string): void {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  stmt.run(id);
}

export function getSetting(key: string): string | undefined {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(key, value);
}

export function getDatabase(): Database.Database {
  return db;
}
