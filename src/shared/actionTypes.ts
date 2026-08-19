// Merkezi eylem tanimlari ve klavye kisayollari icin paylasilan sozlesme.

export type ActionId =
  | 'tab.new'
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
  | 'profile.open9';

export type ActionCategory = 'Sekmeler' | 'Paneller' | 'Gorunum ve Arama' | 'Uygulama';

export interface ActionDefinition {
  id: ActionId;
  name: string;
  category: ActionCategory;
  defaultKeys: string;
  description: string;
}

export const ACTION_DEFINITIONS: ActionDefinition[] = [
  // Sekmeler
  {
    id: 'tab.new',
    name: 'Yeni Sekme',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+T',
    description: 'Varsayilan profille yeni bir sekme acar'
  },
  {
    id: 'tab.close',
    name: 'Sekmeyi Kapat',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+W',
    description: 'Aktif sekmeyi ve icindeki tum panelleri kapatir'
  },
  {
    id: 'tab.next',
    name: 'Sonraki Sekme',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Tab',
    description: 'Bir sonraki sekmeye gecer'
  },
  {
    id: 'tab.previous',
    name: 'Onceki Sekme',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+Tab',
    description: 'Bir onceki sekmeye gecer'
  },
  {
    id: 'profile.open1',
    name: '1. Profili Ac',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+1',
    description: '1. kabuk profiliyle yeni sekme acar'
  },
  {
    id: 'profile.open2',
    name: '2. Profili Ac',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+2',
    description: '2. kabuk profiliyle yeni sekme acar'
  },
  {
    id: 'profile.open3',
    name: '3. Profili Ac',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+3',
    description: '3. kabuk profiliyle yeni sekme acar'
  },
  {
    id: 'profile.open4',
    name: '4. Profili Ac',
    category: 'Sekmeler',
    defaultKeys: 'Ctrl+Shift+4',
    description: '4. kabuk profiliyle yeni sekme acar'
  },

  // Paneller
  {
    id: 'pane.splitRight',
    name: 'Saga Bol (Split Right)',
    category: 'Paneller',
    defaultKeys: 'Alt+Shift+D',
    description: 'Aktif paneli dikey cizgiyle saga dogru ikiye boler'
  },
  {
    id: 'pane.splitDown',
    name: 'Asagi Bol (Split Down)',
    category: 'Paneller',
    defaultKeys: 'Alt+Shift+E',
    description: 'Aktif paneli yatay cizgiyle asagi dogru ikiye boler'
  },
  {
    id: 'pane.close',
    name: 'Paneli Kapat',
    category: 'Paneller',
    defaultKeys: 'Ctrl+Shift+X',
    description: 'Odakli olan aktif paneli kapatir'
  },
  {
    id: 'pane.zoom',
    name: 'Paneli Buyut / Geri Yukle (Zoom)',
    category: 'Paneller',
    defaultKeys: 'Ctrl+Shift+Z',
    description: 'Odakli paneli tam ekran yapar veya split duzenine dondurur'
  },
  {
    id: 'pane.navigateLeft',
    name: 'Sola Odaklan',
    category: 'Paneller',
    defaultKeys: 'Alt+ArrowLeft',
    description: 'Soldaki komsu panele odaklanir'
  },
  {
    id: 'pane.navigateRight',
    name: 'Saga Odaklan',
    category: 'Paneller',
    defaultKeys: 'Alt+ArrowRight',
    description: 'Sagdaki komsu panele odaklanir'
  },
  {
    id: 'pane.navigateUp',
    name: 'Yukari Odaklan',
    category: 'Paneller',
    defaultKeys: 'Alt+ArrowUp',
    description: 'Yukaridaki komsu panele odaklanir'
  },
  {
    id: 'pane.navigateDown',
    name: 'Asagi Odaklan',
    category: 'Paneller',
    defaultKeys: 'Alt+ArrowDown',
    description: 'Asagidaki komsu panele odaklanir'
  },

  // Gorunum ve Arama
  {
    id: 'terminal.search',
    name: 'Terminalde Ara',
    category: 'Gorunum ve Arama',
    defaultKeys: 'Ctrl+F',
    description: 'Dahili arama cubugunu acar veya kapatir'
  },
  {
    id: 'history.search',
    name: 'Komut Gecmisinde Ara',
    category: 'Gorunum ve Arama',
    defaultKeys: 'Ctrl+R',
    description: 'Oturumlar arasi komut gecmisinde fuzzy arama yapar'
  },
  {
    id: 'theme.cycle',
    name: 'Temayi Degistir',
    category: 'Gorunum ve Arama',
    defaultKeys: 'Alt+Shift+T',
    description: 'Kurulu temalar arasinda sirasiyla gecis yapar'
  },

  // Uygulama
  {
    id: 'palette.toggle',
    name: 'Komut Paletini Ac',
    category: 'Uygulama',
    defaultKeys: 'Ctrl+Shift+P',
    description: 'Evrensel eylem, tema ve profil komut paletini acar'
  },
  {
    id: 'betik.toggle',
    name: 'Bitig Betik (Runbook Yoneticisi)',
    category: 'Uygulama',
    defaultKeys: 'Ctrl+Shift+B',
    description: 'Parametrik komut sablonlari ve betik yoneticisini acar'
  },
  {
    id: 'settings.toggle',
    name: 'Ayarlari Ac / Kapat',
    category: 'Uygulama',
    defaultKeys: 'Ctrl+,',
    description: 'Ayarlar panelini goruntuler veya gizler'
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
