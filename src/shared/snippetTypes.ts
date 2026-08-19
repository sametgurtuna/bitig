export const SNIPPET_CHANNELS = {
  list: 'snippets:list',
  save: 'snippets:save',
  delete: 'snippets:delete',
  reset: 'snippets:reset'
} as const;

export interface SnippetVariable {
  name: string;
  label?: string;
  defaultValue?: string;
  description?: string;
}

export interface BitigSnippet {
  id: string;
  name: string;
  description: string;
  template: string;
  category: 'Docker' | 'Git' | 'Medya' | 'Sistem' | 'Web & Ag' | 'Kubernetes' | 'Genel';
  variables?: SnippetVariable[];
  tags?: string[];
}

export const DEFAULT_SNIPPETS: BitigSnippet[] = [
  {
    id: 'docker-run-port-vol',
    name: 'Docker Run (Port & Volume)',
    description: 'Arka planda port ve dizin eslemesiyle yeni bir Docker konteyneri baslatir',
    category: 'Docker',
    template: 'docker run -d -p {{host_port}}:{{container_port}} -v {{host_dir}}:{{container_dir}} --name {{container_name}} {{image_name}}',
    variables: [
      { name: 'host_port', label: 'Ana Makine Portu', defaultValue: '8080' },
      { name: 'container_port', label: 'Konteyner Portu', defaultValue: '80' },
      { name: 'host_dir', label: 'Ana Dizin Yolu', defaultValue: '${PWD}' },
      { name: 'container_dir', label: 'Konteyner Dizin Yolu', defaultValue: '/app' },
      { name: 'container_name', label: 'Konteyner Adi', defaultValue: 'my-app' },
      { name: 'image_name', label: 'Docker Image', defaultValue: 'nginx:alpine' }
    ],
    tags: ['docker', 'container', 'port', 'volume']
  },
  {
    id: 'docker-compose-up-build',
    name: 'Docker Compose Up (Build & Detached)',
    description: 'Servisleri yeniden derleyip arka planda ayaga kaldirir',
    category: 'Docker',
    template: 'docker compose up -d --build',
    variables: [],
    tags: ['docker', 'compose', 'build']
  },
  {
    id: 'git-rebase-interactive',
    name: 'Git Rebase (Interaktif)',
    description: 'Son N commiti duzenlemek, birlestirmek (squash) icin rebase acar',
    category: 'Git',
    template: 'git rebase -i HEAD~{{commit_count}}',
    variables: [
      { name: 'commit_count', label: 'Commit Sayisi', defaultValue: '5' }
    ],
    tags: ['git', 'rebase', 'squash', 'history']
  },
  {
    id: 'git-commit-message',
    name: 'Git Commit',
    description: 'Degisiklikleri aciklamali bir mesajla commit eder',
    category: 'Git',
    template: 'git commit -m "{{message}}"',
    variables: [
      { name: 'message', label: 'Commit Mesaji', defaultValue: 'feat: add new capability' }
    ],
    tags: ['git', 'commit']
  },
  {
    id: 'git-reset-hard-origin',
    name: 'Git Hard Reset to Origin',
    description: 'Mevcut branchi uzaktaki origin versiyonuna zorla esitler (lokal degisiklikler silinir)',
    category: 'Git',
    template: 'git fetch origin && git reset --hard origin/{{branch_name}}',
    variables: [
      { name: 'branch_name', label: 'Branch Adi', defaultValue: 'main' }
    ],
    tags: ['git', 'reset', 'origin']
  },
  {
    id: 'ffmpeg-convert-mp4',
    name: 'FFmpeg MP4 Donusturucu (H.264)',
    description: 'Videoyu yuksek uyumluluklu H.264 MP4 formatina donusturur',
    category: 'Medya',
    template: 'ffmpeg -i "{{input_file}}" -c:v libx264 -crf {{crf_quality}} -preset fast -c:a aac -b:a 192k "{{output_file}}"',
    variables: [
      { name: 'input_file', label: 'Giris Dosyasi', defaultValue: 'input.mov' },
      { name: 'crf_quality', label: 'Kalite (CRF 18-28)', defaultValue: '23' },
      { name: 'output_file', label: 'Cikis Dosyasi', defaultValue: 'output.mp4' }
    ],
    tags: ['ffmpeg', 'video', 'mp4', 'convert']
  },
  {
    id: 'kill-port-process-win',
    name: 'Port Dinleyen Prosesi Sonlandir (PowerShell)',
    description: 'Belirtilen portu isgal eden prosesi tespit edip zorla kapatir',
    category: 'Sistem',
    template: 'Stop-Process -Id (Get-NetTCPConnection -LocalPort {{port}}).OwningProcess -Force',
    variables: [
      { name: 'port', label: 'Port Numarasi', defaultValue: '3000' }
    ],
    tags: ['powershell', 'kill', 'port', 'process']
  },
  {
    id: 'find-large-files-win',
    name: 'Buyuk Dosyalari Bul (>100MB)',
    description: 'Dizindeki 100MB uzeri en buyuk 10 dosyayi boyut sirasina gore listeler',
    category: 'Sistem',
    template: 'Get-ChildItem -Path "{{search_path}}" -Recurse -File -ErrorAction SilentlyContinue | Where-Object Length -gt 100MB | Sort-Object Length -Descending | Select-Object -First 10 FullName, @{N="Size(MB)";E={[math]::round($_.Length/1MB,2)}}',
    variables: [
      { name: 'search_path', label: 'Arama Dizini', defaultValue: '.' }
    ],
    tags: ['powershell', 'disk', 'large', 'files']
  },
  {
    id: 'npx-serve-port',
    name: 'Dizini Web Sunucusu Olarak Baslat',
    description: 'Mevcut dizini yerel bir HTTP sunucusu olarak belirtilen portta yayinlar',
    category: 'Web & Ag',
    template: 'npx -y serve -l {{port}} "{{directory}}"',
    variables: [
      { name: 'port', label: 'Yayin Portu', defaultValue: '5000' },
      { name: 'directory', label: 'Dizin', defaultValue: '.' }
    ],
    tags: ['npx', 'serve', 'http', 'web']
  },
  {
    id: 'kubectl-pod-logs-tail',
    name: 'Kubectl Pod Loglarini Dinle (Tail)',
    description: 'Belirtilen namespace altindaki podun son loglarini canli olarak takip eder',
    category: 'Kubernetes',
    template: 'kubectl logs -f {{pod_name}} -n {{namespace}} --tail={{line_count}}',
    variables: [
      { name: 'pod_name', label: 'Pod Adi', defaultValue: 'my-service-pod' },
      { name: 'namespace', label: 'Namespace', defaultValue: 'default' },
      { name: 'line_count', label: 'Satir Sayisi', defaultValue: '100' }
    ],
    tags: ['kubectl', 'k8s', 'logs', 'tail']
  }
];
