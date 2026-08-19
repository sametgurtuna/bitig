import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { BitigSettings, BitigSettingsPatch } from '../../shared/settingsTypes';

const DEFAULT_SETTINGS: BitigSettings = {
  schemaVersion: 1,
  activeTheme: 'bitig-dark',
  appearance: {
    opacity: 1,
    backgroundImage: null,
    backgroundImageOpacity: 0.25,
    backgroundImageFit: 'cover'
  }
};

const MIN_OPACITY = 0.3;
const MAX_OPACITY = 1;

/**
 * `%APPDATA%/Bitig/settings.json` dosyasini yonetir: yukler, kismi
 * guncellemeleri derinlemesine (deep) birlestirip diske yazar, elle
 * yapilan disaridan (dosyayi dogrudan duzenleme) degisiklikleri izler.
 * Bozuk/gecersiz dosya durumunda sessizce cokmek yerine varsayilanlara
 * doner ve gorunur bir uyari basar (bkz. ROADMAP.md milestone 4 kabul
 * kriterleri).
 */
export class SettingsStore {
  private readonly filePath = path.join(app.getPath('userData'), 'settings.json');
  private settings: BitigSettings = DEFAULT_SETTINGS;
  private readonly listeners = new Set<(settings: BitigSettings) => void>();
  // persist()'in son yazdigi tam JSON metni. fs.watch, kendi yazdigimiz
  // dosyayi da tetikler; bunu disaridan (elle) bir degisiklikten ayirt
  // etmek icin zamanlamaya guvenmek yerine icerigi karsilastiriyoruz.
  private lastWrittenJson = '';
  private watchDebounceTimer: NodeJS.Timeout | null = null;

  load(): void {
    this.settings = this.readFromDisk();
    this.persist(); // eksik alanlari tamamlanmis haliyle diske yaz

    fs.watch(this.filePath, { persistent: false }, () => {
      // Bazi editorler/araclar dosyayi tek seferde degil ardisik birden
      // fazla islemle (ör. once bosalt, sonra yaz) kaydeder; her adim ayri
      // bir fs.watch olayi dogurabilir. Araya kisa bir debounce koyup son
      // olaydan sonraki durumu okuyarak "yarim yazilmis dosyayi parse edip
      // gecici olarak varsayilanlara donme" riskini buyuk olcude azaltiyoruz.
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
      // Dosya var ama gecerli JSON degil - varsayilanlara don, ama bunu
      // sessizce yapma.
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
      appearance: { ...base.appearance, ...patch.appearance }
    };
    merged.appearance.opacity = Math.min(
      MAX_OPACITY,
      Math.max(MIN_OPACITY, merged.appearance.opacity)
    );
    merged.appearance.backgroundImageOpacity = Math.min(
      1,
      Math.max(0, merged.appearance.backgroundImageOpacity)
    );
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
