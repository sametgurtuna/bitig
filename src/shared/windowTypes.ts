// Ozel title bar'daki pencere kontrol butonlari (minimize/maximize/close) icin
// IPC sozlesmesi. Ayni "<alan>:<eylem>" konvansiyonunu izler (bkz. CLAUDE.md).

export const WINDOW_CHANNELS = {
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
  isMaximized: 'window:is-maximized',
  maximizeChange: 'window:maximize-change'
} as const;

export interface WindowMaximizeChangeEvent {
  isMaximized: boolean;
}
