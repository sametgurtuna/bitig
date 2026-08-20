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
  category: 'Docker' | 'Git' | 'Media' | 'System' | 'Web & Network' | 'Kubernetes' | 'General';
  variables?: SnippetVariable[];
  tags?: string[];
}

export const DEFAULT_SNIPPETS: BitigSnippet[] = [
  {
    id: 'docker-run-port-vol',
    name: 'Docker Run (Port & Volume)',
    description: 'Starts a new Docker container in the background with a port and directory mapping',
    category: 'Docker',
    template: 'docker run -d -p {{host_port}}:{{container_port}} -v {{host_dir}}:{{container_dir}} --name {{container_name}} {{image_name}}',
    variables: [
      { name: 'host_port', label: 'Host Port', defaultValue: '8080' },
      { name: 'container_port', label: 'Container Port', defaultValue: '80' },
      { name: 'host_dir', label: 'Host Directory Path', defaultValue: '${PWD}' },
      { name: 'container_dir', label: 'Container Directory Path', defaultValue: '/app' },
      { name: 'container_name', label: 'Container Name', defaultValue: 'my-app' },
      { name: 'image_name', label: 'Docker Image', defaultValue: 'nginx:alpine' }
    ],
    tags: ['docker', 'container', 'port', 'volume']
  },
  {
    id: 'docker-compose-up-build',
    name: 'Docker Compose Up (Build & Detached)',
    description: 'Rebuilds services and brings them up in the background',
    category: 'Docker',
    template: 'docker compose up -d --build',
    variables: [],
    tags: ['docker', 'compose', 'build']
  },
  {
    id: 'git-rebase-interactive',
    name: 'Git Rebase (Interactive)',
    description: 'Opens an interactive rebase to edit or squash the last N commits',
    category: 'Git',
    template: 'git rebase -i HEAD~{{commit_count}}',
    variables: [
      { name: 'commit_count', label: 'Commit Count', defaultValue: '5' }
    ],
    tags: ['git', 'rebase', 'squash', 'history']
  },
  {
    id: 'git-commit-message',
    name: 'Git Commit',
    description: 'Commits changes with a descriptive message',
    category: 'Git',
    template: 'git commit -m "{{message}}"',
    variables: [
      { name: 'message', label: 'Commit Message', defaultValue: 'feat: add new capability' }
    ],
    tags: ['git', 'commit']
  },
  {
    id: 'git-reset-hard-origin',
    name: 'Git Hard Reset to Origin',
    description: 'Forcibly resets the current branch to match the remote origin version (discards local changes)',
    category: 'Git',
    template: 'git fetch origin && git reset --hard origin/{{branch_name}}',
    variables: [
      { name: 'branch_name', label: 'Branch Name', defaultValue: 'main' }
    ],
    tags: ['git', 'reset', 'origin']
  },
  {
    id: 'ffmpeg-convert-mp4',
    name: 'FFmpeg MP4 Converter (H.264)',
    description: 'Converts the video into a widely-compatible H.264 MP4 format',
    category: 'Media',
    template: 'ffmpeg -i "{{input_file}}" -c:v libx264 -crf {{crf_quality}} -preset fast -c:a aac -b:a 192k "{{output_file}}"',
    variables: [
      { name: 'input_file', label: 'Input File', defaultValue: 'input.mov' },
      { name: 'crf_quality', label: 'Quality (CRF 18-28)', defaultValue: '23' },
      { name: 'output_file', label: 'Output File', defaultValue: 'output.mp4' }
    ],
    tags: ['ffmpeg', 'video', 'mp4', 'convert']
  },
  {
    id: 'kill-port-process-win',
    name: 'Kill Process Listening on Port (PowerShell)',
    description: 'Finds and forcibly terminates the process occupying the given port',
    category: 'System',
    template: 'Stop-Process -Id (Get-NetTCPConnection -LocalPort {{port}}).OwningProcess -Force',
    variables: [
      { name: 'port', label: 'Port Number', defaultValue: '3000' }
    ],
    tags: ['powershell', 'kill', 'port', 'process']
  },
  {
    id: 'find-large-files-win',
    name: 'Find Large Files (>100MB)',
    description: 'Lists the 10 largest files over 100MB in a directory, sorted by size',
    category: 'System',
    template: 'Get-ChildItem -Path "{{search_path}}" -Recurse -File -ErrorAction SilentlyContinue | Where-Object Length -gt 100MB | Sort-Object Length -Descending | Select-Object -First 10 FullName, @{N="Size(MB)";E={[math]::round($_.Length/1MB,2)}}',
    variables: [
      { name: 'search_path', label: 'Search Directory', defaultValue: '.' }
    ],
    tags: ['powershell', 'disk', 'large', 'files']
  },
  {
    id: 'npx-serve-port',
    name: 'Serve Directory as a Web Server',
    description: 'Serves the current directory as a local HTTP server on the given port',
    category: 'Web & Network',
    template: 'npx -y serve -l {{port}} "{{directory}}"',
    variables: [
      { name: 'port', label: 'Serve Port', defaultValue: '5000' },
      { name: 'directory', label: 'Directory', defaultValue: '.' }
    ],
    tags: ['npx', 'serve', 'http', 'web']
  },
  {
    id: 'kubectl-pod-logs-tail',
    name: 'Tail Kubectl Pod Logs',
    description: 'Follows the latest logs for a pod in the given namespace, live',
    category: 'Kubernetes',
    template: 'kubectl logs -f {{pod_name}} -n {{namespace}} --tail={{line_count}}',
    variables: [
      { name: 'pod_name', label: 'Pod Name', defaultValue: 'my-service-pod' },
      { name: 'namespace', label: 'Namespace', defaultValue: 'default' },
      { name: 'line_count', label: 'Line Count', defaultValue: '100' }
    ],
    tags: ['kubectl', 'k8s', 'logs', 'tail']
  }
];
