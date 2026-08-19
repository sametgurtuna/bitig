// Main, preload ve renderer arasinda paylasilan IPC sozlesmesi.
// Kanal isimlendirme kurali: "<alan>:<eylem>" (bkz. CLAUDE.md).

export const PTY_CHANNELS = {
  create: 'pty:create',
  write: 'pty:write',
  resize: 'pty:resize',
  dispose: 'pty:dispose',
  data: 'pty:data',
  exit: 'pty:exit'
} as const;

export interface PtyCreateOptions {
  cols: number;
  rows: number;
}

export interface PtyCreateResult {
  id: string;
}

export interface PtyWritePayload {
  id: string;
  data: string;
}

export interface PtyResizePayload {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyDisposePayload {
  id: string;
}

export interface PtyDataEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number;
}
