import type {
  AiSettings,
  AiPromptRequest,
  AiPromptResponse,
  AiExplainErrorRequest
} from '../../shared/aiTypes';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 500;

const SYSTEM_PROMPT_COMMAND = `You are "Bitig Bilge", an expert CLI assistant for Windows.
Active Shell: {{SHELL}}

INSTRUCTIONS:
1. Provide the exact, ready-to-run terminal command inside a markdown code block:
\`\`\`{{SHELL}}
<exact command>
\`\`\`
2. Keep any explanation brief and in English.`;

const SYSTEM_PROMPT_EXPLAIN = `You are "Bitig Bilge", an expert terminal troubleshooter.
Your task: analyze why a terminal command failed based on the command and its error output, and provide a clear, concise, actionable fix in English.
Format:
1. Root Cause (1-2 sentences)
2. Fix / Corrected Command`;

export class AiService {
  async generateCommand(settings: AiSettings, request: AiPromptRequest): Promise<AiPromptResponse> {
    const shell = request.shellType || 'PowerShell';
    const sysPrompt = SYSTEM_PROMPT_COMMAND.replace(/\{\{SHELL\}\}/g, shell);
    const userPrompt = `Directory: ${request.cwd || 'current directory'}\nUser Request: ${request.userQuery}`;

    try {
      const rawText = await this.callProvider(settings, sysPrompt, userPrompt);
      const parsed = this.parseCommandOutput(rawText);

      return {
        success: true,
        command: parsed.command,
        explanation: parsed.explanation,
        rawText
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message || String(err)
      };
    }
  }

  private parseCommandOutput(rawText: string): { command: string; explanation?: string } {
    const trimmed = rawText.trim();

    // 1. Markdown code block: ```powershell ... ``` or ``` ... ```
    const codeBlockMatch = trimmed.match(/```(?:powershell|bash|sh|cmd|ps1)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1].trim()) {
      const command = codeBlockMatch[1].trim();
      const explanation = trimmed.replace(codeBlockMatch[0], '').trim();
      return { command, explanation: explanation || undefined };
    }

    // 2. Single-line backtick: `Get-ChildItem ...`
    const inlineMatch = trimmed.match(/`([^`\n]+)`/);
    if (inlineMatch && inlineMatch[1].trim()) {
      const command = inlineMatch[1].trim();
      const explanation = trimmed.replace(inlineMatch[0], '').trim();
      return { command, explanation: explanation || undefined };
    }

    // 3. Plain-text parsing (skip conversational intro lines)
    const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const conversational = ['sure', 'certainly', 'here', 'command:', 'the following', 'below is'];

    let commandCandidate = '';
    const explanationLines: string[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      const isIntro = conversational.some((c) => lower.startsWith(c) && !lower.includes('|') && !lower.includes('-'));
      if (!commandCandidate && !isIntro) {
        commandCandidate = line;
      } else {
        explanationLines.push(line);
      }
    }

    const command = (commandCandidate || lines[0] || trimmed).replace(/^[#>-]\s*/, '').trim();
    const explanation = explanationLines.join('\n').trim();

    return { command, explanation: explanation || undefined };
  }

  async explainError(settings: AiSettings, request: AiExplainErrorRequest): Promise<AiPromptResponse> {
    const sysPrompt = SYSTEM_PROMPT_EXPLAIN;
    const userPrompt = `Failed Command: ${request.failedCommand}\nExit Code: ${request.exitCode ?? 'Unknown'}\nError Output:\n${request.outputSnippet}`;

    try {
      const rawText = await this.callProvider(settings, sysPrompt, userPrompt);
      return {
        success: true,
        explanation: rawText.trim(),
        rawText
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message || String(err)
      };
    }
  }

  async testConnection(settings: AiSettings): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callProvider(
        settings,
        'You are a test system. Reply with only "OK".',
        'Connection test'
      );
      return {
        success: true,
        message: `Connection successful (${settings.provider}): ${response.slice(0, 50).trim()}`
      };
    } catch (err) {
      return {
        success: false,
        message: `Connection error: ${(err as Error).message || String(err)}`
      };
    }
  }

  /** Resolves the actual base URL to call, honoring a user-configured
   * custom endpoint and falling back to the provider's default otherwise. */
  private resolveEndpoint(endpoint: string, fallback: string): string {
    const trimmed = (endpoint || '').trim().replace(/\/+$/, '');
    return trimmed || fallback;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readErrorBody(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.length > MAX_ERROR_BODY_LENGTH
        ? `${text.slice(0, MAX_ERROR_BODY_LENGTH)}… (truncated)`
        : text;
    } catch {
      return '(no response body)';
    }
  }

  private async callProvider(
    settings: AiSettings,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const { provider, endpoint, apiKey, model, temperature } = settings;

    // API key check (required for every provider except Ollama)
    if (provider !== 'ollama' && (!apiKey || !apiKey.trim())) {
      throw new Error(
        `No API key set for "${provider.toUpperCase()}". Please set a valid API key under Settings (Ctrl+,) > "Bitig Bilge".`
      );
    }

    try {
      if (provider === 'ollama') {
        const base = this.resolveEndpoint(endpoint, 'http://localhost:11434');
        const url = `${base}/api/generate`;
        const res = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'llama3.2',
            prompt: `${systemPrompt}\n\nUser Request:\n${userPrompt}`,
            stream: false,
            options: { temperature: temperature ?? 0.2 }
          })
        });
        if (!res.ok) {
          throw new Error(`Ollama response error (${res.status}): ${await this.readErrorBody(res)}`);
        }
        const data = await res.json() as { response?: string };
        return data.response || '';
      }

