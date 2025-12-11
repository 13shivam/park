import { Session } from '../api';

/**
 * Opens the edit modal and populates it with session data
 */
export function openEditModal(
  session: Session,
  modalElement: HTMLDialogElement,
  formElement: HTMLFormElement,
  launchBtnElement: HTMLButtonElement,
  saveBtnElement: HTMLButtonElement
): void {
  const sessionNameInput = document.getElementById('session-name') as HTMLInputElement;
  const sessionDirInput = document.getElementById('session-directory') as HTMLInputElement;
  const modeSelect = document.getElementById('session-mode') as HTMLSelectElement;
  const sessionArgsInput = document.getElementById('session-args') as HTMLInputElement;
  
  // Populate form with existing session data
  sessionNameInput.value = session.name;
  sessionDirInput.value = session.directory;
  
  // Set mode based on session type
  if (session.type === 'interactive-pty') {
    modeSelect.value = 'kiro-interactive';
    document.getElementById('prompt-group')!.style.display = 'block';
    document.getElementById('command-group')!.style.display = 'none';
    document.getElementById('file-group')!.style.display = 'none';
    
    // Extract prompt from command: kiro-cli chat 'prompt text'
    const promptMatch = session.command.match(/kiro-cli chat '(.+)'$/);
    if (promptMatch) {
      const unescapedPrompt = promptMatch[1].replace(/'\\'/g, "'");
      (document.getElementById('session-prompt') as HTMLTextAreaElement).value = unescapedPrompt;
    }
  } else {
    modeSelect.value = 'kiro-non-interactive';
    document.getElementById('prompt-group')!.style.display = 'none';
    document.getElementById('command-group')!.style.display = 'block';
    document.getElementById('file-group')!.style.display = 'block';
    
    // Extract args from command
    const argsMatch = session.command.match(/kiro-cli chat --no-interactive\s+(.+)/);
    if (argsMatch) {
      sessionArgsInput.value = argsMatch[1];
    }
  }
  
  // Change launch button to "Update & Launch"
  launchBtnElement.textContent = 'Update & Launch';
  saveBtnElement.textContent = 'Update Config';
  
  // Store session ID for update
  formElement.dataset.editingSessionId = session.id;
  
  modalElement.showModal();
}
