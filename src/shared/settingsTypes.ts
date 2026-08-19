// Ayarlar (settings.json) icin main/preload/renderer arasi paylasilan IPC
// sozlesmesi ve sema (bkz. CLAUDE.md "Ayarlar / Temalar").

export const SETTINGS_CHANNELS = {
  get: 'settings:get',
  set: 'settings:set',
  changed: 'settings:changed',
  reset: 'settings:reset',
  readBackgroundImage: 'settings:read-background-image',
  pickBackgroundImage: 'settings:pick-background-image'
} as const;

export type BackgroundImageFit = 'cover' | 'contain' | 'center' | 'tile';

export interface AppearanceSettings {
  /** 0.3-1 araliginda kelepceli: pencere hicbir zaman tamamen gorunmez/
   *  tiklanamaz hale gelmesin diye bir taban deger var. */
  opacity: number;
  /** Mutlak dosya yolu ya da arkaplan gorseli yoksa null. */
  backgroundImage: string | null;
  backgroundImageOpacity: number;
  backgroundImageFit: BackgroundImageFit;
}

export interface TerminalSettings {
  /** Tek bir font ailesi adi; uygulanirken sonuna yedek zinciri eklenir
   *  (bkz. appearance.ts buildFontStack) - boylece font kaldirilirsa
   *  terminal okunamaz hale gelmez. */
  fontFamily: string;
  /** MIN_FONT_SIZE-MAX_FONT_SIZE araliginda kelepceli (settingsStore.ts). */
  fontSize: number;
}

export interface BitigSettings {
  schemaVersion: 1;
  /** Aktif BitigTheme'in id'si (bkz. themeTypes.ts). */
  activeTheme: string;
  appearance: AppearanceSettings;
  terminal: TerminalSettings;
}

/** settings:set ile gonderilen kismi guncelleme; SettingsStore mevcut
 *  ayarlarin uzerine derinlemesine (deep) birlestirir. */
export type BitigSettingsPatch = Partial<Omit<BitigSettings, 'appearance' | 'terminal'>> & {
  appearance?: Partial<AppearanceSettings>;
  terminal?: Partial<TerminalSettings>;
};