      if (provider === 'openai' || provider === 'deepseek' || provider === 'custom') {
        const base = this.resolveEndpoint(endpoint, 'https://api.openai.com/v1');
        const url = `${base}/chat/completions`;
        const res = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: temperature ?? 0.2
          })
        });
        if (!res.ok) {
          throw new Error(`${provider.toUpperCase()} API error (${res.status}): ${await this.readErrorBody(res)}`);
        }
        const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content || '';
      }

      if (provider === 'anthropic') {
        const base = this.resolveEndpoint(endpoint, 'https://api.anthropic.com/v1');
        const url = `${base}/messages`;
        const res = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey.trim(),
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-haiku-20241022',
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            max_tokens: 1024,
            temperature: temperature ?? 0.2
          })
        });
        if (!res.ok) {
          throw new Error(`Anthropic API error (${res.status}): ${await this.readErrorBody(res)}`);
        }
        const data = await res.json() as { content?: Array<{ text?: string }> };
        return data.content?.[0]?.text || '';
      }

      if (provider === 'gemini') {
        const modelName = model || 'gemini-1.5-flash';
        // Gemini's key goes in the query string per Google's documented API shape; a
        // custom endpoint is still honored (e.g. for a corporate proxy in front of it).
        const base = this.resolveEndpoint(
          endpoint,
          'https://generativelanguage.googleapis.com/v1beta'
        );
        const url = `${base}/models/${modelName}:generateContent?key=${apiKey.trim()}`;
        const res = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: temperature ?? 0.2 }
          })
        });
        if (!res.ok) {
          throw new Error(`Gemini API error (${res.status}): ${await this.readErrorBody(res)}`);
        }
        const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      throw new Error(`Unknown AI provider: ${provider}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `Request to the ${provider.toUpperCase()} provider timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
        );
      }
      const msg = (err as Error).message || String(err);
      const isConnectivityError =
        /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg) ||
        (err as { cause?: { code?: string } }).cause?.code !== undefined;
      if (isConnectivityError) {
        if (provider === 'ollama') {
          throw new Error(
            `Could not reach the local Ollama server (${endpoint || 'http://localhost:11434'}).\nPlease start Ollama ("ollama serve") or set an OpenAI/Gemini/Claude key under Settings (Ctrl+,).`
          );
        }
        throw new Error(`Could not reach the API server (${endpoint}): check your internet connection or the endpoint address.`);
      }
      throw err;
    }
  }
}
