import { ipcMain } from 'electron';
import { AI_CHANNELS, type AiPromptRequest, type AiExplainErrorRequest } from '../../shared/aiTypes';
import { AiService } from '../ai/aiService';
import type { SettingsStore } from '../settings/settingsStore';

const aiService = new AiService();

const MAX_QUERY_LENGTH = 4000;

export function registerAiHandlers(settingsStore: SettingsStore): void {
  ipcMain.handle(AI_CHANNELS.prompt, async (_event, request: AiPromptRequest) => {
    const aiSettings = settingsStore.get().ai;
    if (!aiSettings.enabled) {
      return {
        success: false,
        error: 'Bitig Bilge (AI assistant) is disabled in settings.'
      };
    }
    if (typeof request?.userQuery !== 'string' || request.userQuery.trim() === '') {
      return { success: false, error: 'Empty request.' };
    }
    if (request.userQuery.length > MAX_QUERY_LENGTH) {
      return { success: false, error: `Request is too long (max ${MAX_QUERY_LENGTH} characters).` };
    }
    return aiService.generateCommand(aiSettings, request);
  });

  ipcMain.handle(AI_CHANNELS.explainError, async (_event, request: AiExplainErrorRequest) => {
    const aiSettings = settingsStore.get().ai;
    if (!aiSettings.enabled) {
      return {
        success: false,
        error: 'Bitig Bilge (AI assistant) is disabled in settings.'
      };
    }
    if (typeof request?.failedCommand !== 'string' || request.failedCommand.trim() === '') {
      return { success: false, error: 'No failed command provided.' };
    }
    return aiService.explainError(aiSettings, request);
  });

  ipcMain.handle(AI_CHANNELS.testConnection, async () => {
    const aiSettings = settingsStore.get().ai;
    return aiService.testConnection(aiSettings);
  });
}
