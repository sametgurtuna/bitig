import type { ITheme } from '@xterm/xterm';

/**
 * Varsayilan Bitig terminal temasi. Ileride tema sistemi (yol haritasi madde 4)
 * JSON dosyalarindan yuklenecek; bu obje o zamana kadar tek gercek kaynak.
 */
export const BITIG_TERMINAL_THEME: ITheme = {
  background: '#0f1117',
  foreground: '#d8dee9',
  cursor: '#7dd3fc',
  cursorAccent: '#0f1117',
  selectionBackground: '#2d3444',

  black: '#1a1c23',
  red: '#f47067',
  green: '#7ee787',
  yellow: '#e3b341',
  blue: '#79c0ff',
  magenta: '#d2a8ff',
  cyan: '#56d4dd',
  white: '#d0d7de',

  brightBlack: '#4b5263',
  brightRed: '#ff9492',
  brightGreen: '#a5f3b8',
  brightYellow: '#f2cc60',
  brightBlue: '#a5d6ff',
  brightMagenta: '#e2c5ff',
  brightCyan: '#8ce4ec',
  brightWhite: '#ffffff'
};
