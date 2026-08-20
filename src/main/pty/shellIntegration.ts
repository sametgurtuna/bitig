import path from 'node:path';

/**
 * Kabuk entegrasyonu: acilan kabugun her prompt cizmesinde calisma dizinini
 * OSC 7 (`ESC ] 7 ; file:///C:/yol BEL`) olarak yaymasini saglar.
 *
 * Neden gerekli: Windows'ta PowerShell ve cmd varsayilan olarak dizin
 * degisiminde ne OSC 7 ne de OSC 0/2 (pencere basligi) yayar. Bu yuzden sekme
 * basligi ilk acilistaki degerde ("system32" gibi) takili kalir. Burada
 * enjekte edilen prompt kancasi, renderer'daki OSC 7 dinleyicisini besler
 * (bkz. src/renderer/src/panes.ts) ve sekme basligi anlik olarak guncellenir.
 *
 * Enjeksiyon her zaman *ekleyicidir*: kullanicinin kendi `prompt` fonksiyonu
 * ya da PROMPT_COMMAND'i korunur, sadece sarilir.
 */

export interface ShellIntegrationResult {
  args: string[];
  env: Record<string, string>;
}

/** PowerShell tarafinda calistirilacak prompt sarmalayicisi. */
const POWERSHELL_HOOK = `
if (-not $global:__bitigPromptWrapped) {
  $global:__bitigPromptWrapped = $true
  $global:__bitigOriginalPrompt = $function:prompt
  function global:prompt {
    $rendered = ''
    try { $rendered = & $global:__bitigOriginalPrompt } catch { $rendered = "PS $($PWD.Path)> " }
    try {
      $bitigCwd = $PWD.ProviderPath -replace '\\\\', '/'
      if ($bitigCwd) {
        Write-Host -NoNewline ([char]27 + ']7;file:///' + $bitigCwd + [char]7)
      }
    } catch { }
    return $rendered
  }
}
`.trim();

/** cmd.exe PROMPT tanimi: once OSC 7, ardindan klasik "C:\\yol>" istemi. */
const CMD_PROMPT = 'prompt $E]7;file:///$P$E\\$P$G';

/** bash icin PROMPT_COMMAND'e eklenen tek satirlik OSC 7 yayini. */
const BASH_HOOK = `printf "\\033]7;file://%s\\033\\\\" "$PWD"`;

/** PowerShell'in kendi komut moduna gecmesine yol acacak arg'lar. */
const POWERSHELL_CONFLICTING_ARGS = ['-command', '-c', '-encodedcommand', '-ec', '-file', '-f'];

function shellKind(command: string): 'powershell' | 'cmd' | 'bash' | 'unknown' {
  const base = path.basename(command).toLowerCase();
  if (base === 'powershell.exe' || base === 'pwsh.exe' || base === 'powershell' || base === 'pwsh') {
    return 'powershell';
  }
  if (base === 'cmd.exe' || base === 'cmd') return 'cmd';
  if (base === 'bash.exe' || base === 'bash' || base === 'sh.exe' || base === 'sh') return 'bash';
  return 'unknown';
}

/**
 * Verilen kabuk komutu icin arg/env'e OSC 7 kancasini enjekte eder.
 * Tanimadigi ya da zaten bir komut/script calistirmak uzere yapilandirilmis
 * kabuklara dokunmaz; bu durumda renderer'daki prompt sezgisi (cwdTracker)
 * yedek olarak devreye girer.
 */
export function applyShellIntegration(
  command: string,
  args: string[],
  env: Record<string, string>
): ShellIntegrationResult {
  const kind = shellKind(command);
  const lowerArgs = args.map((a) => a.toLowerCase());

  if (kind === 'powershell') {
    // Zaten bir komut/dosya calistiriliyorsa karismayalim.
    if (lowerArgs.some((a) => POWERSHELL_CONFLICTING_ARGS.includes(a))) {
      return { args, env };
    }
    // -EncodedCommand (UTF-16LE + base64) tirnak/kacis sorunlarini tamamen
    // ortadan kaldirir; -NoExit sayesinde kabuk etkilesimli kalir.
    const encoded = Buffer.from(POWERSHELL_HOOK, 'utf16le').toString('base64');
    return { args: [...args, '-NoExit', '-EncodedCommand', encoded], env };
  }

  if (kind === 'cmd') {
    if (lowerArgs.some((a) => a === '/c' || a === '/k')) {
      return { args, env };
    }
    return { args: [...args, '/K', CMD_PROMPT], env };
  }

  if (kind === 'bash') {
    const existing = env['PROMPT_COMMAND'];
    const nextEnv = { ...env };
    nextEnv['PROMPT_COMMAND'] = existing ? `${existing}; ${BASH_HOOK}` : BASH_HOOK;
    return { args, env: nextEnv };
  }

  return { args, env };
}
