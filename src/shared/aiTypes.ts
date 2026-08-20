export const AI_CHANNELS = {
  prompt: 'ai:prompt',
  explainError: 'ai:explain-error',
  testConnection: 'ai:test-connection'
} as const;

export type AiProviderType = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'custom';

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt?: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  provider: 'ollama',
  endpoint: 'http://localhost:11434',
  apiKey: '',
  model: 'llama3.2',
  temperature: 0.2
};

export interface AiPromptRequest {
  userQuery: string;
  shellType?: string;
  cwd?: string;
}

export interface AiPromptResponse {
  success: boolean;
  command?: string;
  explanation?: string;
  rawText?: string;
  error?: string;
}

export interface AiExplainErrorRequest {
  failedCommand: string;
  outputSnippet: string;
  exitCode?: number;
  shellType?: string;
}
