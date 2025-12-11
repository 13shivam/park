import { getPromptTemplates, PromptTemplate } from '../api';

/**
 * Loads prompt templates from the API
 * @returns Promise<PromptTemplate[]> - Array of prompt templates
 */
export async function loadPrompts(): Promise<PromptTemplate[]> {
  try {
    const prompts = await getPromptTemplates();
    console.log('[PromptLoader] Loaded prompts:', prompts.length);
    return prompts;
  } catch (error) {
    console.error('[PromptLoader] Failed to load prompts:', error);
    return [];
  }
}
