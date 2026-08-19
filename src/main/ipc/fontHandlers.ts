import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ipcMain } from 'electron';
import { FONT_CHANNELS } from '../../shared/fontTypes';

const execFileAsync = promisify(execFile);

// .NET'in InstalledFontCollection'i sistemde kurulu font ailelerini
// verir. Chromium'un queryLocalFonts() API'si (renderer tarafi) daha
// dogrudan bir yol gibi gorunuyor ama izin akisi gerektiriyor ve sessizce
// reddedilebiliyor; bu yol izin gerektirmiyor ve dogrudan dogrulanabildi
// (bkz. ROADMAP.md milestone 7 "Deviation").
const LIST_FONTS_SCRIPT =
  'Add-Type -AssemblyName System.Drawing; ' +
  '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ' +
  'ForEach-Object { $_.Name } | ConvertTo-Json -Compress';

/**
 * fonts:* IPC kanallari. Font listesi surec boyunca degismedigi
 * varsayilir (yeni font kurmak nadir ve zaten uygulamayi yeniden
 * baslatmak gerekir), bu yuzden ilk cagridan sonra bellekte tutulur -
 * ayarlar paneli her acilisinda ~1sn'lik bir PowerShell spawn'i
 * beklemek zorunda kalmasin.
 */
export function registerFontHandlers(): void {
  let cached: string[] | null = null;

  ipcMain.handle(FONT_CHANNELS.list, async (): Promise<string[]> => {
    if (cached) return cached;

    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', LIST_FONTS_SCRIPT],
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      );
      const parsed: unknown = JSON.parse(stdout);
      if (!Array.isArray(parsed)) throw new Error('Beklenmeyen font listesi bicimi');

      cached = parsed.filter((name): name is string => typeof name === 'string').sort();
      return cached;
    } catch (error) {
      // Font listesi alinamazsa uygulama calismaya devam etmeli; ayarlar
      // paneli bos listeyi "font bulunamadi" olarak gosterir.
      console.error(`[Bitig] Sistem fontlari listelenemedi: ${String(error)}`);
      return [];
    }
  });
}
