import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ShellProfile } from '../../shared/profileTypes';

const execAsync = promisify(exec);

/**
 * Windows sisteminde kurulu kabuklari (PowerShell 7, Windows PowerShell,
 * Command Prompt, Git Bash, WSL dagitimlari) otomatik olarak tespit eder.
 */
export async function discoverProfiles(): Promise<ShellProfile[]> {
  const profiles: ShellProfile[] = [];

  // 1. PowerShell 7 (pwsh)
  const pwshPath = findExecutableInPaths([
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Microsoft', 'PowerShell', '7', 'pwsh.exe') : '',
    process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'PowerShell', '7', 'pwsh.exe') : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'PowerShell', '7', 'pwsh.exe') : ''
  ]);
  if (pwshPath || isExecutableOnPath('pwsh.exe')) {
    profiles.push({
      id: 'pwsh',
      name: 'PowerShell 7',
      command: pwshPath || 'pwsh.exe',
      args: [],
      icon: 'powershell',
      color: '#7dd3fc'
    });
  }

  // 2. Windows PowerShell (her Windows'ta bulunur)
  const winPsPath = path.join(
    process.env['SystemRoot'] || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
  profiles.push({
    id: 'powershell',
    name: 'Windows PowerShell',
    command: fs.existsSync(winPsPath) ? winPsPath : 'powershell.exe',
    args: [],
    icon: 'powershell',
    color: '#38bdf8'
  });

  // 3. Command Prompt
  const cmdPath = path.join(process.env['SystemRoot'] || 'C:\\Windows', 'System32', 'cmd.exe');
  profiles.push({
    id: 'cmd',
    name: 'Command Prompt',
    command: fs.existsSync(cmdPath) ? cmdPath : 'cmd.exe',
    args: [],
    icon: 'cmd',
    color: '#cbd5e1'
  });

  // 4. Git Bash
  const gitBashPath = findExecutableInPaths([
    process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Git', 'bin', 'bash.exe') : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe') : '',
    process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Programs', 'Git', 'bin', 'bash.exe') : ''
  ]);
  if (gitBashPath) {
    profiles.push({
      id: 'git-bash',
      name: 'Git Bash',
      command: gitBashPath,
      args: ['--login', '-i'],
      icon: 'bash',
      color: '#f97316'
    });
  }

  // 5. WSL Dağıtımları
  try {
    const { stdout } = await execAsync('wsl.exe -l -q', { timeout: 3000, windowsHide: true });
    // wsl -l -q cikisi UTF-16LE null baytlar icerebilir, temizliyoruz
    const cleaned = stdout.replace(/\0/g, '').trim();
    if (cleaned) {
      const distros = cleaned.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      for (const distro of distros) {
        // docker-desktop vb. sistem yardimci dagitimlarini atla
        if (distro.startsWith('docker-desktop')) continue;
        profiles.push({
          id: `wsl-${distro.toLowerCase()}`,
          name: `WSL: ${distro}`,
          command: 'wsl.exe',
          args: ['-d', distro],
          icon: 'linux',
          color: '#fb923c'
        });
      }
    }
  } catch {
    // WSL kurulu degilse ya da sorgu basarisiz olduysa sessizce devam et
  }

  return profiles;
}

function findExecutableInPaths(paths: string[]): string | null {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function isExecutableOnPath(name: string): boolean {
  const pathEnv = process.env['PATH'] || '';
  const entries = pathEnv.split(';');
  for (const entry of entries) {
    if (entry && fs.existsSync(path.join(entry, name))) return true;
  }
  return false;
}
