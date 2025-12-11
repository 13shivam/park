import { PromptTemplate } from '../api';

/**
 * Builds the kiro-cli command based on session mode and form data
 * @param mode - Session mode ('kiro-interactive' or 'kiro-non-interactive')
 * @param template - Prompt template (currently unused but kept for future)
 * @param formData - Form data containing prompt text, args, and file
 * @param statusText - Status text element for upload feedback
 * @returns Promise<string> - The constructed command string
 */
export async function buildCommand(
  mode: string,
  template: PromptTemplate,
  formData: FormData,
  statusText: HTMLElement
): Promise<string> {
  let command = template.command;
  
  if (mode === 'kiro-interactive') {
    command = 'kiro-cli chat';
    const promptText = (formData.get('prompt') as string || '').trim();
    if (promptText) {
      const escapedPrompt = promptText.replace(/'/g, "'\\''");
      command += ` '${escapedPrompt}'`;
    }
  } else if (mode === 'kiro-non-interactive') {
    let promptFilePath = '';
    const fileInput = document.getElementById('session-file') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (file) {
      // Validate file extension
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.md') && !fileName.endsWith('.txt')) {
        throw new Error('Only .md and .txt files are allowed');
      }
      
      statusText.textContent = 'Uploading file...';
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      
      const uploadRes = await fetch('/api/system/upload', {
        method: 'POST',
        body: uploadFormData
      });
      
      if (uploadRes.ok) {
        const uploadedFile = await uploadRes.json();
        promptFilePath = uploadedFile.path;
      }
    }
    
    command += ' --trust-all-tools --no-interactive';
    const args = formData.get('args') as string;
    if (args) {
      command += ` ${args}`;
    }
    if (promptFilePath) {
      command = `cat "${promptFilePath}" | ${command}`;
    }
  }
  
  return command;
}
