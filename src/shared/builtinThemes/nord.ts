import type { BitigTheme } from '../themeTypes';

/** Nord paletinin kamuya acik renk degerlerinden yeniden uretilmis bir
 *  yorumu (nordtheme.com) - asset kopyalama degil, sadece renk kodlari. */
export const nord: BitigTheme = {
  schemaVersion: 1,
  id: 'nord',
  name: 'Nord',
  author: 'Bitig (inspired by the Nord palette)',
  terminal: {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    cursorAccent: '#2e3440',
    selectionBackground: '#434c5e',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4'
  },
  ui: {
    background: '#2e3440',
    titlebarBackground: '#3b4252',
    titlebarText: '#81a1c1',
    border: '#434c5e',
    accent: '#88c0d0'
  }
};
