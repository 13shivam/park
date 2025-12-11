import { createSession, SessionCreateInput, cleanupCompletedSessions, PromptTemplate } from '../api';
import { sessionManager } from '../managers/SessionManager';
import { terminalManager } from '../managers/TerminalManager';
import { buildCommand } from '../utils/CommandBuilder';

/**
 * Setup all event listeners for the application
 */
export function setupEventListeners(
  elements: {
    newSessionBtn: HTMLElement;
    themeToggleBtn: HTMLElement;
    saveBtn: HTMLElement;
    launchSelectedBtn: HTMLElement;
    killAllBtn: HTMLElement;
    viewAllBtn: HTMLElement;
    cleanupBtn: HTMLElement;
    modeSelect: HTMLSelectElement;
    cancelBtn: HTMLElement;
    newSessionForm: HTMLFormElement;
    newSessionModal: HTMLDialogElement;
    sessionNameInput: HTMLInputElement;
    sessionDirInput: HTMLInputElement;
    launchBtn: HTMLButtonElement;
    statusText: HTMLElement;
  },
  prompts: PromptTemplate[],
  loadSessions: () => Promise<void>
): void {
  const {
    newSessionBtn,
    themeToggleBtn,
    saveBtn,
    launchSelectedBtn,
    killAllBtn,
    viewAllBtn,
    cleanupBtn,
    modeSelect,
    cancelBtn,
    newSessionForm,
    newSessionModal,
    sessionNameInput,
    sessionDirInput,
    launchBtn,
    statusText
  } = elements;

  // New session button
  newSessionBtn.addEventListener('click', () => {
    newSessionForm.reset();
    delete newSessionForm.dataset.editingSessionId;
    launchBtn.textContent = 'Launch Now';
    saveBtn.textContent = 'Save Config';
    newSessionModal.showModal();
  });

  // Theme toggle button
  themeToggleBtn.addEventListener('click', () => {
    const body = document.body;
    const isLight = body.classList.toggle('light-theme');
    themeToggleBtn.textContent = isLight ? '🌙' : '☀';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });

  // Load saved theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    themeToggleBtn.textContent = '🌙';
  }

  // Save button
  saveBtn.addEventListener('click', async () => {
    const formData = new FormData(newSessionForm);
    const mode = formData.get('mode') as string;
    
    if (!mode) {
      statusText.textContent = 'Please select a mode';
      return;
    }
    
    const template = prompts.find(p => p.id === mode);
    if (!template) return;
    
    const command = await buildCommand(mode, template, formData, statusText);
    
    const input: SessionCreateInput = {
      name: formData.get('name') as string,
      directory: formData.get('directory') as string,
      command: command,
      type: template.type
    };
    
    try {
      const editingId = newSessionForm.dataset.editingSessionId;
      
      if (editingId) {
        statusText.textContent = 'Updating config...';
        await fetch(`/api/sessions/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        });
        statusText.textContent = 'Config updated';
      } else {
        statusText.textContent = 'Saving config...';
        await fetch('/api/sessions/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        });
        statusText.textContent = 'Config saved';
      }
      
      await loadSessions();
      newSessionModal.close();
      newSessionForm.reset();
      delete newSessionForm.dataset.editingSessionId;
      document.getElementById('prompt-group')!.style.display = 'none';
      document.getElementById('command-group')!.style.display = 'none';
      document.getElementById('file-group')!.style.display = 'none';
      setTimeout(() => statusText.textContent = 'Ready', 2000);
    } catch (error) {
      console.error('[EventHandlers] Failed to save config:', error);
      statusText.textContent = 'Error saving config';
    }
  });

  // Launch selected button
  launchSelectedBtn.addEventListener('click', async () => {
    if (sessionManager.getSelectedCount() === 0) {
      statusText.textContent = 'No sessions selected';
      setTimeout(() => statusText.textContent = 'Ready', 2000);
      return;
    }
    
    try {
      statusText.textContent = `Launching ${sessionManager.getSelectedCount()} session(s)...`;
      const res = await fetch('/api/sessions/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: sessionManager.getSelectedIds() })
      });
      const data = await res.json();
      
      sessionManager.clearSelection();
      await loadSessions();
      statusText.textContent = `Launched ${data.count} session(s)`;
      setTimeout(() => statusText.textContent = 'Ready', 2000);
    } catch (error) {
      console.error('[EventHandlers] Failed to launch sessions:', error);
      statusText.textContent = 'Error launching sessions';
    }
  });

  // View all sessions button
  viewAllBtn.addEventListener('click', () => {
    const activeSessions = sessionManager.getSessions().filter(s => s.status === 'active');
    if (activeSessions.length === 0) {
      statusText.textContent = 'No active sessions';
      setTimeout(() => statusText.textContent = 'Ready', 2000);
      return;
    }
    
    alert(`Active Sessions:\n\n${activeSessions.map(s => `• ${s.name} (${s.type})`).join('\n')}\n\nClick on a session in the left panel to view it.`);
  });
  
  // Kill All Active button
  killAllBtn.addEventListener('click', async () => {
    const activeSessions = sessionManager.getSessions().filter(s => s.status === 'active');
    
    if (activeSessions.length === 0) {
      statusText.textContent = 'No active sessions';
      setTimeout(() => statusText.textContent = 'Ready', 2000);
      return;
    }
    
    if (!confirm(`Stop ${activeSessions.length} active session(s)?`)) return;
    
    try {
      statusText.textContent = `Stopping ${activeSessions.length} session(s)...`;
      
      // Stop all active sessions
      await Promise.all(
        activeSessions.map(session => 
          fetch(`/api/sessions/${session.id}/stop`, { method: 'POST' })
        )
      );
      
      // Close all terminals
      terminalManager.getAllTerminals().forEach((_, cellIndex) => {
        terminalManager.closeTerminal(cellIndex);
      });
      
      await loadSessions();
      statusText.textContent = `Stopped ${activeSessions.length} session(s)`;
      setTimeout(() => statusText.textContent = 'Ready', 2000);
    } catch (error) {
      console.error('[EventHandlers] Failed to kill all sessions:', error);
      statusText.textContent = 'Error stopping sessions';
    }
  });
  
  // Cleanup button
  cleanupBtn.addEventListener('click', async () => {
    const inactiveSessions = sessionManager.getSessions().filter(s => 
      s.status === 'stopped' || s.status === 'completed' || s.status === 'configured'
    );
    
    if (inactiveSessions.length === 0) {
      statusText.textContent = 'No sessions to clean';
      setTimeout(() => statusText.textContent = 'Ready', 2000);
      return;
    }
    
    if (!confirm(`Delete ${inactiveSessions.length} inactive session(s)?`)) return;
    
    try {
      statusText.textContent = 'Cleaning up...';
      
      const sessionsToClose: string[] = [];
      terminalManager.getAllTerminals().forEach((termData) => {
        const session = sessionManager.getSessionById(termData.sessionId);
        if (session && (session.status === 'stopped' || session.status === 'completed' || session.status === 'configured')) {
          sessionsToClose.push(termData.sessionId);
        }
      });
      
      sessionsToClose.forEach(sessionId => {
        terminalManager.getAllTerminals().forEach((termData, cellIndex) => {
          if (termData.sessionId === sessionId) {
            terminalManager.closeTerminal(cellIndex);
          }
        });
      });
      
      const deleted = await cleanupCompletedSessions();
      await loadSessions();
      statusText.textContent = `Cleaned up ${deleted} session(s)`;
      setTimeout(() => statusText.textContent = 'Ready', 2000);
    } catch (error) {
      console.error('[EventHandlers] Cleanup failed:', error);
      statusText.textContent = 'Cleanup failed';
    }
  });
  
  // Mode selection
  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value;
    if (!mode) return;
    
    const template = prompts.find(p => p.id === mode);
    if (!template) return;
    
    sessionNameInput.value = template.name.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '');
    sessionDirInput.value = template.defaultDirectory;
    
    const promptGroup = document.getElementById('prompt-group')!;
    const commandGroup = document.getElementById('command-group')!;
    const fileGroup = document.getElementById('file-group')!;
    
    if (mode === 'kiro-interactive') {
      promptGroup.style.display = 'block';
      commandGroup.style.display = 'none';
      fileGroup.style.display = 'none';
    } else if (mode === 'kiro-non-interactive') {
      promptGroup.style.display = 'none';
      commandGroup.style.display = 'block';
      fileGroup.style.display = 'block';
    }
  });
  
  // Cancel button
  cancelBtn.addEventListener('click', () => {
    newSessionModal.close();
    newSessionForm.reset();
    document.getElementById('prompt-group')!.style.display = 'none';
    document.getElementById('command-group')!.style.display = 'none';
    document.getElementById('file-group')!.style.display = 'none';
  });
  
  // New session form
  newSessionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(newSessionForm);
    const mode = formData.get('mode') as string;
    
    if (!mode) {
      statusText.textContent = 'Please select a mode';
      return;
    }
    
    const template = prompts.find(p => p.id === mode);
    if (!template) return;
    
    const command = await buildCommand(mode, template, formData, statusText);
    
    const input: SessionCreateInput = {
      name: formData.get('name') as string,
      directory: formData.get('directory') as string,
      command: command,
      type: template.type
    };
    
    try {
      statusText.textContent = 'Creating session...';
      const session = await createSession(input);
      
      await loadSessions();
      terminalManager.attachSessionToCell(session.id, 0);
      
      newSessionModal.close();
      newSessionForm.reset();
      document.getElementById('prompt-group')!.style.display = 'none';
      document.getElementById('command-group')!.style.display = 'none';
      document.getElementById('file-group')!.style.display = 'none';
      statusText.textContent = 'Session created';
    } catch (error) {
      console.error('[EventHandlers] Failed to create session:', error);
      statusText.textContent = 'Error creating session';
    }
  });
  
  // Cell buttons
  const closeBtn = document.querySelector('.cell-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => terminalManager.closeTerminal(0));
  }

  const stopBtn = document.querySelector('.cell-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      const existing = terminalManager.getTerminal(0);
      if (!existing) return;
      
      const session = sessionManager.getSessionById(existing.sessionId);
      if (!confirm(`Stop session "${session?.name}"?`)) return;
      
      try {
        statusText.textContent = 'Stopping session...';
        await fetch(`/api/sessions/${existing.sessionId}/stop`, { method: 'POST' });
        terminalManager.closeTerminal(0);
        await loadSessions();
        statusText.textContent = 'Session stopped';
        setTimeout(() => statusText.textContent = 'Ready', 2000);
      } catch (error) {
        console.error('[EventHandlers] Failed to stop session:', error);
        statusText.textContent = 'Error stopping session';
      }
    });
  }

  const addSessionBtn = document.querySelector('.add-session-btn');
  if (addSessionBtn) {
    addSessionBtn.addEventListener('click', () => newSessionModal.showModal());
  }

  // Cell maximize buttons
  document.querySelectorAll('.cell-maximize').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      const cell = document.querySelector(`.terminal-cell[data-cell="${index}"]`) as HTMLElement;
      const terminalGrid = document.getElementById('terminal-grid')!;
      const isMaximized = cell.classList.contains('maximized');
      
      if (isMaximized) {
        cell.classList.remove('maximized');
        document.querySelectorAll('.terminal-cell').forEach(c => (c as HTMLElement).style.display = '');
      } else {
        terminalGrid.className = 'grid-1x1';
        document.querySelectorAll('.terminal-cell').forEach((c, i) => {
          if (i !== index) (c as HTMLElement).style.display = 'none';
        });
        cell.classList.add('maximized');
      }
      
      setTimeout(() => {
        terminalManager.getAllTerminals().forEach(({ terminal }) => terminal.fit());
      }, 100);
    });
  });
}
