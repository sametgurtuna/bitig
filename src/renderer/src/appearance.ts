import { BUILTIN_THEMES, bitigDark } from '../../shared/builtinThemes';
import type { BitigTheme } from '../../shared/themeTypes';
import type { BackgroundImageFit, BitigSettings } from '../../shared/settingsTypes';
import type { TabStore } from './tabs';

// Buyuk arkaplan gorsellerini bir kere kucultup tekrar tekrar decode
// edilmesini onlemek icin bir ust sinir (bkz. ROADMAP.md milestone 5).
const MAX_BACKGROUND_IMAGE_DIMENSION = 1920;

// Ayarlar paneli arkaplaninin inebilecegi en dusuk alfa: panel bir
// arkaplan gorseli uzerindeyken bile form kontrolleri okunakli kalmali.
const MIN_PANEL_SCRIM_ALPHA = 0.92;

/**
 * Tema + gorunum (opaklik, arkaplan gorseli) ayarlarini tek bir yerden
 * uygular: ilk yuklemede, settings:changed/theme:list-changed olaylarinda
 * ve Alt+Shift+T tema-dongusu kisayolunda. Ayarlar paneli (milestone 6)
 * gelene kadar tek "yazma" yolu settings.json'u elle duzenlemek ya da bu
 * kisayoldur - ikisi de ayni settings:changed geri bildirimiyle sonuclanir.
 */
export class AppearanceController {
  private themes: BitigTheme[] = BUILTIN_THEMES;
  private settings: BitigSettings | null = null;
  private tabStore: TabStore | null = null;
  private readonly bgImageEl = document.getElementById('bg-image') as HTMLDivElement | null;
  // Data URL'i sadece dosya yolu gercekten degistiginde yeniden okuyup
  // kucultuyoruz; sadece opaklik/fit degisen bir settings:changed'de
  // gereksiz bir IPC + decode turuna girmemek icin.
  private lastBackgroundImagePath: string | null = null;
  // Ayarlar paneli (SettingsPanel) gibi tuketicilerin state degisince
  // yeniden cizim yapabilmesi icin; AppearanceController zaten theme/
  // settings IPC'lerine abone oldugu icin bu abonelikleri tekrarlamak
  // yerine buradan yayiyoruz.
  private readonly changeListeners = new Set<() => void>();

  async init(tabStore: TabStore): Promise<void> {
    this.tabStore = tabStore;

    const [themes, settings] = await Promise.all([
      window.bitig.theme.list(),
      window.bitig.settings.get()
    ]);
    this.themes = themes;
    this.settings = settings;
    await this.applyAll();

    window.bitig.theme.onListChanged(() => {
      void this.refreshThemeList();
    });
    window.bitig.settings.onChanged((updated) => {
      this.settings = updated;
      void this.applyAll();
    });
  }

  /** Alt+Shift+T: mevcut tema listesindeki bir sonraki temaya gecer. */
  cycleTheme(): void {
    if (!this.settings || this.themes.length === 0) return;
    const currentIndex = this.themes.findIndex((theme) => theme.id === this.settings?.activeTheme);
    const nextTheme = this.themes[(currentIndex + 1 + this.themes.length) % this.themes.length];
    window.bitig.settings.set({ activeTheme: nextTheme.id });
  }

  /** Ayarlar paneli icin: mevcut tema listesi ve ayarlar (henuz yuklenmediyse null). */
  getState(): { themes: BitigTheme[]; settings: BitigSettings } | null {
    if (!this.settings) return null;
    return { themes: this.themes, settings: this.settings };
  }

  onChange(listener: () => void): void {
    this.changeListeners.add(listener);
  }

  /**
   * Slider gibi surekli degisen kontroller icin: settings:set IPC'sini
   * beklemeden aninda gorsel geri bildirim verir. Kalici hale getirmek
   * (diske yazmak) hala ayri bir window.bitig.settings.set cagrisi
   * gerektirir - bu sadece onizleme.
   */
  previewOpacity(opacity: number): void {
    this.applyTerminalAndUiTheme(this.resolveActiveTheme(), opacity);
  }

  previewBackgroundImageStyle(opacity: number, fit: BackgroundImageFit): void {
    this.applyBackgroundImageStyle(opacity, fit);
  }

  private async refreshThemeList(): Promise<void> {
    this.themes = await window.bitig.theme.list();
    await this.applyAll();
  }

  private resolveActiveTheme(): BitigTheme {
    const activeId = this.settings?.activeTheme;
    return this.themes.find((theme) => theme.id === activeId) ?? bitigDark;
  }

