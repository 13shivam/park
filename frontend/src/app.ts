import { getSessions, createSession, Session, SessionCreateInput, getPromptTemplates, PromptTemplate, cleanupCompletedSessions } from './api';
import { TerminalInstance } from './terminal';
import { buildCommand } from './utils/CommandBuilder';
import { loadPrompts as loadPromptsUtil } from './utils/PromptLoader';
import { sessionManager } from './managers/SessionManager';
import { terminalManager } from './managers/TerminalManager';
import { renderSessionList } from './ui/SessionList';
import { openEditModal } from './ui/NewSessionModal';
import { setupEventListeners } from './ui/EventHandlers';

// Global error handler - console only, no alerts
window.addEventListener('error', (e) => {
  console.error('[App] Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[App] Unhandled rejection:', e.reason);
});

// State
let prompts: PromptTemplate[] = [];

// DOM Elements
const sessionList = document.getElementById('session-list')!;
const newSessionBtn = document.getElementById('new-session-btn')!;
const themeToggleBtn = document.getElementById('theme-toggle-btn')!;
const cleanupBtn = document.getElementById('cleanup-btn')!;
const killAllBtn = document.getElementById('kill-all-btn')!;
const launchSelectedBtn = document.getElementById('launch-selected-btn')!;
const viewAllBtn = document.getElementById('view-all-btn')!;
const newSessionModal = document.getElementById('new-session-modal') as HTMLDialogElement;
const newSessionForm = document.getElementById('new-session-form') as HTMLFormElement;
const modeSelect = document.getElementById('session-mode') as HTMLSelectElement;
const sessionNameInput = document.getElementById('session-name') as HTMLInputElement;
const sessionDirInput = document.getElementById('session-directory') as HTMLInputElement;
const sessionArgsInput = document.getElementById('session-args') as HTMLInputElement;
const sessionFileInput = document.getElementById('session-file') as HTMLInputElement;
const commandGroup = document.getElementById('command-group')!;
const cancelBtn = document.getElementById('cancel-btn')!;
const saveBtn = document.getElementById('save-btn')!;
const launchBtn = newSessionForm.querySelector('button[type="submit"]') as HTMLButtonElement;
const terminalGrid = document.getElementById('terminal-grid')!;
const statusText = document.getElementById('status-text')!;
const loadingSpinner = document.getElementById('loading-spinner') as HTMLImageElement;

// Initialize
async function init() {
  console.log('[App] Initializing...');
  
  loadingSpinner.style.display = 'inline-block';
  statusText.textContent = 'Loading sessions...';
  
  prompts = await loadPromptsUtil();
  await loadSessions();
  
  setupEventListeners({
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
  }, prompts, loadSessions);
  
  loadingSpinner.style.display = 'none';
  console.log('[App] Ready');
  statusText.textContent = 'Ready';
}

// Load sessions from API
async function loadSessions() {
  try {
    console.log('[App] Loading sessions...');
    const sessions = await sessionManager.loadSessions();
    console.log('[App] Loaded sessions:', sessions.length);
    
    // Render using UI component
    renderSessionList(
      sessionList,
      statusText,
      handleRelaunchSession,
      (session) => openEditModal(session, newSessionModal, newSessionForm, launchBtn, saveBtn),
      (sessionId) => terminalManager.attachSessionToCell(sessionId, 0)
    );
    
    statusText.textContent = sessions.length === 0 ? 'No sessions' : `${sessions.length} session${sessions.length > 1 ? 's' : ''}`;
  } catch (error) {
    console.error('[App] Failed to load sessions:', error);
    loadingSpinner.style.display = 'none';
    statusText.textContent = 'Error loading sessions';
    sessionList.innerHTML = '<li style="color: #f48771; padding: 10px;">Failed to load sessions. Check console.</li>';
  }
}

// Handle session relaunch
async function handleRelaunchSession(sessionId: string): Promise<void> {
  try {
    statusText.textContent = 'Relaunching...';
    const res = await fetch('/api/sessions/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds: [sessionId] })
    });
    const data = await res.json();
    await loadSessions();
    statusText.textContent = 'Session relaunched';
    setTimeout(() => statusText.textContent = 'Ready', 2000);
  } catch (error) {
    console.error('[App] Failed to rerun session:', error);
    statusText.textContent = 'Error relaunching';
  }
}

// Start the app
init();

// Global functions for onclick handlers
(window as any).closeTerminal = () => {
  console.log('[App] Close button clicked');
  terminalManager.closeTerminal(0);
};

(window as any).stopSession = async () => {
  console.log('[App] Stop button clicked');
  const existing = terminalManager.getTerminal(0);
  if (!existing) {
    console.log('[App] No terminal attached');
    return;
  }
  
  const session = sessionManager.getSessionById(existing.sessionId);
  if (!confirm(`Stop session "${session?.name}"?`)) {
    return;
  }
  
  try {
    statusText.textContent = 'Stopping session...';
    console.log('[App] Stopping session:', existing.sessionId);
    const res = await fetch(`/api/sessions/${existing.sessionId}/stop`, { method: 'POST' });
    console.log('[App] Stop response:', await res.json());
    
    terminalManager.closeTerminal(0);
    
    await loadSessions();
    statusText.textContent = 'Session stopped';
    setTimeout(() => statusText.textContent = 'Ready', 2000);
  } catch (error) {
    console.error('[App] Failed to stop session:', error);
    statusText.textContent = 'Error stopping session';
  }
};
