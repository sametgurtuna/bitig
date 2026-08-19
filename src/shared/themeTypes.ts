// Tema sistemi icin main/preload/renderer arasi paylasilan IPC sozlesmesi
// ve tema JSON semasi (bkz. CLAUDE.md "Ayarlar / Temalar").

export const THEME_CHANNELS = {
  list: 'theme:list',
  listChanged: 'theme:list-changed'
} as const;

/** xterm.js'in ITheme'iyle birebir ayni alan adlarini kullanir; ceviri
 *  kodu gerekmeden dogrudan Terminal.options.theme'e atanabilir. */
export interface BitigTerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/** Uygulama govdesi (title bar, kenarliklar) icin tema renkleri; CSS custom
 *  property olarak enjekte edilir (bkz. appearance.ts). */
export interface BitigUiTheme {
  background: string;
  titlebarBackground: string;
  titlebarText: string;
  border: string;
  accent: string;
}

export interface BitigTheme {
  schemaVersion: 1;
  /** Stabil, degismeyen slug - settings.json > activeTheme bu id'yi tutar. */
  id: string;
  name: string;
  author: string;
  terminal: BitigTerminalTheme;
  ui: BitigUiTheme;
}
