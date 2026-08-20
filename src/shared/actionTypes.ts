// Central action definitions and shared contract for keyboard shortcuts.

export type ActionId =
  | 'tab.new'
  | 'window.new'
  | 'tab.close'
  | 'tab.next'
  | 'tab.previous'
  | 'pane.splitRight'
  | 'pane.splitDown'
  | 'pane.close'
  | 'pane.zoom'
  | 'pane.navigateLeft'
  | 'pane.navigateRight'
  | 'pane.navigateUp'
  | 'pane.navigateDown'
  | 'terminal.search'
  | 'history.search'
  | 'theme.cycle'
  | 'settings.toggle'
  | 'palette.toggle'
  | 'betik.toggle'
  | 'profile.open1'
  | 'profile.open2'
  | 'profile.open3'
  | 'profile.open4'
  | 'profile.open5'
  | 'profile.open6'
  | 'profile.open7'
  | 'profile.open8'
  | 'profile.open9'
  | 'broadcast.toggle'
  | 'ai.prompt';

export type ActionCategory = 'Tabs' | 'Panes' | 'View & Search' | 'Application';

export interface ActionDefinition {
  id: ActionId;
  name: string;
  category: ActionCategory;
  defaultKeys: string;
  description: string;
}

export const ACTION_DEFINITIONS: ActionDefinition[] = [
  // Tabs
  {
    id: 'tab.new',
    name: 'New Tab',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+T',
    description: 'Opens a new tab with the default profile'
  },
  {
    id: 'window.new',
    name: 'New Window',
    category: 'Application',
    defaultKeys: 'Ctrl+Shift+N',
    description: 'Opens a second, fully independent Bitig window'
  },
  {
    id: 'tab.close',
    name: 'Close Tab',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+W',
    description: 'Closes the active tab and all panes within it'
  },
  {
    id: 'tab.next',
    name: 'Next Tab',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Tab',
    description: 'Switches to the next tab'
  },
  {
    id: 'tab.previous',
    name: 'Previous Tab',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+Tab',
    description: 'Switches to the previous tab'
  },
  {
    id: 'profile.open1',
    name: 'Open Profile 1',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+1',
    description: 'Opens a new tab with the 1st shell profile'
  },
  {
    id: 'profile.open2',
    name: 'Open Profile 2',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+2',
    description: 'Opens a new tab with the 2nd shell profile'
  },
  {
    id: 'profile.open3',
    name: 'Open Profile 3',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+3',
    description: 'Opens a new tab with the 3rd shell profile'
  },
  {
    id: 'profile.open4',
    name: 'Open Profile 4',
    category: 'Tabs',
    defaultKeys: 'Ctrl+Shift+4',
    description: 'Opens a new tab with the 4th shell profile'
  },

  // Panes
  {
    id: 'pane.splitRight',
    name: 'Split Right',
    category: 'Panes',
    defaultKeys: 'Alt+Shift+D',
    description: 'Splits the active pane in two with a vertical divider'
  },
  {
    id: 'pane.splitDown',
    name: 'Split Down',
    category: 'Panes',
    defaultKeys: 'Alt+Shift+E',
    description: 'Splits the active pane in two with a horizontal divider'
  },
  {
    id: 'pane.close',
    name: 'Close Pane',
    category: 'Panes',
    defaultKeys: 'Ctrl+Shift+X',
    description: 'Closes the currently focused pane'
  },
  {
    id: 'pane.zoom',
    name: 'Zoom Pane',
    category: 'Panes',
    defaultKeys: 'Ctrl+Shift+Z',
    description: 'Expands the focused pane to full size, or restores the split layout'
  },
  {
    id: 'pane.navigateLeft',
    name: 'Focus Left',
    category: 'Panes',
    defaultKeys: 'Alt+ArrowLeft',
    description: 'Focuses the neighboring pane to the left'
  },
  {
    id: 'pane.navigateRight',
    name: 'Focus Right',
    category: 'Panes',
    defaultKeys: 'Alt+ArrowRight',
    description: 'Focuses the neighboring pane to the right'
  },
  {
    id: 'pane.navigateUp',
    name: 'Focus Up',
    category: 'Panes',
    defaultKeys: 'Alt+ArrowUp',
    description: 'Focuses the neighboring pane above'
  },
  {
    id: 'pane.navigateDown',
    name: 'Focus Down',
    category: 'Panes',
    defaultKeys: 'Alt+ArrowDown',
    description: 'Focuses the neighboring pane below'
  },

  // View & Search
  {
    id: 'terminal.search',
    name: 'Search Terminal',
    category: 'View & Search',
    defaultKeys: 'Ctrl+F',
    description: 'Opens or closes the in-terminal search bar'
  },
  {
    id: 'history.search',
    name: 'Search Command History',
    category: 'View & Search',
    defaultKeys: 'Ctrl+R',
    description: 'Fuzzy-searches command history across sessions'
  },
  {
    id: 'theme.cycle',
    name: 'Cycle Theme',
    category: 'View & Search',
    defaultKeys: 'Alt+Shift+T',
    description: 'Cycles through the installed themes in order'
  },

  // Application
  {
    id: 'palette.toggle',
    name: 'Open Command Palette',
    category: 'Application',
    defaultKeys: 'Ctrl+Shift+P',
    description: 'Opens the universal action, theme, and profile command palette'
  },
  {
    id: 'betik.toggle',
    name: 'Bitig Betik (Runbook Manager)',
    category: 'Application',
    defaultKeys: 'Ctrl+Shift+B',
    description: 'Opens the parametric command template and runbook manager'
  },
  {
    id: 'settings.toggle',
    name: 'Toggle Settings',
    category: 'Application',
    defaultKeys: 'Ctrl+,',
    description: 'Shows or hides the settings panel'
  },
  {
    id: 'broadcast.toggle',
    name: 'Toggle Broadcast Mode',
    category: 'Panes',
    defaultKeys: 'Alt+Shift+I',
    description: 'Sends input to every pane in the active tab at once (Broadcast Input)'
  },
  {
    id: 'ai.prompt',
    name: 'Bitig Bilge (AI Assistant)',
    category: 'Application',
    defaultKeys: 'Ctrl+I',
    description: 'Opens the natural-language command generation and error-explanation assistant'
  }
];

export const DEFAULT_KEYBINDINGS: Record<string, string> = ACTION_DEFINITIONS.reduce(
  (acc, def) => {
    acc[def.id] = def.defaultKeys;
    return acc;
  },
  {} as Record<string, string>
);

export interface KeyComboInput {
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  key: string;
}

/**
 * KeyboardEvent veya tus girdi nesnesini kanonik "Ctrl+Shift+Key" formatinda bir metne donusturur.
 * Eger yalnizca modifier tusa basildiysa null doner.
 */
export function normalizeKeyCombo(event: KeyComboInput): string | null {
  const parts: string[] = [];

  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');

  let key = event.key;

  // Sadece degistirici tus basildiysa henuz tam kombinasyon degildir
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return null;
  }

  // Ozel tuslar icin kanonik isim duzeltmeleri
  if (key === ' ') key = 'Space';
  else if (key === ',') key = ',';
  else if (key === '.') key = '.';
  else if (key === '/') key = '/';
  else if (key === '\\') key = '\\';
  else if (key.length === 1) {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join('+');
}
