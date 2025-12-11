import { getSessions, Session } from '../api';

/**
 * SessionManager - Manages session state and operations
 */
export class SessionManager {
  private sessions: Session[] = [];
  public selectedSessions: Set<string> = new Set();

  /**
   * Load sessions from API
   */
  async loadSessions(): Promise<Session[]> {
    try {
      console.log('[SessionManager] Loading sessions...');
      this.sessions = await getSessions();
      console.log('[SessionManager] Loaded sessions:', this.sessions.length);
      return this.sessions;
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
      throw error;
    }
  }

  /**
   * Get all sessions
   */
  getSessions(): Session[] {
    return this.sessions;
  }

  /**
   * Get session by ID
   */
  getSessionById(id: string): Session | undefined {
    return this.sessions.find(s => s.id === id);
  }

  /**
   * Clear selected sessions
   */
  clearSelection(): void {
    this.selectedSessions.clear();
  }

  /**
   * Add session to selection
   */
  selectSession(id: string): boolean {
    if (this.selectedSessions.size >= 5) {
      return false;
    }
    this.selectedSessions.add(id);
    return true;
  }

  /**
   * Remove session from selection
   */
  deselectSession(id: string): void {
    this.selectedSessions.delete(id);
  }

  /**
   * Check if session is selected
   */
  isSelected(id: string): boolean {
    return this.selectedSessions.has(id);
  }

  /**
   * Get selected session IDs as array
   */
  getSelectedIds(): string[] {
    return Array.from(this.selectedSessions);
  }

  /**
   * Get count of selected sessions
   */
  getSelectedCount(): number {
    return this.selectedSessions.size;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
