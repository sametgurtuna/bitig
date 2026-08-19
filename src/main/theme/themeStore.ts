import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { BUILTIN_THEMES } from '../../shared/builtinThemes';
import type { BitigTheme } from '../../shared/themeTypes';

/**
 * Built-in temalari (kod ile gelen, dosya sistemine bagli olmayan) ve
 * kullanici temalarini (`%APPDATA%/Bitig/themes/*.json`) birlestirip
 * listeler. Kullanici tema klasoru izlenir; ekleme/silme/duzenleme
 * olduginda listener'lara haber verilir (bkz. themeHandlers.ts ->
 * theme:list-changed).
 */
export class ThemeStore {
  private readonly themesDir = path.join(app.getPath('userData'), 'themes');
  private userThemes: BitigTheme[] = [];
  private readonly listeners = new Set<() => void>();
  private watchDebounceTimer: NodeJS.Timeout | null = null;

  load(): void {
    fs.mkdirSync(this.themesDir, { recursive: true });
    this.userThemes = this.loadUserThemes();

    fs.watch(this.themesDir, { persistent: false }, () => {
      // Bir dosyanin tek bir kaydi bile ardisik birden fazla fs.watch
      // olayina yol acabilir (ör. once bosaltma, sonra yazma); kisa bir
      // debounce ile "yarim yazilmis dosyayi okuyup atlama" riskini
      // azaltiyoruz (bkz. settingsStore.ts'teki ayni desen).
      if (this.watchDebounceTimer) clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = setTimeout(() => {
        this.userThemes = this.loadUserThemes();
        this.notify();
      }, 100);
    });
  }

  list(): BitigTheme[] {
    return [...BUILTIN_THEMES, ...this.userThemes];
  }

  onListChanged(listener: () => void): void {
    this.listeners.add(listener);
  }

  private loadUserThemes(): BitigTheme[] {
    const themes: BitigTheme[] = [];
    let fileNames: string[];
    try {
      fileNames = fs.readdirSync(this.themesDir).filter((name) => name.endsWith('.json'));
    } catch {
      return themes;
    }

    for (const fileName of fileNames) {
      const filePath = path.join(this.themesDir, fileName);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        if (this.isValidTheme(parsed)) {
          themes.push(parsed);
        } else {
          console.error(`[Bitig] ${fileName} gecerli bir tema semasina uymuyor, atlaniyor.`);
        }
      } catch (error) {
        console.error(`[Bitig] ${fileName} okunamadi/parse edilemedi, atlaniyor: ${String(error)}`);
      }
    }
    return themes;
  }

  private isValidTheme(value: unknown): value is BitigTheme {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<BitigTheme>;
    return (
      candidate.schemaVersion === 1 &&
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.terminal === 'object' &&
      candidate.terminal !== null &&
      typeof candidate.terminal.background === 'string' &&
      typeof candidate.ui === 'object' &&
      candidate.ui !== null &&
      typeof candidate.ui.background === 'string'
    );
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
