import os from 'os';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  command: string;
  defaultDirectory: string;
  type: 'interactive-pty' | 'non-interactive';
  allowFileUpload: boolean;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'kiro-interactive',
    name: 'Kiro CLI (Interactive)',
    description: 'Launch Kiro CLI in interactive chat mode',
    command: 'kiro-cli chat',
    defaultDirectory: os.homedir(),
    type: 'interactive-pty',
    allowFileUpload: true
  },
  {
    id: 'kiro-non-interactive',
    name: 'Kiro CLI (Non-Interactive)',
    description: 'Run Kiro CLI command and exit',
    command: 'kiro-cli chat',
    defaultDirectory: os.homedir(),
    type: 'interactive-pty',
    allowFileUpload: true
  }
];

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find(t => t.id === id);
}

export function getAllPromptTemplates(): PromptTemplate[] {
  return PROMPT_TEMPLATES;
}
