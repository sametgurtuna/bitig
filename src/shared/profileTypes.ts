// Kabuk profilleri icin paylasilan tipler ve varsayilanlar.

export interface ShellProfile {
  id: string;
  name: string;
  command: string;
  args: string[];
  startingDirectory?: string;
  icon?: string; // 'powershell' | 'cmd' | 'bash' | 'linux' | 'terminal'
  color?: string;
}

export const DEFAULT_PROFILES: ShellProfile[] = [
  {
    id: 'powershell',
    name: 'Windows PowerShell',
    command: 'powershell.exe',
    args: [],
    icon: 'powershell',
    color: '#7dd3fc'
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    command: 'cmd.exe',
    args: [],
    icon: 'cmd',
    color: '#d8dee9'
  }
];
