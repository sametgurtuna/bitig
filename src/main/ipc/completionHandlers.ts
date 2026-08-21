import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ipcMain } from 'electron';
import {
  COMPLETION_CHANNELS,
  EMPTY_COMPLETION_CONTEXT,
  EMPTY_DIR_ENTRIES,
  type CompletionContext,
  type DirEntriesResult
} from '../../shared/completionTypes';

/**
 * completion:context - verilen calisma dizini icin "proje farkindaligi" uretir:
 * package.json script'leri, Makefile hedefleri ve dizin/dosya adlari.
 *
 * completion:dirEntries - verilen calisma dizini ve goreli/mutlak hedef yol icin
 * alt klasor ve dosya listesini dondurur. Cok kademeli (cd dir/subdir/) tamamlama
 * icin kullanilir.
 *
 * Sonuclar dizin mtime'i ile onbelleklenir; her tus vurusunda diske gereksiz gidilmez.
 */

interface CacheEntry {
  signature: string;
  value: CompletionContext;
}

interface DirCacheEntry {
  signature: number;
  value: DirEntriesResult;
}

const contextCache = new Map<string, CacheEntry>();
const dirCache = new Map<string, DirCacheEntry>();
const MAX_ENTRIES = 400;

function safeMtime(target: string): number {
  try {
    return fs.statSync(target).mtimeMs;
  } catch {
    return 0;
  }
}

function resolvePathSafely(cwd: string | undefined, targetPath: string): string | null {
  if (!targetPath && !cwd) return null;
  const raw = (targetPath || '').trim();

  let resolved: string;
  if (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) {
    resolved = path.join(os.homedir(), raw.slice(1));
  } else if (path.isAbsolute(raw)) {
    resolved = path.resolve(raw);
  } else {
    resolved = path.resolve(cwd && cwd.trim() ? cwd : os.homedir(), raw);
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return null;
    return resolved;
  } catch {
    return null;
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
    const cached = contextCache.get(resolved);
    if (cached && cached.signature === signature) return cached.value;

    const value = buildContext(resolved);
    if (contextCache.size >= MAX_ENTRIES) contextCache.clear();
    contextCache.set(resolved, { signature, value });
    return value;
  });

  ipcMain.handle(
    COMPLETION_CHANNELS.dirEntries,
    (_event, payload: { cwd?: string; targetPath: string }): DirEntriesResult => {
      if (!payload || typeof payload.targetPath !== 'string') return EMPTY_DIR_ENTRIES;

      const resolved = resolvePathSafely(payload.cwd, payload.targetPath);
      if (!resolved) return EMPTY_DIR_ENTRIES;

      const mtime = safeMtime(resolved);
      const cached = dirCache.get(resolved);
      if (cached && cached.signature === mtime) return cached.value;

      const { directories, files } = readEntries(resolved);
      const value: DirEntriesResult = {
        resolvedDir: resolved,
        directories,
        files
      };

      if (dirCache.size >= MAX_ENTRIES) dirCache.clear();
      dirCache.set(resolved, { signature: mtime, value });
      return value;
    }
  );
}
