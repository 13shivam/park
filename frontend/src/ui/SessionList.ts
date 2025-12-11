import { sessionManager } from '../managers/SessionManager';
import { Session } from '../api';

/**
 * Renders the session list in the sidebar
 */
export function renderSessionList(
  sessionListElement: HTMLElement,
  statusTextElement: HTMLElement,
  onRelaunch: (sessionId: string) => Promise<void>,
  onEdit: (session: Session) => void,
  onAttach: (sessionId: string) => void
): void {
  const sessions = sessionManager.getSessions();
  sessionListElement.innerHTML = '';
  
  if (sessions.length === 0) {
    sessionListElement.innerHTML = '<li style="color: #888; padding: 10px; font-size: 12px;">No sessions yet. Click + to create one.</li>';
    return;
  }
  
  sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = 'session-item';
    li.dataset.sessionId = session.id;
    
    // Checkbox for selection (all except active sessions)
    if (session.status !== 'active') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'session-checkbox';
      checkbox.checked = sessionManager.isSelected(session.id);
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          if (!sessionManager.selectSession(session.id)) {
            checkbox.checked = false;
            statusTextElement.textContent = 'Maximum 5 sessions can be selected';
            setTimeout(() => statusTextElement.textContent = 'Ready', 2000);
            return;
          }
        } else {
          sessionManager.deselectSession(session.id);
        }
      });
      li.appendChild(checkbox);
    }
    
    const statusDot = document.createElement('span');
    statusDot.className = `session-status ${session.status}`;
    
    const name = document.createElement('span');
    name.textContent = session.name;
    name.style.flex = '1';
    
    li.appendChild(statusDot);
    li.appendChild(name);
    
    // Rerun button for stopped/completed sessions
    if (session.status === 'stopped' || session.status === 'completed') {
      const rerunBtn = document.createElement('button');
      rerunBtn.textContent = '↻';
      rerunBtn.title = 'Rerun';
      rerunBtn.style.cssText = 'background: #0e639c; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 14px; margin-left: 5px;';
      rerunBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await onRelaunch(session.id);
      });
      li.appendChild(rerunBtn);
    }
    
    // Edit button for non-active sessions
    if (session.status !== 'active') {
      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.title = 'Edit';
      editBtn.style.cssText = 'background: #666; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 14px; margin-left: 5px;';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onEdit(session);
      });
      li.appendChild(editBtn);
    }
    
    // Click to view in terminal (only for active sessions)
    if (session.status === 'active') {
      li.addEventListener('click', () => onAttach(session.id));
      li.style.cursor = 'pointer';
    }
    
    sessionListElement.appendChild(li);
  });
}
