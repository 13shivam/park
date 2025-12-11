import { TerminalInstance } from '../terminal';
import { sessionManager } from './SessionManager';

/**
 * TerminalManager - Manages terminal instances and their lifecycle
 */
export class TerminalManager {
  private terminals: Map<number, { terminal: TerminalInstance; sessionId: string }> = new Map();

  /**
   * Attach a session to a terminal cell
   */
  attachSessionToCell(sessionId: string, cellIndex: number): void {
    const cell = document.querySelector(`.terminal-cell[data-cell="${cellIndex}"]`) as HTMLElement;
    if (!cell) return;
    
    const container = cell.querySelector('.terminal-container') as HTMLElement;
    const emptyState = cell.querySelector('.terminal-empty') as HTMLElement;
    const title = cell.querySelector('.cell-title') as HTMLElement;
    const cellActions = cell.querySelector('.cell-actions') as HTMLElement;
    
    // Close existing terminal if any
    const existing = this.terminals.get(cellIndex);
    if (existing) {
      existing.terminal.dispose();
      this.terminals.delete(cellIndex);
    }
    
    // Clear container and hide empty state
    container.innerHTML = '';
    container.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    if (cellActions) cellActions.style.display = 'flex';
    
    // Find session
    const session = sessionManager.getSessionById(sessionId);
    if (!session) return;
    
    // Update title
    title.textContent = session.name;
    
    // Create new terminal
    const terminal = new TerminalInstance(sessionId, container);
    this.terminals.set(cellIndex, { terminal, sessionId });
    
    // Fit terminal after a short delay
    setTimeout(() => terminal.fit(), 100);
    
    console.log(`[TerminalManager] Attached session ${session.name} to cell ${cellIndex}`);
  }

  /**
   * Close terminal at cell index
   */
  closeTerminal(cellIndex: number): void {
    const existing = this.terminals.get(cellIndex);
    if (existing) {
      existing.terminal.dispose();
      this.terminals.delete(cellIndex);
    }

    const cell = document.querySelector(`.terminal-cell[data-cell="${cellIndex}"]`) as HTMLElement;
    if (!cell) return;

    const container = cell.querySelector('.terminal-container') as HTMLElement;
    const emptyState = cell.querySelector('.terminal-empty') as HTMLElement;
    const title = cell.querySelector('.cell-title') as HTMLElement;
    const cellActions = cell.querySelector('.cell-actions') as HTMLElement;
    
    container.innerHTML = '';
    container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    if (cellActions) cellActions.style.display = 'none';
    title.textContent = 'Terminal';
  }

  /**
   * Get terminal at cell index
   */
  getTerminal(cellIndex: number): { terminal: TerminalInstance; sessionId: string } | undefined {
    return this.terminals.get(cellIndex);
  }

  /**
   * Get all terminals
   */
  getAllTerminals(): Map<number, { terminal: TerminalInstance; sessionId: string }> {
    return this.terminals;
  }

  /**
   * Close terminals for specific sessions
   */
  closeTerminalsForSessions(sessionIds: string[]): void {
    this.terminals.forEach((termData, cellIndex) => {
      if (sessionIds.includes(termData.sessionId)) {
        this.closeTerminal(cellIndex);
      }
    });
  }
}

// Export singleton instance
export const terminalManager = new TerminalManager();
