import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import {
  COMPLETION_CHANNELS,
  EMPTY_COMPLETION_CONTEXT,
  type CompletionContext
} from '../../shared/completionTypes';

/**
 * completion:context - verilen calisma dizini icin "proje farkindaligi" uretir:
 * package.json script'leri, Makefile hedefleri ve dizin/dosya adlari.
 * Renderer'daki inline oneri motoru (src/renderer/src/autocomplete.ts) bunu
 * komut gecmisiyle birlestirir.
 *
 * Sonuc dizin mtime'i ile onbelleklenir; her tus vurusunda diske gidilmez.
 */

interface CacheEntry {
  signature: string;
  value: CompletionContext;
}

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 400;

function safeMtime(target: string): number {
  try {
    return fs.statSync(target).mtimeMs;
  } catch {
    return 0;
  }
}

function readScripts(cwd: string): string[] {
  const pkgPath = path.join(cwd, 'package.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
    if (!parsed.scripts) return [];
    return Object.keys(parsed.scripts).map((name) => `npm run ${name}`);
  } catch {
    return [];
  }
}

function readMakeTargets(cwd: string): string[] {
  const makefile = path.join(cwd, 'Makefile');
  try {
    const raw = fs.readFileSync(makefile, 'utf-8');
    const targets: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_.-]+)\s*:(?!=)/.exec(line);
      if (match && !targets.includes(match[1])) targets.push(`make ${match[1]}`);
    }
    return targets;
  } catch {
    return [];
  }
}

function readEntries(cwd: string): { directories: string[]; files: string[] } {
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const directories: string[] = [];
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) directories.push(entry.name);
      else files.push(entry.name);
      if (directories.length + files.length > 500) break;
    }
    return { directories, files };
  } catch {
    return { directories: [], files: [] };
  }
}

function buildContext(cwd: string): CompletionContext {
  const { directories, files } = readEntries(cwd);
  return {
    cwd,
    scripts: readScripts(cwd),
    makeTargets: readMakeTargets(cwd),
    directories,
    files
  };
}

export function registerCompletionHandlers(): void {
  ipcMain.handle(COMPLETION_CHANNELS.context, (_event, cwd: unknown): CompletionContext => {
    if (typeof cwd !== 'string' || cwd.trim() === '') return EMPTY_COMPLETION_CONTEXT;

    let resolved: string;
    try {
      resolved = path.resolve(cwd);
      if (!fs.statSync(resolved).isDirectory()) return EMPTY_COMPLETION_CONTEXT;
    } catch {
      return EMPTY_COMPLETION_CONTEXT;
    }

    const signature = `${safeMtime(resolved)}:${safeMtime(path.join(resolved, 'package.json'))}`;
    const cached = cache.get(resolved);
    if (cached && cached.signature === signature) return cached.value;

    const value = buildContext(resolved);
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(resolved, { signature, value });
    return value;
  });
}
