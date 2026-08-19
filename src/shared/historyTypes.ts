export const HISTORY_CHANNELS = {
  list: 'history:list',
  add: 'history:add',
  clear: 'history:clear'
} as const;

export interface HistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  count: number;
  cwd?: string;
  lastDurationMs?: number;
  exitCode?: number;
}