  private async applyAll(): Promise<void> {
    if (!this.settings) return;
    this.tabStore?.setSettings(this.settings);
    const theme = this.resolveActiveTheme();
    this.applyTerminalAndUiTheme(theme, this.settings.appearance.opacity);
    this.tabStore?.applyTerminalFont({
      fontFamily: buildFontStack(this.settings.terminal.fontFamily),
      fontSize: this.settings.terminal.fontSize
    });
    await this.applyBackgroundImage(this.settings);
    for (const listener of this.changeListeners) listener();
  }

  private applyTerminalAndUiTheme(theme: BitigTheme, opacity: number): void {
    // Terminal arkaplanini xterm'e degil #terminal-shell'e (CSS) birakiyoruz:
    // xterm'in kendi arkaplani opak cizilir ve terminal alani pencerenin
    // neredeyse tamamini kapladigi icin hem seffafligi hem de arkaplan
    // gorselini orterdi. Renk bilgisi kaybolmuyor - ayni renk asagida
    // --bitig-terminal-bg olarak CSS'e veriliyor, sadece tek bir katmanda
    // boyaniyor (ust uste binen iki alfa katmani olusmasin diye).
    this.tabStore?.applyTerminalTheme({ ...theme.terminal, background: 'rgba(0, 0, 0, 0)' });

    const root = document.documentElement.style;
    root.setProperty('--bitig-bg', withAlpha(theme.ui.background, opacity));
    root.setProperty('--bitig-terminal-bg', withAlpha(theme.terminal.background, opacity));
    // Ayarlar panelinin arkaplani: form kontrolleri keyfi bir arkaplan
    // gorseli uzerinde okunakli kalsin diye opakligi takip eder ama bir
    // tabanin altina inmez.
    root.setProperty(
      '--bitig-panel-scrim',
      withAlpha(theme.terminal.background, Math.max(opacity, MIN_PANEL_SCRIM_ALPHA))
    );
    root.setProperty('--bitig-titlebar-bg', withAlpha(theme.ui.titlebarBackground, opacity));
    root.setProperty('--bitig-text-dim', theme.ui.titlebarText);
    root.setProperty('--bitig-border', theme.ui.border);
    root.setProperty('--bitig-accent', theme.ui.accent);
  }

  private async applyBackgroundImage(settings: BitigSettings): Promise<void> {
    if (!this.bgImageEl) return;
    const { backgroundImage, backgroundImageOpacity, backgroundImageFit } = settings.appearance;

    if (!backgroundImage) {
      this.bgImageEl.style.backgroundImage = 'none';
      this.lastBackgroundImagePath = null;
      return;
    }

    if (backgroundImage !== this.lastBackgroundImagePath) {
      const dataUrl = await window.bitig.settings.readBackgroundImage();
      if (!dataUrl) {
        this.bgImageEl.style.backgroundImage = 'none';
        this.lastBackgroundImagePath = null;
        return;
      }
      const downscaled = await downscaleImage(dataUrl, MAX_BACKGROUND_IMAGE_DIMENSION);
      this.bgImageEl.style.backgroundImage = `url("${downscaled}")`;
      this.lastBackgroundImagePath = backgroundImage;
    }

    this.applyBackgroundImageStyle(backgroundImageOpacity, backgroundImageFit);
  }

  private applyBackgroundImageStyle(opacity: number, fit: BackgroundImageFit): void {
    if (!this.bgImageEl) return;
    this.bgImageEl.style.opacity = String(opacity);

    if (fit === 'tile') {
      this.bgImageEl.style.backgroundSize = 'auto';
      this.bgImageEl.style.backgroundRepeat = 'repeat';
      this.bgImageEl.style.backgroundPosition = 'top left';
      return;
    }

    this.bgImageEl.style.backgroundRepeat = 'no-repeat';
    this.bgImageEl.style.backgroundPosition = 'center';
    this.bgImageEl.style.backgroundSize = fit === 'center' ? 'auto' : fit;
  }
}

/**
 * Secilen font ailesinin sonuna yedek zinciri ekler: kullanicinin sectigi
 * font sonradan kaldirilirsa ya da adi eslesmezse terminal okunamaz bir
 * proportional fonta dusmesin.
 */
export function buildFontStack(family: string): string {
  return `"${family.replace(/"/g, '\\"')}", 'Cascadia Mono', Consolas, monospace`;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Gorsel maxDimension'dan buyukse bir kez kucultur; kucukse oldugu gibi doner. */
function downscaleImage(dataUrl: string, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      if (scale === 1) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Arkaplan gorseli yuklenemedi'));
    img.src = dataUrl;
  });
}
