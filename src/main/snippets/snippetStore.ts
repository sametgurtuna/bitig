import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { DEFAULT_SNIPPETS, type BitigSnippet } from '../../shared/snippetTypes';

/**
 * Bitig Betik (Snippet & Runbook) koleksiyonunu yoneten ve diskte saklayan magaza.
 */
export class SnippetStore {
  private readonly filePath = path.join(app.getPath('userData'), 'snippets.json');
  private snippets: BitigSnippet[] = [];

  load(): void {
    this.snippets = this.readFromDisk();
  }

  list(): BitigSnippet[] {
    return [...this.snippets];
  }

  save(snippet: BitigSnippet): BitigSnippet[] {
    const index = this.snippets.findIndex((s) => s.id === snippet.id);
    if (index >= 0) {
      this.snippets[index] = snippet;
    } else {
      this.snippets.push(snippet);
    }
    this.persist();
    return this.list();
  }

  delete(id: string): BitigSnippet[] {
    this.snippets = this.snippets.filter((s) => s.id !== id);
    this.persist();
    return this.list();
  }

  reset(): BitigSnippet[] {
    this.snippets = [...DEFAULT_SNIPPETS];
    this.persist();
    return this.list();
  }

  private readFromDisk(): BitigSnippet[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.snippets = [...DEFAULT_SNIPPETS];
        this.persist();
        return this.snippets;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as BitigSnippet[];
      }
      return [...DEFAULT_SNIPPETS];
    } catch (error) {
      console.error(`[Bitig] snippets.json okunamadi, varsayilanlara donuluyor: ${String(error)}`);
      return [...DEFAULT_SNIPPETS];
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.snippets, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[Bitig] snippets.json kaydedilemedi: ${String(error)}`);
    }
  }
}
