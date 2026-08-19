import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { BitigSettings, BitigSettingsPatch } from '../../shared/settingsTypes';
import { DEFAULT_PROFILES } from '../../shared/profileTypes';
import { DEFAULT_KEYBINDINGS } from '../../shared/actionTypes';
import { DEFAULT_COCKPIT_SETTINGS } from '../../shared/cockpitTypes';
import { DEFAULT_QUAKE_SETTINGS } from '../../shared/quakeTypes';
import { discoverProfiles } from '../pty/profileDiscovery';

const DEFAULT_SETTINGS: BitigSettings = {
  schemaVersion: 1,
  activeTheme: 'bitig-dark',
  appearance: {
    opacity: 1,
    backgroundImage: null,
    backgroundImageOpacity: 0.25,
    backgroundImageFit: 'cover'
  },
  terminal: {
    fontFamily: 'Cascadia Code',
    fontSize: 14
  },
  profiles: DEFAULT_PROFILES,
  defaultProfileId: 'powershell',
  keybindings: DEFAULT_KEYBINDINGS,
  telemetry: {
    enableNotifications: true,
    notificationThresholdMs: 5000
  },
  cockpit: DEFAULT_COCKPIT_SETTINGS,
  quake: DEFAULT_QUAKE_SETTINGS
};

const MIN_OPACITY = 0.3;
const MAX_OPACITY = 1;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;

export class SettingsStore {
  private readonly filePath = path.join(app.getPath('userData'), 'settings.json');
  private settings: BitigSettings = DEFAULT_SETTINGS;
  private readonly listeners = new Set<(settings: BitigSettings) => void>();
  private lastWrittenJson = '';
  private watchDebounceTimer: NodeJS.Timeout | null = null;

  async load(): Promise<void> {
    this.settings = this.readFromDisk();

    // Eger ilk acilissa veya profiller tanimli degilse sistemdeki kabuklari kesfet
    if (!this.settings.profiles || this.settings.profiles.length === 0) {
      try {
        const discovered = await discoverProfiles();
        if (discovered.length > 0) {
          this.settings.profiles = discovered;
          this.settings.defaultProfileId = discovered[0].id;
        }
      } catch (err) {
        console.error('[Bitig] Profil kesfi sirasinda hata:', err);
      }
    }

    this.persist(); // eksik alanlari tamamlanmis haliyle diske yaz

    fs.watch(this.filePath, { persistent: false }, () => {
      if (this.watchDebounceTimer) clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = setTimeout(() => this.handleExternalChange(), 100);
    });
  }

  private handleExternalChange(): void {
    let currentRaw: string;
    try {
      currentRaw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      return; // dosya o an erisilemez durumda; bir sonraki olayi bekle
    }
    if (currentRaw === this.lastWrittenJson) return; // kendi yazdigimiz degisiklik

    this.settings = this.parseOrFallback(currentRaw);
    this.notify();
  }

  get(): BitigSettings {
    return this.settings;
  }

  /** Ayarlar panelindeki "Varsayilanlara don" butonu icin. */
  reset(): BitigSettings {
    this.settings = {
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance },
      terminal: { ...DEFAULT_SETTINGS.terminal },
      profiles: [...DEFAULT_SETTINGS.profiles],
      keybindings: { ...DEFAULT_SETTINGS.keybindings },
      telemetry: { ...DEFAULT_SETTINGS.telemetry },
      cockpit: { ...DEFAULT_SETTINGS.cockpit },
      quake: { ...DEFAULT_SETTINGS.quake }
    };
    this.persist();
    this.notify();
    return this.settings;
  }

  update(patch: BitigSettingsPatch): BitigSettings {
    this.settings = this.mergeAndClamp(this.settings, patch);
    this.persist();
    this.notify();
    return this.settings;
  }

  onChange(listener: (settings: BitigSettings) => void): void {
    this.listeners.add(listener);
  }

  private readFromDisk(): BitigSettings {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return this.parseOrFallback(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error(
          `[Bitig] settings.json okunamadi, varsayilan ayarlara donuluyor: ${String(error)}`
        );
      }
      return DEFAULT_SETTINGS;
    }
  }

  private parseOrFallback(raw: string): BitigSettings {
    try {
      const parsed = JSON.parse(raw) as BitigSettingsPatch;
      return this.mergeAndClamp(DEFAULT_SETTINGS, parsed);
    } catch (error) {
      console.error(
        `[Bitig] settings.json gecersiz JSON iceriyor, varsayilan ayarlara donuluyor: ${String(error)}`
      );
      return DEFAULT_SETTINGS;
    }
  }

  private mergeAndClamp(base: BitigSettings, patch: BitigSettingsPatch): BitigSettings {
    const merged: BitigSettings = {
      schemaVersion: 1,
      activeTheme: patch.activeTheme ?? base.activeTheme,
      appearance: { ...base.appearance, ...patch.appearance },
      terminal: { ...base.terminal, ...patch.terminal },
      profiles: Array.isArray(patch.profiles) && patch.profiles.length > 0 ? patch.profiles : base.profiles,
      defaultProfileId: patch.defaultProfileId ?? base.defaultProfileId,
      keybindings: { ...base.keybindings, ...patch.keybindings },
      telemetry: { ...base.telemetry, ...patch.telemetry },
      cockpit: { ...base.cockpit, ...patch.cockpit },
      quake: { ...base.quake, ...patch.quake }
    };
    merged.appearance.opacity = clamp(
      merged.appearance.opacity,
      MIN_OPACITY,
      MAX_OPACITY,
      DEFAULT_SETTINGS.appearance.opacity
    );
    merged.appearance.backgroundImageOpacity = clamp(
      merged.appearance.backgroundImageOpacity,
      0,
      1,
      DEFAULT_SETTINGS.appearance.backgroundImageOpacity
    );
    merged.terminal.fontSize = clamp(
      merged.terminal.fontSize,
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
      DEFAULT_SETTINGS.terminal.fontSize
    );
    if (typeof merged.terminal.fontFamily !== 'string' || merged.terminal.fontFamily.trim() === '') {
      merged.terminal.fontFamily = DEFAULT_SETTINGS.terminal.fontFamily;
    }
    // Gecerli bir defaultProfileId kontrolu
    if (!merged.profiles.some((p) => p.id === merged.defaultProfileId)) {
      merged.defaultProfileId = merged.profiles[0]?.id || 'powershell';
    }
    return merged;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.lastWrittenJson = JSON.stringify(this.settings, null, 2);
    fs.writeFileSync(this.filePath, this.lastWrittenJson, 'utf-8');
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.settings);
  }
}

/**
 * Bozuk/elle girilmis degerleri guvenli araliga ceker. Sayi olmayan bir
 * deger (elle duzenlenmis settings.json'da string ya da null) araligin
 * ucuna degil varsayilana doner - yoksa ör. bozuk bir fontSize terminali
 * sessizce 8px yapardi.
 */
function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
