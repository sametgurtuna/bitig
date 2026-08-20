import type { ShellProfile } from './profileTypes';
import type { CockpitSettings } from './cockpitTypes';
import type { QuakeSettings } from './quakeTypes';
import type { AiSettings } from './aiTypes';

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
  /** Metin secildiginde otomatik panoya kopyala (PuTTY/Windows Terminal stili). */
  copyOnSelect?: boolean;
  /** Sag tiklandiginda dogrudan yapistir (false ise baglam menusu acilir). */
  pasteOnRightClick?: boolean;
  /** Calisan aktif surecler varken kapatmada onay uyarisi goster. */
  confirmBeforeClose?: boolean;
  /** Acilista onceki sekme ve panel duzenini geri yukle. */
  restoreSession?: boolean;
  /** Alt durum cubugunu (Status Bar) goster/gizle. */
  showStatusBar?: boolean;
  /** Geriye dogru kaydirma satiri siniri (default: 10000). */
  scrollback?: number;
}

export interface TelemetrySettings {
  enableNotifications: boolean;
  notificationThresholdMs: number;
}

export interface BitigSettings {
  schemaVersion: 1;
  /** Aktif BitigTheme'in id'si (bkz. themeTypes.ts). */
  activeTheme: string;
  appearance: AppearanceSettings;
  terminal: TerminalSettings;
  profiles: ShellProfile[];
  defaultProfileId: string;
  keybindings: Record<string, string>;
  telemetry: TelemetrySettings;
  cockpit: CockpitSettings;
  quake: QuakeSettings;
  ai: AiSettings;
}

/** settings:set ile gonderilen kismi guncelleme; SettingsStore mevcut
 *  ayarlarin uzerine derinlemesine (deep) birlestirir. */
export type BitigSettingsPatch = Partial<Omit<BitigSettings, 'appearance' | 'terminal' | 'profiles' | 'keybindings' | 'telemetry' | 'cockpit' | 'quake' | 'ai'>> & {
  appearance?: Partial<AppearanceSettings>;
  terminal?: Partial<TerminalSettings>;
  profiles?: ShellProfile[];
  keybindings?: Record<string, string>;
  telemetry?: Partial<TelemetrySettings>;
  cockpit?: Partial<CockpitSettings>;
  quake?: Partial<QuakeSettings>;
  ai?: Partial<AiSettings>;
};

