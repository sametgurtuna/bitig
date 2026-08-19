import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { HistoryEntry } from '../../shared/historyTypes';

const MAX_HISTORY_ENTRIES = 5000;

/**
 * Hassas API anahtarlarini, token'lari ve parolalari gecmise kaydolmadan once maskeler.
 */
export function maskSecrets(input: string): string {
  let res = input;
  // GitHub PAT
  res = res.replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_************************************');
  res = res.replace(/github_pat_[a-zA-Z0-9_]{82}/g, 'github_pat_**********************************************************************************');
  // OpenAI API Key
  res = res.replace(/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g, (match) => match.slice(0, 5) + '****************');
  // AWS Access Key
  res = res.replace(/AKIA[0-9A-Z]{16}/g, 'AKIA****************');
  // Bearer token
  res = res.replace(/(bearer\s+)[a-zA-Z0-9_\-.]{20,}/gi, '$1****************');
  // Generic password in flags
  res = res.replace(/(--password|-p|password=)([\s=])([^\s&]+)/gi, '$1$2********');
  return res;
}

/**
 * Oturumlar arasi calistirilan komutlari kaydeden ve frecency (yenilik + siklik)
 * puanlamasiyla sunan gecmis magazasi.
 */
export class HistoryStore {
  private readonly filePath = path.join(app.getPath('userData'), 'history.json');
  private entries: HistoryEntry[] = [];

  load(): void {
    this.entries = this.readFromDisk();
  }

  list(): HistoryEntry[] {
    // Frecency puanlamasina gore sirala: Yenilik (timestamp) + Kullanilma sikligi (count)
    return [...this.entries].sort((a, b) => {
      const scoreA = a.timestamp + a.count * 60_000;
      const scoreB = b.timestamp + b.count * 60_000;
      return scoreB - scoreA;
    });
  }

  add(command: string, cwd?: string, durationMs?: number, exitCode?: number): HistoryEntry[] {
    const sanitized = maskSecrets(command.trim());
    if (!sanitized) return this.list();

    const existingIndex = this.entries.findIndex((e) => e.command === sanitized);
    const now = Date.now();

    if (existingIndex >= 0) {
      const existing = this.entries[existingIndex];
      existing.count += 1;
      existing.timestamp = now;
      if (cwd) existing.cwd = cwd;
      if (durationMs !== undefined) existing.lastDurationMs = durationMs;
      if (exitCode !== undefined) existing.exitCode = exitCode;
    } else {
      this.entries.push({
        id: `h-${crypto.randomUUID().slice(0, 8)}`,
        command: sanitized,
        timestamp: now,
        count: 1,
        cwd,
        lastDurationMs: durationMs,
        exitCode
      });
    }

    if (this.entries.length > MAX_HISTORY_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_HISTORY_ENTRIES);
    }

    this.persist();
    return this.list();
  }

  clear(): HistoryEntry[] {
    this.entries = [];
    this.persist();
    return [];
  }

  private readFromDisk(): HistoryEntry[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as HistoryEntry[];
      }
      return [];
    } catch (error) {
      console.error(`[Bitig] history.json okunamadi: ${String(error)}`);
      return [];
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[Bitig] history.json kaydedilemedi: ${String(error)}`);
    }
  }
}
