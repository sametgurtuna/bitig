import type { BitigTheme } from '../themeTypes';

/** Dracula paletinin kamuya acik renk degerlerinden yeniden uretilmis bir
 *  yorumu (draculatheme.com) - asset kopyalama degil, sadece renk kodlari. */
export const dracula: BitigTheme = {
  schemaVersion: 1,
  id: 'dracula',
  name: 'Dracula',
  author: 'Bitig (inspired by the Dracula palette)',
  terminal: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  },
  ui: {
    background: '#282a36',
    titlebarBackground: '#21222c',
    titlebarText: '#6272a4',
    border: '#44475a',
    accent: '#bd93f9'
  }
};
