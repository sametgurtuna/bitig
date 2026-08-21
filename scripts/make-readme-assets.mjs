// Generates the SVG UI previews used by README.md.
// Run: node scripts/make-readme-assets.mjs
// Colors are taken verbatim from src/shared/builtinThemes/*.ts so the previews
// stay in sync with what the app actually renders.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'screenshots');
mkdirSync(OUT, { recursive: true });

const C = {
  bg: '#0f1117', titlebar: '#14161e', border: '#22252f', accent: '#7dd3fc',
  fg: '#d8dee9', muted: '#8b93a7', dim: '#4b5263', sel: '#2d3444',
  red: '#f47067', green: '#7ee787', yellow: '#e3b341', blue: '#79c0ff',
  magenta: '#d2a8ff', cyan: '#56d4dd', white: '#d0d7de',
  panel: '#171a22', panelHi: '#1e222c'
};

const MONO = "'JetBrains Mono','Cascadia Code',Consolas,Menlo,monospace";
const UI = "'Segoe UI',Inter,system-ui,sans-serif";
const CW = 8.4;      // approximate monospace advance at 14px
const LH = 22;       // terminal line height
const TB = 38;       // title bar height
const SB = 26;       // status bar height

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rect = (x, y, w, h, fill, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"` +
  (o.rx ? ` rx="${o.rx}" ry="${o.rx}"` : '') +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : '') +
  (o.opacity !== undefined ? ` opacity="${o.opacity}"` : '') + ' />';

const line = (x1, y1, x2, y2, stroke, sw = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" />`;

/** runs: string | [text, fill, extraAttrs?][] */
const txt = (x, y, runs, fill = C.fg, o = {}) => {
  const font = o.ui ? UI : MONO;
  const size = o.size || 14;
  const weight = o.weight ? ` font-weight="${o.weight}"` : '';
  const anchor = o.anchor ? ` text-anchor="${o.anchor}"` : '';
  const op = o.opacity !== undefined ? ` opacity="${o.opacity}"` : '';
  const body = typeof runs === 'string'
    ? esc(runs)
    : runs.map(([t, f, extra = '']) => `<tspan fill="${f || fill}"${extra ? ' ' + extra : ''}>${esc(t)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}"${weight}${anchor}${op} xml:space="preserve">${body}</text>`;
};

const width = (s) => s.length * CW;
const uiWidth = (s, size = 12) => s.length * size * 0.56;

const badge = (x, y, label, color, o = {}) => {
  const w = o.w || uiWidth(label, 11) + 20;
  return [
    rect(x, y - 13, w, 20, color, { rx: 10, opacity: 0.16 }),
    rect(x, y - 13, w, 20, 'none', { rx: 10, stroke: color, opacity: 0.55 }),
    txt(x + w / 2, y + 1, label, color, { size: 11, ui: true, anchor: 'middle', weight: 600 })
  ].join('\n  ');
};
const badgeW = (label) => uiWidth(label, 11) + 20;

const kbd = (x, y, label, o = {}) => {
  const w = uiWidth(label, 11) + 16;
  return {
    w,
    svg: [
      rect(x, y - 13, w, 20, o.fill || C.panelHi, { rx: 5, stroke: o.stroke || C.border }),
      txt(x + w / 2, y + 1, label, o.color || C.muted, { size: 11, ui: true, anchor: 'middle', weight: 600 })
    ].join('\n  ')
  };
};

/** Row of keycaps with trailing description. */
const kbdRow = (x, y, keys, desc, descColor = C.muted) => {
  const parts = [];
  let cx = x;
  keys.forEach((k, i) => {
    if (i > 0) { parts.push(txt(cx + 3, y + 1, '+', C.dim, { size: 11, ui: true })); cx += 13; }
    const cap = kbd(cx, y, k);
    parts.push(cap.svg);
    cx += cap.w + 4;
  });
  if (desc) parts.push(txt(cx + 8, y + 1, desc, descColor, { size: 12, ui: true }));
  return parts.join('\n  ');
};

/** A frameless Bitig window with title bar, optional tab strip and status bar. */
function win({ w, h, tabs = [], active = 0, status = null, body = '', bg = C.bg, chrome = C.titlebar, border = C.border, accent = C.accent, fg = C.fg, muted = C.muted, dim = C.dim, id = 'w', title = 'Bitig' }) {
  const parts = [];
  parts.push(rect(0.5, 0.5, w - 1, h - 1, bg, { rx: 12, stroke: border }));
  parts.push(`<g clip-path="url(#clip-${id})">`);
  parts.push(rect(0, 0, w, TB, chrome));
  parts.push(line(0, TB + 0.5, w, TB + 0.5, border));

  let tx = 12;
  tabs.forEach((t, i) => {
    const tw = Math.max(112, uiWidth(t.title) + 62);
    const on = i === active;
    if (on) {
      parts.push(rect(tx, 6, tw, TB - 12, bg, { rx: 7, stroke: border }));
      parts.push(rect(tx + 10, 8, tw - 20, 2, accent, { rx: 1 }));
    }
    parts.push(txt(tx + 13, TB / 2 + 4.5, t.icon || '\u25CF', on ? accent : dim, { size: 10 }));
    parts.push(txt(tx + 28, TB / 2 + 4.5, t.title, on ? fg : muted, { size: 12, ui: true }));
    parts.push(txt(tx + tw - 15, TB / 2 + 4.5, '\u00D7', on ? muted : dim, { size: 13, ui: true, anchor: 'middle' }));
    tx += tw + 4;
  });
  if (tabs.length) {
    parts.push(txt(tx + 14, TB / 2 + 5.5, '+', muted, { size: 17, ui: true, anchor: 'middle' }));
  } else {
    parts.push(txt(16, TB / 2 + 4.5, title, muted, { size: 12, ui: true, weight: 600 }));
  }

  const cy = TB / 2;
  parts.push(line(w - 84, cy, w - 72, cy, muted, 1.3));
  parts.push(rect(w - 54, cy - 5, 10, 10, 'none', { stroke: muted, sw: 1.3 }));
  parts.push(line(w - 26, cy - 5, w - 16, cy + 5, muted, 1.3));
  parts.push(line(w - 16, cy - 5, w - 26, cy + 5, muted, 1.3));

  parts.push(body);

  if (status) {
    const y0 = h - SB;
    parts.push(rect(0, y0, w, SB, chrome));
    parts.push(line(0, y0 + 0.5, w, y0 + 0.5, border));
    let sx = 14;
    status.forEach((s) => {
      if (s.badge) {
        parts.push(badge(sx, y0 + SB / 2 + 1, s.text, s.color || C.green));
        sx += badgeW(s.text) + 10;
      } else {
        parts.push(txt(sx, y0 + SB / 2 + 4, s.text, s.color || muted, { size: 11, ui: true }));
        sx += uiWidth(s.text, 11) + 22;
      }
    });
  }
  parts.push('</g>');
  return parts.join('\n  ');
}

function svg(id, w, h, inner, title) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <defs>
    <clipPath id="clip-${id}"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" ry="12" /></clipPath>
  </defs>
  <title>${esc(title)}</title>
  ${inner}
</svg>
`;
}

const write = (name, content) => {
  writeFileSync(resolve(OUT, name), content);
  console.log('wrote', name);
};

/** Terminal text block helper: lines are arrays of runs. */
const block = (x, y0, lines, o = {}) =>
  lines.map((l, i) => (!l ? '' : txt(x, y0 + i * (o.lh || LH), l, o.fill || C.fg, o))).join('\n  ');

const PS = (p, fg = C.magenta, pathColor = C.blue, arrow = C.accent) =>
  [['PS ', fg], [p, pathColor], ['> ', arrow]];

/** Modal panel used by palette / history / betik / bilge. */
function modal(x, y, w, h, { title, sub, rows = [], input = '', placeholder = '', footer = [], accent = C.accent, rowH = 34, id = 'm' }) {
  const p = [];
  p.push(rect(x, y, w, h, C.panel, { rx: 12, stroke: '#2a2f3c' }));
  p.push(rect(x, y, w, 46, C.panelHi, { rx: 12 }));
  p.push(rect(x, y + 34, w, 12, C.panelHi));
  p.push(line(x, y + 46, x + w, y + 46, '#2a2f3c'));
  p.push(txt(x + 18, y + 29, '\u276F', accent, { size: 13 }));
  if (input) p.push(txt(x + 38, y + 29, input, C.fg, { size: 14 }));
  else p.push(txt(x + 38, y + 29, placeholder, C.dim, { size: 14 }));
  if (input) p.push(rect(x + 38 + width(input) + 2, y + 17, 8, 16, accent, { opacity: 0.85 }));
  if (title) p.push(txt(x + w - 18, y + 29, title, C.dim, { size: 11, ui: true, anchor: 'end', weight: 600 }));
  let ry = y + 46;
  rows.forEach((r, i) => {
    if (r.section) {
      p.push(txt(x + 18, ry + 20, r.section, C.dim, { size: 10.5, ui: true, weight: 700 }));
      ry += 28;
      return;
    }
    if (r.active) {
      p.push(rect(x + 6, ry + 3, w - 12, rowH - 4, accent, { rx: 7, opacity: 0.12 }));
      p.push(rect(x + 6, ry + 3, 3, rowH - 4, accent, { rx: 2 }));
    }
    if (r.icon) p.push(txt(x + 20, ry + rowH / 2 + 5, r.icon, r.iconColor || (r.active ? accent : C.dim), { size: 12 }));
    p.push(txt(x + 44, ry + rowH / 2 + 5, r.label, r.active ? C.fg : C.muted, { size: 13, ui: r.ui !== false }));
    if (r.hint) p.push(txt(x + w - 18, ry + rowH / 2 + 5, r.hint, r.hintColor || C.dim, { size: 11, ui: true, anchor: 'end' }));
    ry += rowH;
  });
  if (footer.length) {
    p.push(line(x, y + h - 34, x + w, y + h - 34, '#2a2f3c'));
    let fx = x + 16;
    footer.forEach((f) => {
      const cap = kbd(fx, y + h - 15, f.k);
      p.push(cap.svg);
      fx += cap.w + 6;
      p.push(txt(fx, y + h - 14, f.d, C.dim, { size: 11, ui: true }));
      fx += uiWidth(f.d, 11) + 18;
    });
  }
  if (sub) p.push(txt(x + w - 16, y + h - 14, sub, C.dim, { size: 11, ui: true, anchor: 'end' }));
  return p.join('\n  ');
}

const scrim = (w, h) => rect(0, TB + 1, w, h - TB - 1, '#05070c', { opacity: 0.55 });

/* ── 1. Overview ────────────────────────────────────────────────────── */
{
  const w = 1000, h = 600, id = 'ov';
  const top = TB + 1, splitX = 596;
  const b = [];
  b.push(line(splitX, top, splitX, h - SB, C.border));
  b.push(rect(splitX - 1.5, top + 230, 3, 44, C.accent, { rx: 2, opacity: 0.45 }));
  b.push(block(20, top + 34, [
    [...PS('C:\\dev\\bitig'), ['npm run dev', C.fg]],
    null,
    [['  vite v7  building for development...', C.dim]],
    [['  \u2713 main    ', C.green], ['bundled in 412 ms', C.muted]],
    [['  \u2713 preload ', C.green], ['bundled in 96 ms', C.muted]],
    [['  \u279C Local:  ', C.muted], ['http://localhost:5173/', C.accent, 'text-decoration="underline"']],
    null,
    [['  ERROR  ', C.red], ['src/renderer/src/tabs.ts:214:9', C.blue, 'text-decoration="underline"']],
    [['         Type \'string\' is not assignable to \'PaneId\'.', C.muted]],
    null,
    [...PS('C:\\dev\\bitig'), ['git st', C.fg], ['atus --short', C.dim]]
  ]));
  b.push(badge(20 + width('  \u279C Local:  http://localhost:5173/') + 14, top + 34 + 5 * LH - 4, ':5173 open', C.green));
  b.push(txt(20, h - SB - 22, 'clickable port badge  \u00B7  file:line jumps straight into VS Code  \u00B7  ghost text completes the command', C.dim, { size: 11, ui: true }));
  b.push(block(splitX + 20, top + 34, [
    [...PS('~/api', C.green, C.cyan, C.green), ['docker compose up', C.fg]],
    [['  api-1  ', C.cyan], ['listening on 0.0.0.0:8080', C.muted]],
    [['  db-1   ', C.cyan], ['ready to accept connections', C.muted]],
    null,
    [...PS('~/api', C.green, C.cyan, C.green), ['echo $env:API_TOKEN', C.fg]],
    [['  ghp_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', C.yellow]],
    [['  \u25B2 masked by Secret Shield', C.dim]],
    null,
    [...PS('~/api', C.green, C.cyan, C.green)]
  ]));
  b.push(rect(splitX + 20 + width('PS ~/api> '), top + 34 + 8 * LH - 12, 8, 16, C.green, { opacity: 0.8 }));
  write('01-overview.svg', svg(id, w, h, win({
    w, h, id,
    tabs: [{ title: 'bitig', icon: '\u276F' }, { title: 'api', icon: '\u276F' }, { title: 'wsl: ubuntu', icon: '\u25B8' }],
    status: [
      { text: 'PowerShell 7' }, { text: 'pane 1 / 2' },
      { text: ':5173', badge: true, color: C.green }, { text: ':8080', badge: true, color: C.cyan },
      { text: 'UTF-8' }, { text: 'Ln 42, Col 18' }, { text: 'main +2', color: C.magenta }
    ],
    body: b.join('\n  ')
  }), 'Bitig main window with split panes, port badges and status bar'));
}

/* ── 2. Inline suggestions ──────────────────────────────────────────── */
{
  const w = 1000, h = 400, id = 'gt';
  const top = TB + 1;
  const b = [];
  b.push(block(24, top + 40, [
    [...PS('C:\\dev\\bitig'), ['npm run ', C.fg], ['dev', C.dim]],
    null,
    [['ranked from', C.dim], [' frecency history ', C.green], [' + ', C.dim], [' package.json scripts ', C.magenta], [' + ', C.dim], [' path entries ', C.cyan]],
    null,
    [...PS('C:\\dev\\bitig'), ['git ch', C.fg], ['eckout feature/panes', C.dim]],
    null,
    [...PS('C:\\dev\\bitig'), ['cd src/ren', C.fg], ['derer/src/', C.dim]],
    null,
    [...PS('C:\\dev\\bitig'), ['docker compose ', C.fg], ['up -d --build', C.dim]]
  ]));
  // annotation braces
  const noteY = top + 40;
  b.push(txt(24 + width('PS C:\\dev\\bitig> npm run dev') + 24, noteY, 'ghost text \u2014 never written to the terminal buffer', C.dim, { size: 11, ui: true }));
  b.push(txt(24 + width('PS C:\\dev\\bitig> git checkout feature/panes') + 24, top + 40 + 4 * LH, 'true prefix matches only, no fuzzy noise', C.dim, { size: 11, ui: true }));
  b.push(txt(24 + width('PS C:\\dev\\bitig> cd src/renderer/src/') + 24, top + 40 + 6 * LH, 'directory completion for cd / code / cat', C.dim, { size: 11, ui: true }));
  const ky = h - SB - 26;
  b.push(kbdRow(24, ky, ['Tab'], 'accept the whole suggestion'));
  b.push(kbdRow(300, ky, ['Ctrl', '\u2192'], 'accept one word'));
  b.push(kbdRow(540, ky, ['Esc'], 'dismiss'));
  b.push(txt(700, ky + 1, 'no suggestion \u2192 Tab falls through to the shell', C.dim, { size: 11, ui: true }));
  write('02-inline-suggestions.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: 'inline suggestions: on', color: C.green }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'Inline ghost text suggestions'));
}

/* ── 3. Command palette ─────────────────────────────────────────────── */
{
  const w = 1000, h = 560, id = 'cp';
  const b = [];
  b.push(block(24, TB + 40, [
    [...PS('C:\\dev\\bitig'), ['npm run typecheck', C.fg]],
    [['  \u2713 no errors', C.green]],
    null,
    [...PS('C:\\dev\\bitig')]
  ], { opacity: 0.5 }));
  b.push(scrim(w, h));
  b.push(modal(200, 96, 600, 400, {
    title: 'Ctrl+Shift+P', input: 'spl', accent: C.accent,
    rows: [
      { section: 'ACTIONS' },
      { label: 'Split pane right', icon: '\u25E7', hint: 'Alt+Shift+D', active: true },
      { label: 'Split pane down', icon: '\u2B12', hint: 'Alt+Shift+E' },
      { label: 'Close focused pane', icon: '\u00D7', hint: 'Ctrl+Shift+X' },
      { section: 'TABS' },
      { label: 'bitig  \u2014  C:\\dev\\bitig', icon: '\u276F', hint: 'tab 1' },
      { section: 'PROFILES' },
      { label: 'PowerShell 7', icon: '\u25B8', hint: 'Ctrl+Shift+1' },
      { label: 'WSL: Ubuntu', icon: '\u25B8', hint: 'Ctrl+Shift+3' }
    ],
    footer: [{ k: '\u2191\u2193', d: 'navigate' }, { k: 'Enter', d: 'run' }, { k: 'Esc', d: 'close' }],
    sub: 'fuzzy across actions, tabs, profiles, themes'
  }));
  write('03-command-palette.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }, { title: 'api', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: 'pane 1 / 1' }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'Universal command palette with fuzzy search'));
}

/* ── 4. History search ──────────────────────────────────────────────── */
{
  const w = 1000, h = 560, id = 'hi';
  const b = [];
  b.push(block(24, TB + 40, [[...PS('C:\\dev\\bitig')]], { opacity: 0.5 }));
  b.push(scrim(w, h));
  b.push(modal(200, 96, 600, 400, {
    title: 'Ctrl+R', input: 'docker', accent: C.magenta,
    rows: [
      { section: 'FRECENCY RANKED \u00B7 32 MATCHES' },
      { label: 'docker compose up -d --build', icon: '\u21BB', hint: '18\u00D7 \u00B7 2 m ago', active: true, ui: false },
      { label: 'docker ps --format "table {{.Names}}"', icon: '\u21BB', hint: '9\u00D7 \u00B7 1 h ago', ui: false },
      { label: 'docker logs -f api-1', icon: '\u21BB', hint: '6\u00D7 \u00B7 yesterday', ui: false },
      { label: 'docker system prune -af', icon: '\u21BB', hint: '2\u00D7 \u00B7 3 d ago', ui: false, hintColor: C.dim },
      { label: 'docker build . -t bitig-ci', icon: '\u2717', hint: 'failed \u00B7 4 d ago', ui: false, hintColor: '#f47067', iconColor: '#f47067' }
    ],
    footer: [{ k: 'Enter', d: 'run' }, { k: 'Tab', d: 'edit first' }, { k: 'Esc', d: 'close' }],
    sub: 'shared across every window and session'
  }));
  write('04-history.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: 'history: 1 284 entries' }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'Frecency ranked command history search'));
}

/* ── 5. Betik runbooks ──────────────────────────────────────────────── */
{
  const w = 1000, h = 560, id = 'bt';
  const b = [];
  b.push(block(24, TB + 40, [[...PS('C:\\dev\\bitig')]], { opacity: 0.5 }));
  b.push(scrim(w, h));
  const mx = 170, my = 86, mw = 660, mh = 420;
  b.push(rect(mx, my, mw, mh, C.panel, { rx: 12, stroke: '#2a2f3c' }));
  b.push(rect(mx, my, mw, 52, C.panelHi, { rx: 12 }));
  b.push(rect(mx, my + 40, mw, 12, C.panelHi));
  b.push(line(mx, my + 52, mx + mw, my + 52, '#2a2f3c'));
  b.push(txt(mx + 20, my + 32, 'Bitig Betik', C.fg, { size: 14, ui: true, weight: 700 }));
  b.push(txt(mx + 118, my + 32, 'Deploy release tag', C.muted, { size: 13, ui: true }));
  b.push(txt(mx + mw - 20, my + 32, 'Ctrl+Shift+B', C.dim, { size: 11, ui: true, anchor: 'end', weight: 600 }));
  const fields = [
    ['environment', 'production', 'select'],
    ['version', 'v1.0.4', 'text'],
    ['dry_run', 'false', 'toggle']
  ];
  fields.forEach(([label, value, kind], i) => {
    const fy = my + 84 + i * 66;
    b.push(txt(mx + 24, fy, '{{' + label + '}}', C.magenta, { size: 12 }));
    b.push(rect(mx + 24, fy + 10, mw - 48, 34, C.bg, { rx: 7, stroke: i === 1 ? C.accent : '#2a2f3c' }));
    b.push(txt(mx + 38, fy + 32, value, i === 1 ? C.fg : C.muted, { size: 13 }));
    if (kind === 'select') b.push(txt(mx + mw - 42, fy + 32, '\u25BE', C.dim, { size: 11 }));
    if (kind === 'toggle') {
      b.push(rect(mx + mw - 76, fy + 18, 34, 18, C.border, { rx: 9 }));
      b.push(`<circle cx="${mx + mw - 67}" cy="${fy + 27}" r="6" fill="${C.dim}" />`);
    }
    if (i === 1) b.push(rect(mx + 38 + width(value) + 2, fy + 19, 8, 16, C.accent, { opacity: 0.85 }));
  });
  const py = my + 290;
  b.push(txt(mx + 24, py, 'LIVE PREVIEW', C.dim, { size: 10.5, ui: true, weight: 700 }));
  b.push(rect(mx + 24, py + 12, mw - 48, 56, C.bg, { rx: 8, stroke: '#2a2f3c' }));
  b.push(txt(mx + 38, py + 34, [['$ ', C.green], ['./deploy.sh --env ', C.fg], ['production', C.magenta], [' --tag ', C.fg], ['v1.0.4', C.magenta]], C.fg, { size: 13 }));
  b.push(txt(mx + 38, py + 56, [['  --confirm', C.fg]], C.fg, { size: 13 }));
  b.push(line(mx, my + mh - 44, mx + mw, my + mh - 44, '#2a2f3c'));
  b.push(kbdRow(mx + 20, my + mh - 20, ['Enter'], 'run in the focused pane'));
  b.push(kbdRow(mx + 260, my + mh - 20, ['Ctrl', 'Enter'], 'copy without running'));
  b.push(txt(mx + mw - 20, my + mh - 19, 'snippets.json', C.dim, { size: 11, ui: true, anchor: 'end' }));
  write('05-betik.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: '12 runbooks' }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'Bitig Betik parametric runbook form with live preview'));
}

/* ── 6. Search bar ──────────────────────────────────────────────────── */
{
  const w = 1000, h = 420, id = 'se';
  const top = TB + 1;
  const b = [];
  const lines = [
    [...PS('C:\\dev\\bitig'), ['npm test', C.fg]],
    null,
    [['  PASS  ', C.green], ['src/shared/fuzzy.test.ts', C.muted]],
    [['  FAIL  ', C.red], ['src/renderer/panes.test.ts', C.muted]],
    [['    \u25CF pane tree > splits horizontally', C.muted]],
    [['      Expected: ', C.dim], ['2 leaves', C.green]],
    [['      Received: ', C.dim], ['1 leaf', C.red]],
    null,
    [['  Tests:  ', C.muted], ['1 failed', C.red], [', ', C.muted], ['41 passed', C.green]]
  ];
  b.push(block(24, top + 40, lines));
  // highlight matches of "pane"
  b.push(rect(24 + width('    \u25CF '), top + 40 + 4 * LH - 12, width('pane'), 17, C.accent, { rx: 2, opacity: 0.35 }));
  b.push(rect(24 + width('  FAIL  src/renderer/'), top + 40 + 3 * LH - 12, width('panes'), 17, C.yellow, { rx: 2, opacity: 0.28 }));
  // search bar
  const sx = w - 452, sy = top + 14;
  b.push(rect(sx, sy, 430, 44, C.panelHi, { rx: 10, stroke: '#2a2f3c' }));
  b.push(txt(sx + 16, sy + 28, '\u2315', C.dim, { size: 14 }));
  b.push(txt(sx + 38, sy + 28, 'pane', C.fg, { size: 13 }));
  b.push(txt(sx + 120, sy + 28, '3 / 7', C.dim, { size: 11.5, ui: true }));
  ['Aa', '\u2423', '.*'].forEach((t, i) => {
    const on = i === 2;
    b.push(rect(sx + 186 + i * 40, sy + 11, 34, 22, on ? C.accent : 'transparent', { rx: 6, opacity: on ? 0.18 : 1, stroke: on ? undefined : C.border }));
    b.push(txt(sx + 203 + i * 40, sy + 27, t, on ? C.accent : C.muted, { size: 11.5, ui: true, anchor: 'middle', weight: 600 }));
  });
  b.push(txt(sx + 330, sy + 28, '\u2191', C.muted, { size: 13 }));
  b.push(txt(sx + 360, sy + 28, '\u2193', C.muted, { size: 13 }));
  b.push(txt(sx + 400, sy + 28, '\u00D7', C.muted, { size: 14 }));
  b.push(kbdRow(24, h - SB - 24, ['Ctrl', 'F'], 'incremental search with case, whole word and regex toggles'));
  write('06-search.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: 'scrollback 10 000' }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'In terminal incremental search'));
}

/* ── 7. Panes and tabs ──────────────────────────────────────────────── */
{
  const w = 1000, h = 520, id = 'pn';
  const top = TB + 1, bottom = h - SB;
  const b = [];
  const vx = 520, hy = 300;
  b.push(line(vx, top, vx, bottom, C.border));
  b.push(line(vx, hy, w, hy, C.border));
  b.push(rect(vx - 1.5, top + 180, 3, 44, C.accent, { rx: 2, opacity: 0.45 }));
  b.push(rect(2, top + 2, vx - 4, bottom - top - 4, C.accent, { rx: 6, opacity: 0.06 }));
  b.push(rect(2.5, top + 2.5, vx - 5, bottom - top - 5, 'none', { rx: 6, stroke: C.accent, opacity: 0.35 }));
  b.push(block(22, top + 34, [
    [...PS('C:\\dev\\bitig'), ['npm run dev', C.fg]],
    [['  \u279C Local: ', C.muted], ['http://localhost:5173/', C.accent]],
    [['  ready in 1.2 s', C.dim]],
    null,
    [...PS('C:\\dev\\bitig')]
  ]));
  b.push(txt(22, bottom - 20, 'pane 1 \u00B7 focused', C.accent, { size: 11, ui: true, weight: 600 }));
  b.push(block(vx + 22, top + 34, [
    [...PS('~/api', C.green, C.cyan, C.green), ['tail -f app.log', C.fg]],
    [['  200 GET  /health   3 ms', C.muted]],
    [['  201 POST /sessions 41 ms', C.muted]],
    [['  500 GET  /billing  12 ms', C.red]]
  ]));
  b.push(txt(vx + 22, hy - 16, 'pane 2', C.muted, { size: 11, ui: true }));
  b.push(block(vx + 22, hy + 34, [
    [['\u276F ', C.green], ['btop', C.fg]],
    [['  cpu ', C.muted], ['\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591', C.green], ['  61%', C.muted]],
    [['  mem ', C.muted], ['\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591\u2591', C.cyan], ['  42%', C.muted]]
  ]));
  b.push(txt(vx + 22, bottom - 20, 'pane 3', C.muted, { size: 11, ui: true }));
  write('07-panes.svg', svg(id, w, h, win({
    w, h, id,
    tabs: [{ title: 'bitig', icon: '\u276F' }, { title: 'api', icon: '\u276F' }, { title: 'logs', icon: '\u25B8' }, { title: 'wsl: ubuntu', icon: '\u25B8' }],
    status: [{ text: 'PowerShell 7' }, { text: 'pane 1 / 3' }, { text: ':5173', badge: true, color: C.green }, { text: 'UTF-8' }, { text: 'Ln 8, Col 22' }],
    body: b.join('\n  ')
  }), 'Nested split panes with a draggable divider'));
}

/* ── 8. Themes ──────────────────────────────────────────────────────── */
{
  const w = 1000, h = 430, id = 'th';
  const themes = [
    {
      name: 'Bitig Dark', id: 'bitig-dark', bg: '#0f1117', chrome: '#14161e', border: '#22252f',
      fg: '#d8dee9', accent: '#7dd3fc', muted: '#8b93a7',
      ansi: ['#f47067', '#7ee787', '#e3b341', '#79c0ff', '#d2a8ff', '#56d4dd'], default: true
    },
    {
      name: 'Bitig Light', id: 'bitig-light', bg: '#f6f7f9', chrome: '#eceef2', border: '#d8dce4',
      fg: '#2b3040', accent: '#1f6feb', muted: '#5b6376',
      ansi: ['#d1242f', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#1b7c83']
    },
    {
      name: 'Dracula', id: 'dracula', bg: '#282a36', chrome: '#21222c', border: '#44475a',
      fg: '#f8f8f2', accent: '#bd93f9', muted: '#6272a4',
      ansi: ['#ff5555', '#50fa7b', '#f1fa8c', '#8be9fd', '#ff79c6', '#bd93f9']
    },
    {
      name: 'Nord', id: 'nord', bg: '#2e3440', chrome: '#272c36', border: '#434c5e',
      fg: '#d8dee9', accent: '#88c0d0', muted: '#7b88a1',
      ansi: ['#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb']
    }
  ];
  const cardW = 222, cardH = 288, gap = 18, x0 = 24, y0 = 58;
  const b = [];
  b.push(rect(0, 0, w, h, C.bg, { rx: 12 }));
  b.push(txt(26, 34, 'Four built in themes \u00B7 hot reloaded user themes from %APPDATA%/Bitig/themes/', C.muted, { size: 13, ui: true }));
  themes.forEach((t, i) => {
    const x = x0 + i * (cardW + gap);
    b.push(rect(x, y0, cardW, cardH, t.bg, { rx: 10, stroke: t.default ? t.accent : t.border, sw: t.default ? 1.6 : 1 }));
    b.push(rect(x + 0.5, y0 + 0.5, cardW - 1, 30, t.chrome, { rx: 10 }));
    b.push(rect(x + 0.5, y0 + 20, cardW - 1, 11, t.chrome));
    b.push(line(x, y0 + 31, x + cardW, y0 + 31, t.border));
    b.push(txt(x + 12, y0 + 20, '\u25CF  ' + t.name, t.muted, { size: 10.5, ui: true, weight: 600 }));
    b.push(txt(x + cardW - 12, y0 + 20, '\u2014  \u25A1  \u00D7', t.muted, { size: 8, ui: true, anchor: 'end' }));
    const lines = [
      [['PS ', t.ansi[4]], ['~\\bitig', t.ansi[3]], ['> ', t.accent], ['git status', t.fg]],
      [['  M ', t.ansi[2]], ['src/panes.ts', t.fg]],
      [['  A ', t.ansi[1]], ['src/fuzzy.ts', t.fg]],
      [['  D ', t.ansi[0]], ['old/legacy.ts', t.fg]],
      null,
      [['PS ', t.ansi[4]], ['~\\bitig', t.ansi[3]], ['> ', t.accent], ['npm ', t.fg], ['run dev', t.muted]]
    ];
    b.push(lines.map((l, k) => (!l ? '' : txt(x + 12, y0 + 58 + k * 20, l, t.fg, { size: 11 }))).join('\n  '));
    t.ansi.forEach((c, k) => b.push(rect(x + 12 + k * 24, y0 + cardH - 66, 18, 18, c, { rx: 4 })));
    b.push(txt(x + 12, y0 + cardH - 24, t.id, t.muted, { size: 10.5, ui: true }));
    if (t.default) b.push(badge(x + cardW - badgeW('default') - 12, y0 + cardH - 20, 'default', t.accent));
  });
  b.push(kbdRow(26, h - 22, ['Alt', 'Shift', 'T'], 'cycle themes  \u00B7  drop a JSON file into themes/ and it appears without a restart'));
  write('08-themes.svg', svg(id, w, h, b.join('\n  '), 'Built in themes: Bitig Dark, Bitig Light, Dracula, Nord'));
}

/* ── 9. Settings panel ──────────────────────────────────────────────── */
{
  const w = 1000, h = 600, id = 'st';
  const top = TB + 1, navW = 210;
  const b = [];
  b.push(rect(0, top, navW, h - top, C.panel));
  b.push(line(navW, top, navW, h, C.border));
  const nav = ['Appearance', 'Font', 'Terminal', 'Profiles', 'Keyboard', 'Bitig Bilge', 'Cockpit', 'Notifications', 'Plugins'];
  const icons = ['\u25D1', 'A', '\u276F', '\u25B8', '\u2328', '\u2726', '\u25CE', '\u25B3', '\u2699'];
  nav.forEach((n, i) => {
    const y = top + 24 + i * 40;
    if (i === 0) {
      b.push(rect(10, y - 16, navW - 20, 32, C.accent, { rx: 7, opacity: 0.14 }));
      b.push(rect(10, y - 16, 3, 32, C.accent, { rx: 2 }));
    }
    b.push(txt(28, y + 5, icons[i], i === 0 ? C.accent : C.dim, { size: 12 }));
    b.push(txt(52, y + 5, n, i === 0 ? C.fg : C.muted, { size: 13, ui: true, weight: i === 0 ? 600 : 400 }));
  });
  b.push(txt(28, h - 26, 'settings.json  \u00B7  %APPDATA%/Bitig/', C.dim, { size: 10.5, ui: true }));

  const cx = navW + 34;
  b.push(txt(cx, top + 34, 'Appearance', C.fg, { size: 17, ui: true, weight: 700 }));
  b.push(txt(cx, top + 56, 'Theme, transparency and background image. Every change is written to settings.json.', C.dim, { size: 11.5, ui: true }));
  // theme grid
  const swatches = [['Bitig Dark', '#0f1117', '#7dd3fc', true], ['Bitig Light', '#f6f7f9', '#1f6feb', false], ['Dracula', '#282a36', '#bd93f9', false], ['Nord', '#2e3440', '#88c0d0', false]];
  swatches.forEach(([name, bg, ac, on], i) => {
    const x = cx + i * 176;
    b.push(rect(x, top + 78, 160, 78, bg, { rx: 8, stroke: on ? ac : C.border, sw: on ? 1.6 : 1 }));
    b.push(rect(x + 12, top + 94, 60, 6, ac, { rx: 3 }));
    b.push(rect(x + 12, top + 108, 100, 6, '#ffffff', { rx: 3, opacity: 0.28 }));
    b.push(rect(x + 12, top + 122, 76, 6, '#ffffff', { rx: 3, opacity: 0.16 }));
    b.push(txt(x + 12, top + 172, name, on ? C.fg : C.muted, { size: 11.5, ui: true, weight: on ? 600 : 400 }));
    if (on) b.push(txt(x + 148, top + 172, '\u2713', ac, { size: 12, anchor: 'end' }));
  });
  // sliders
  const slider = (y, label, value, pct, hint) => {
    const sx = cx, sw2 = 560;
    const p = [];
    p.push(txt(sx, y, label, C.fg, { size: 13, ui: true, weight: 600 }));
    p.push(txt(sx + sw2, y, value, C.accent, { size: 12, ui: true, anchor: 'end' }));
    p.push(rect(sx, y + 14, sw2, 6, C.border, { rx: 3 }));
    p.push(rect(sx, y + 14, sw2 * pct, 6, C.accent, { rx: 3 }));
    p.push(`<circle cx="${sx + sw2 * pct}" cy="${y + 17}" r="8" fill="${C.accent}" />`);
    if (hint) p.push(txt(sx, y + 40, hint, C.dim, { size: 11, ui: true }));
    return p.join('\n  ');
  };
  b.push(slider(top + 232, 'Window opacity', '0.92', 0.86, 'live preview while dragging; written to disk only when you let go'));
  b.push(slider(top + 306, 'Background image opacity', '0.25', 0.25, null));
  b.push(txt(cx, top + 372, 'Background image', C.fg, { size: 13, ui: true, weight: 600 }));
  b.push(rect(cx, top + 386, 430, 34, C.bg, { rx: 7, stroke: C.border }));
  b.push(txt(cx + 14, top + 408, 'C:\\Users\\dev\\Pictures\\ridge.png', C.muted, { size: 12 }));
  b.push(rect(cx + 444, top + 386, 116, 34, C.panelHi, { rx: 7, stroke: C.border }));
  b.push(txt(cx + 502, top + 408, 'Browse...', C.fg, { size: 12, ui: true, anchor: 'middle', weight: 600 }));
  ['cover', 'contain', 'tile', 'center'].forEach((f, i) => {
    const on = i === 0;
    const x = cx + i * 100;
    b.push(rect(x, top + 436, 88, 30, on ? C.accent : 'transparent', { rx: 7, opacity: on ? 0.16 : 1, stroke: on ? undefined : C.border }));
    b.push(txt(x + 44, top + 456, f, on ? C.accent : C.muted, { size: 11.5, ui: true, anchor: 'middle', weight: 600 }));
  });
  b.push(rect(cx, h - 66, 178, 34, 'transparent', { rx: 7, stroke: C.red, opacity: 0.6 }));
  b.push(txt(cx + 89, h - 44, 'Restore defaults', C.red, { size: 12, ui: true, anchor: 'middle', weight: 600 }));
  write('09-settings.svg', svg(id, w, h, win({
    w, h, id, tabs: [], title: 'Bitig \u00B7 Settings', body: b.join('\n  ')
  }), 'Settings panel, Appearance section'));
}

/* ── 10. Cockpit ────────────────────────────────────────────────────── */
{
  const w = 1000, h = 470, id = 'ck';
  const top = TB + 1;
  const b = [];
  b.push(block(24, top + 38, [
    [['\u2014\u2014 ', C.dim], ['LIVE PORT SNIFFER', C.green], ['  \u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014', C.dim]],
    [...PS('C:\\dev\\bitig'), ['npm run dev', C.fg]],
    [['  \u279C  Local:   ', C.muted], ['http://localhost:5173/', C.accent, 'text-decoration="underline"']],
    [['  \u279C  API:     ', C.muted], ['listening on 0.0.0.0:8080', C.muted]],
    null,
    [['\u2014\u2014 ', C.dim], ['SMART LINKS', C.blue], ['  \u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014', C.dim]],
    [['  ERROR in ', C.red], ['src/renderer/src/panes.ts:214:9', C.blue, 'text-decoration="underline"']],
    [['  ERROR in ', C.red], ['src/main/pty/ptyManager.ts:88:3', C.blue, 'text-decoration="underline"']],
    null,
    [['\u2014\u2014 ', C.dim], ['SECRET SHIELD', C.yellow], ['  \u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014', C.dim]],
    [...PS('C:\\dev\\bitig'), ['cat .env', C.fg]],
    [['  OPENAI_API_KEY=', C.muted], ['sk-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', C.yellow]],
    [['  AWS_ACCESS_KEY_ID=', C.muted], ['AKIA\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', C.yellow]],
    [['  GITHUB_TOKEN=', C.muted], ['ghp_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', C.yellow]]
  ]));
  b.push(badge(24 + width('  \u279C  Local:   http://localhost:5173/') + 14, top + 38 + 2 * LH - 4, ':5173 open \u2197', C.green));
  b.push(badge(24 + width('  \u279C  API:     listening on 0.0.0.0:8080') + 14, top + 38 + 3 * LH - 4, ':8080 open \u2197', C.cyan));
  b.push(txt(24 + width('  ERROR in src/renderer/src/panes.ts:214:9') + 18, top + 38 + 6 * LH, 'click \u2192 VS Code at line 214, column 9', C.dim, { size: 11, ui: true }));
  b.push(txt(24 + width('  GITHUB_TOKEN=ghp_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') + 18, top + 38 + 13 * LH, 'masked before it can reach history.json', C.dim, { size: 11, ui: true }));
  write('10-cockpit.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: ':5173', badge: true, color: C.green }, { text: ':8080', badge: true, color: C.cyan }, { text: 'Secret Shield: on', color: C.yellow }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'Developer Cockpit: port sniffer, smart links, secret shield'));
}

/* ── 11. Bitig Bilge (AI) ───────────────────────────────────────────── */
{
  const w = 1000, h = 560, id = 'ai';
  const b = [];
  b.push(block(24, TB + 40, [
    [...PS('C:\\dev\\bitig'), ['git push origin main', C.fg]],
    [['  ! [rejected] main -> main (fetch first)', C.red]]
  ], { opacity: 0.5 }));
  b.push(scrim(w, h));
  const mx = 180, my = 90, mw = 640, mh = 400;
  b.push(rect(mx, my, mw, mh, C.panel, { rx: 12, stroke: '#2a2f3c' }));
  b.push(rect(mx, my, mw, 50, C.panelHi, { rx: 12 }));
  b.push(rect(mx, my + 38, mw, 12, C.panelHi));
  b.push(line(mx, my + 50, mx + mw, my + 50, '#2a2f3c'));
  b.push(txt(mx + 20, my + 31, '\u2726  Bitig Bilge', C.magenta, { size: 14, ui: true, weight: 700 }));
  b.push(badge(mx + 160, my + 30, 'ollama \u00B7 llama3 \u00B7 local', C.green));
  b.push(txt(mx + mw - 20, my + 31, 'Ctrl+I', C.dim, { size: 11, ui: true, anchor: 'end', weight: 600 }));
  b.push(txt(mx + 24, my + 84, 'ASK', C.dim, { size: 10.5, ui: true, weight: 700 }));
  b.push(rect(mx + 24, my + 94, mw - 48, 38, C.bg, { rx: 8, stroke: C.magenta, sw: 1.2 }));
  b.push(txt(mx + 38, my + 118, 'undo my last commit but keep the changes staged', C.fg, { size: 13 }));
  b.push(txt(mx + 24, my + 168, 'SUGGESTED COMMAND', C.dim, { size: 10.5, ui: true, weight: 700 }));
  b.push(rect(mx + 24, my + 178, mw - 48, 46, C.bg, { rx: 8, stroke: '#2a2f3c' }));
  b.push(txt(mx + 38, my + 206, [['$ ', C.green], ['git reset --soft HEAD~1', C.fg]], C.fg, { size: 14 }));
  b.push(txt(mx + 24, my + 258, 'WHY', C.dim, { size: 10.5, ui: true, weight: 700 }));
  b.push(txt(mx + 24, my + 280, '--soft moves the branch pointer back one commit and leaves every change in', C.muted, { size: 12, ui: true }));
  b.push(txt(mx + 24, my + 300, 'the index, so nothing is lost and the files stay staged for a new commit.', C.muted, { size: 12, ui: true }));
  b.push(rect(mx + 24, my + 322, mw - 48, 34, C.yellow, { rx: 7, opacity: 0.1 }));
  b.push(txt(mx + 38, my + 344, '\u25B3  Nothing runs until you press Enter. Keys stay in settings.json.', C.yellow, { size: 11.5, ui: true }));
  b.push(line(mx, my + mh - 42, mx + mw, my + mh - 42, '#2a2f3c'));
  b.push(kbdRow(mx + 20, my + mh - 18, ['Enter'], 'insert into the pane'));
  b.push(kbdRow(mx + 250, my + mh - 18, ['Ctrl', 'E'], 'explain the last error'));
  b.push(txt(mx + mw - 20, my + mh - 17, 'Ollama \u00B7 OpenAI \u00B7 Anthropic \u00B7 Gemini \u00B7 DeepSeek', C.dim, { size: 11, ui: true, anchor: 'end' }));
  write('11-bilge-ai.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: 'Bilge: ollama (local)', color: C.magenta }, { text: 'UTF-8' }],
    body: b.join('\n  ')
  }), 'Bitig Bilge AI companion'));
}

/* ── 12. Power modes: Quake HUD + broadcast input ───────────────────── */
{
  const w = 1000, h = 520, id = 'qk';
  const b = [];
  // desktop backdrop
  b.push(`<defs><linearGradient id="desk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101826"/><stop offset="1" stop-color="#1b1030"/></linearGradient></defs>`);
  b.push(rect(0.5, 0.5, w - 1, h - 1, 'url(#desk)', { rx: 12, stroke: C.border }));
  b.push(`<g clip-path="url(#clip-qk)">`);
  // faux desktop icons
  for (let i = 0; i < 3; i++) {
    b.push(rect(28, 28 + i * 74, 44, 44, '#ffffff', { rx: 9, opacity: 0.06 }));
    b.push(rect(24, 80 + i * 74, 52, 6, '#ffffff', { rx: 3, opacity: 0.05 }));
  }
  // HUD window dropping from the top
  const hw = 800, hx = (w - hw) / 2, hh = 300;
  b.push(rect(hx, -12, hw, hh + 12, C.bg, { rx: 14, opacity: 0.97 }));
  b.push(rect(hx + 0.5, -12, hw - 1, hh + 12, 'none', { rx: 14, stroke: C.accent, opacity: 0.35 }));
  b.push(rect(hx, 0, hw, TB, C.titlebar));
  b.push(line(hx, TB + 0.5, hx + hw, TB + 0.5, C.border));
  b.push(txt(hx + 18, TB / 2 + 5, '\u25BC  Quake HUD', C.accent, { size: 12, ui: true, weight: 600 }));
  b.push(txt(hx + hw - 18, TB / 2 + 5, 'Win + ~', C.dim, { size: 11, ui: true, anchor: 'end', weight: 600 }));
  b.push(block(hx + 20, TB + 38, [
    [...PS('C:\\dev'), ['scoop update *', C.fg]],
    [['  Updating ', C.muted], ['bitig', C.green], [' (1.0.3 -> 1.0.4)', C.muted]],
    [['  Done. 1 app updated.', C.dim]],
    null,
    [...PS('C:\\dev')]
  ]));
  b.push(rect(hx + 20 + width('PS C:\\dev> '), TB + 38 + 4 * LH - 12, 8, 16, C.accent, { opacity: 0.85 }));
  b.push(txt(hx + 20, hh - 24, 'a global OS shortcut drops a scratch terminal over any window and hides it again', C.dim, { size: 11, ui: true }));

  // broadcast input mini window
  const bx = 60, by = 336, bw = w - 120, bh = 150;
  b.push(rect(bx, by, bw, bh, C.bg, { rx: 12, stroke: C.border }));
  b.push(rect(bx, by, bw, 28, C.yellow, { rx: 12, opacity: 0.16 }));
  b.push(rect(bx, by + 16, bw, 12, C.yellow, { opacity: 0.16 }));
  b.push(txt(bx + bw / 2, by + 19, '\u26A0  BROADCAST INPUT \u2014 every keystroke is mirrored into all 3 panes  \u00B7  Alt+Shift+I', C.yellow, { size: 11.5, ui: true, anchor: 'middle', weight: 700 }));
  [0, 1, 2].forEach((i) => {
    const px = bx + i * (bw / 3);
    if (i) b.push(line(px, by + 28, px, by + bh, C.border));
    b.push(txt(px + 16, by + 58, [['\u276F ', C.green], ['sudo apt update', C.fg]], C.fg, { size: 12.5 }));
    b.push(txt(px + 16, by + 80, ['web-01', 'web-02', 'db-01'][i], C.dim, { size: 11, ui: true }));
    b.push(rect(px + 16 + width('\u276F sudo apt update'), by + 46, 7, 15, C.yellow, { opacity: 0.85 }));
  });
  b.push('</g>');
  write('12-power-modes.svg', svg(id, w, h, b.join('\n  '), 'Quake HUD window and broadcast input mode'));
}

/* ── 13. Plugins ────────────────────────────────────────────────────── */
{
  const w = 1000, h = 500, id = 'pl';
  const top = TB + 1;
  const b = [];
  b.push(txt(28, top + 34, 'Plugins', C.fg, { size: 17, ui: true, weight: 700 }));
  b.push(txt(28, top + 56, 'Loaded from %APPDATA%/Bitig/plugins/ into an isolated Node vm context with an allowlisted API.', C.dim, { size: 11.5, ui: true }));
  const rows = [
    ['Git Branch Sentinel', 'git-status', 'Shows the active Git branch in the status bar.', ['statusbar'], true],
    ['Memory Meter', 'sys-memory', 'Live process memory usage widget.', ['statusbar'], true],
    ['Quick Notes', 'quick-notes', 'Registers a rebindable action that opens a scratch note.', ['actions'], false]
  ];
  rows.forEach(([name, pid, desc, perms, on], i) => {
    const y = top + 82 + i * 92;
    b.push(rect(28, y, w - 56, 78, C.panel, { rx: 10, stroke: C.border }));
    b.push(txt(48, y + 30, name, C.fg, { size: 13.5, ui: true, weight: 600 }));
    b.push(txt(48 + uiWidth(name, 13.5) + 14, y + 30, pid, C.dim, { size: 11.5 }));
    b.push(txt(48, y + 54, desc, C.muted, { size: 11.5, ui: true }));
    perms.forEach((p, k) => b.push(badge(w - 300 + k * 96, y + 30, p, C.magenta)));
    b.push(rect(w - 108, y + 20, 40, 20, on ? C.green : C.border, { rx: 10, opacity: on ? 0.35 : 1 }));
    b.push(`<circle cx="${on ? w - 78 : w - 98}" cy="${y + 30}" r="7" fill="${on ? C.green : C.dim}" />`);
    b.push(txt(w - 88, y + 60, on ? 'enabled' : 'disabled', on ? C.green : C.dim, { size: 10.5, ui: true, anchor: 'middle' }));
  });
  const fy = h - SB - 44;
  b.push(rect(28, fy, 150, 32, C.panelHi, { rx: 7, stroke: C.border }));
  b.push(txt(103, fy + 21, 'Reload plugins', C.fg, { size: 12, ui: true, anchor: 'middle', weight: 600 }));
  b.push(rect(190, fy, 150, 32, C.panelHi, { rx: 7, stroke: C.border }));
  b.push(txt(265, fy + 21, 'Open folder', C.fg, { size: 12, ui: true, anchor: 'middle', weight: 600 }));
  b.push(txt(360, fy + 21, 'plugin.json manifest + entry script  \u00B7  no fs, no process, no require', C.dim, { size: 11, ui: true }));
  write('13-plugins.svg', svg(id, w, h, win({
    w, h, id, tabs: [], title: 'Bitig \u00B7 Settings \u00B7 Plugins',
    status: [{ text: 'main \u21912', color: C.magenta }, { text: 'mem 148 MB', color: C.cyan }, { text: 'plugin widgets \u2191', color: C.dim }],
    body: b.join('\n  ')
  }), 'Plugin manager and contributed status bar widgets'));
}

/* ── 14. Profiles ───────────────────────────────────────────────────── */
{
  const w = 1000, h = 420, id = 'pr';
  const top = TB + 1;
  const b = [];
  b.push(txt(28, top + 34, 'Profiles', C.fg, { size: 17, ui: true, weight: 700 }));
  b.push(txt(28, top + 56, 'Installed shells are discovered at startup. Each profile keeps its own command, arguments, icon and startup directory.', C.dim, { size: 11.5, ui: true }));
  const profs = [
    ['PowerShell 7', 'pwsh.exe -NoLogo', C.blue, 'Ctrl+Shift+1', true],
    ['Command Prompt', 'cmd.exe', C.muted, 'Ctrl+Shift+2', false],
    ['Git Bash', 'bash.exe --login -i', C.green, 'Ctrl+Shift+3', false],
    ['WSL: Ubuntu', 'wsl.exe -d Ubuntu', C.magenta, 'Ctrl+Shift+4', false]
  ];
  profs.forEach(([name, cmd, color, sc, def], i) => {
    const x = 28 + (i % 2) * 480, y = top + 84 + Math.floor(i / 2) * 104;
    b.push(rect(x, y, 456, 84, C.panel, { rx: 10, stroke: def ? color : C.border, sw: def ? 1.4 : 1 }));
    b.push(rect(x + 18, y + 22, 40, 40, color, { rx: 9, opacity: 0.16 }));
    b.push(txt(x + 38, y + 48, '\u276F', color, { size: 15, anchor: 'middle' }));
    b.push(txt(x + 74, y + 36, name, C.fg, { size: 13.5, ui: true, weight: 600 }));
    b.push(txt(x + 74, y + 58, cmd, C.muted, { size: 11.5 }));
    b.push(txt(x + 438, y + 36, sc, C.dim, { size: 10.5, ui: true, anchor: 'end', weight: 600 }));
    if (def) b.push(badge(x + 438 - badgeW('default'), y + 58, 'default', color));
  });
  write('14-profiles.svg', svg(id, w, h, win({
    w, h, id, tabs: [], title: 'Bitig \u00B7 Settings \u00B7 Profiles', body: b.join('\n  ')
  }), 'Shell profiles discovered automatically'));
}

/* ── 15. Keyboard ───────────────────────────────────────────────────── */
{
  const w = 1000, h = 460, id = 'kb';
  const top = TB + 1;
  const b = [];
  b.push(txt(28, top + 34, 'Keyboard', C.fg, { size: 17, ui: true, weight: 700 }));
  b.push(txt(28, top + 56, 'Every action is rebindable, with live conflict detection and a per shortcut reset.', C.dim, { size: 11.5, ui: true }));
  const rows = [
    ['New tab', ['Ctrl', 'Shift', 'T'], null],
    ['Split pane right', ['Alt', 'Shift', 'D'], null],
    ['Command palette', ['Ctrl', 'Shift', 'P'], null],
    ['Command history', ['Ctrl', 'R'], null],
    ['Toggle broadcast input', ['Ctrl', 'Shift', 'B'], 'conflicts with Bitig Betik'],
    ['Bitig Bilge', ['Ctrl', 'I'], null]
  ];
  rows.forEach(([label, keys, conflict], i) => {
    const y = top + 88 + i * 48;
    const bad = Boolean(conflict);
    b.push(rect(28, y, w - 56, 40, C.panel, { rx: 8, stroke: bad ? C.red : C.border, sw: bad ? 1.4 : 1 }));
    b.push(txt(48, y + 25, label, C.fg, { size: 13, ui: true }));
    if (bad) b.push(txt(48 + uiWidth(label, 13) + 18, y + 25, '\u26A0  ' + conflict, C.red, { size: 11, ui: true }));
    let kx = w - 300;
    keys.forEach((k, n) => {
      if (n) { b.push(txt(kx + 2, y + 25, '+', C.dim, { size: 11, ui: true })); kx += 12; }
      const cap = kbd(kx, y + 24, k, bad ? { stroke: C.red, color: C.red } : {});
      b.push(cap.svg); kx += cap.w + 5;
    });
    b.push(txt(w - 52, y + 25, '\u21BA', C.dim, { size: 13, anchor: 'middle' }));
  });
  write('15-keyboard.svg', svg(id, w, h, win({
    w, h, id, tabs: [], title: 'Bitig \u00B7 Settings \u00B7 Keyboard', body: b.join('\n  ')
  }), 'Rebindable keyboard shortcuts with conflict detection'));
}

/* ── 16. Fonts ──────────────────────────────────────────────────────── */
{
  const w = 1000, h = 400, id = 'fn';
  const top = TB + 1;
  const b = [];
  b.push(txt(28, top + 34, 'Font', C.fg, { size: 17, ui: true, weight: 700 }));
  b.push(txt(28, top + 56, 'Monospace families only. Nerd Font coverage is measured on a canvas, not guessed from the family name.', C.dim, { size: 11.5, ui: true }));
  const fonts = [
    ['MesloLGS Nerd Font', true, true],
    ['JetBrains Mono', false, false],
    ['Cascadia Code', false, false],
    ['Consolas', false, false]
  ];
  fonts.forEach(([name, nerd, on], i) => {
    const y = top + 84 + i * 46;
    if (on) b.push(rect(28, y, 420, 38, C.accent, { rx: 8, opacity: 0.14 }));
    b.push(rect(28, y, 420, 38, 'none', { rx: 8, stroke: on ? C.accent : C.border }));
    b.push(txt(48, y + 24, name, on ? C.fg : C.muted, { size: 13, ui: true, weight: on ? 600 : 400 }));
    if (nerd) b.push(badge(300, y + 20, 'Nerd Font \u2713', C.green));
  });
  b.push(txt(490, top + 92, 'PREVIEW', C.dim, { size: 10.5, ui: true, weight: 700 }));
  b.push(rect(490, top + 102, w - 518, 130, C.panel, { rx: 10, stroke: C.border }));
  // Nerd Font style glyphs are drawn as paths: the README must render the same
  // on machines that do not have a patched font installed.
  b.push(`<g fill="none" stroke="${C.accent}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M512 ${top + 122} l11 10 -11 10" />
    <path d="M544 ${top + 124} v14" />
    <path d="M544 ${top + 131} h8 a4 4 0 0 0 4 -4 v-3" />
    <circle cx="544" cy="${top + 121}" r="2.4" fill="${C.accent}" />
    <circle cx="544" cy="${top + 141}" r="2.4" fill="${C.accent}" />
    <circle cx="556" cy="${top + 117}" r="2.4" fill="${C.accent}" />
    <path d="M572 ${top + 140} v-18 h7 l3 4 h11 v14 z" />
    <path d="M606 ${top + 141} v-21 M606 ${top + 122} q9 -6 18 0 q-9 6 -18 0" />
  </g>`);
  b.push(block(510, top + 132, [
    [['                     ', C.accent], ['powerline + icon glyphs render', C.fg]],
    [['0O1lI  ', C.fg], ['=> != >= <=  ', C.green], ['\u2588\u2593\u2592\u2591', C.muted]],
    [['PS ', C.magenta], ['~\\bitig', C.blue], ['> ', C.accent], ['git status', C.fg]]
  ], { lh: 30 }));
  b.push(txt(490, h - 46, 'Font size', C.fg, { size: 12.5, ui: true, weight: 600 }));
  b.push(rect(570, h - 58, 260, 6, C.border, { rx: 3 }));
  b.push(rect(570, h - 58, 120, 6, C.accent, { rx: 3 }));
  b.push(`<circle cx="690" cy="${h - 55}" r="8" fill="${C.accent}" />`);
  b.push(txt(848, h - 46, '14 px', C.accent, { size: 12, ui: true }));
  write('16-fonts.svg', svg(id, w, h, win({
    w, h, id, tabs: [], title: 'Bitig \u00B7 Settings \u00B7 Font', body: b.join('\n  ')
  }), 'Font picker with measured Nerd Font coverage'));
}

/* ── 17. Transparency and background image ──────────────────────────── */
{
  const w = 1000, h = 460, id = 'tr';
  const b = [];
  b.push(`<defs>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#243b55"/><stop offset="0.5" stop-color="#3d2b56"/><stop offset="1" stop-color="#141e30"/>
    </linearGradient>
  </defs>`);
  b.push(rect(0.5, 0.5, w - 1, h - 1, 'url(#wall)', { rx: 12, stroke: C.border }));
  b.push(`<g clip-path="url(#clip-tr)">`);
  // faux mountains for the wallpaper
  b.push(`<path d="M0 ${h} L200 ${h - 180} L340 ${h - 60} L520 ${h - 240} L700 ${h - 90} L860 ${h - 200} L1000 ${h} Z" fill="#0b1220" opacity="0.55" />`);
  b.push(`<circle cx="820" cy="90" r="46" fill="#ffffff" opacity="0.12" />`);
  // window with transparency
  const wx = 70, wy = 46, ww = w - 140, wh = h - 110;
  b.push(rect(wx, wy, ww, wh, C.bg, { rx: 12, opacity: 0.82 }));
  b.push(rect(wx + 0.5, wy + 0.5, ww - 1, wh - 1, 'none', { rx: 12, stroke: C.border }));
  b.push(rect(wx, wy, ww, TB, C.titlebar, { rx: 12, opacity: 0.9 }));
  b.push(rect(wx, wy + 26, ww, 12, C.titlebar, { opacity: 0.9 }));
  b.push(line(wx, wy + TB + 0.5, wx + ww, wy + TB + 0.5, C.border));
  b.push(rect(wx + 12, wy + 6, 130, TB - 12, C.bg, { rx: 7, opacity: 0.6, stroke: C.border }));
  b.push(rect(wx + 22, wy + 8, 110, 2, C.accent, { rx: 1 }));
  b.push(txt(wx + 40, wy + TB / 2 + 4.5, 'bitig', C.fg, { size: 12, ui: true }));
  b.push(txt(wx + 26, wy + TB / 2 + 4.5, '\u276F', C.accent, { size: 10 }));
  b.push(block(wx + 22, wy + TB + 36, [
    [...PS('C:\\dev\\bitig'), ['bitig --version', C.fg]],
    [['  Bitig 1.0.4  \u00B7  Electron 43  \u00B7  Windows 11 x64', C.muted]],
    null,
    [['  appearance.opacity            ', C.dim], ['0.82', C.accent]],
    [['  appearance.backgroundImage    ', C.dim], ['ridge.png', C.accent]],
    [['  appearance.backgroundImageFit ', C.dim], ['cover', C.accent]],
    null,
    [...PS('C:\\dev\\bitig')]
  ]));
  b.push(rect(wx + 22 + width('PS C:\\dev\\bitig> '), wy + TB + 36 + 7 * LH - 12, 8, 16, C.accent, { opacity: 0.85 }));
  b.push(txt(w / 2, h - 26, 'window transparency and the background image are independent \u2014 either one alone, or both together', C.muted, { size: 11.5, ui: true, anchor: 'middle' }));
  b.push('</g>');
  write('17-transparency.svg', svg(id, w, h, b.join('\n  '), 'Window transparency and background image'));
}

/* ── 18. Notifications / telemetry ──────────────────────────────────── */
{
  const w = 1000, h = 400, id = 'nt';
  const top = TB + 1;
  const b = [];
  b.push(block(24, top + 38, [
    [...PS('C:\\dev\\bitig'), ['npm run dist', C.fg]],
    [['  \u2713 packaging NSIS target', C.green]],
    [['  \u2713 packaging portable target', C.green]],
    [['  built 2 targets in ', C.muted], ['3 m 41 s', C.yellow]],
    null,
    [...PS('C:\\dev\\bitig')]
  ]));
  b.push(badge(24 + width('  built 2 targets in 3 m 41 s') + 16, top + 38 + 3 * LH - 4, 'exit 0 \u00B7 3m41s', C.green));
  // toast
  const tx = w - 400, ty = top + 30;
  b.push(rect(tx, ty, 366, 92, C.panelHi, { rx: 10, stroke: '#2a2f3c' }));
  b.push(rect(tx, ty, 4, 92, C.green, { rx: 2 }));
  b.push(txt(tx + 22, ty + 30, 'Bitig', C.muted, { size: 11, ui: true, weight: 700 }));
  b.push(txt(tx + 22, ty + 54, 'npm run dist finished', C.fg, { size: 13, ui: true, weight: 600 }));
  b.push(txt(tx + 22, ty + 74, 'exit code 0 \u00B7 3 m 41 s \u00B7 tab "bitig"', C.muted, { size: 11.5, ui: true }));
  b.push(txt(tx + 344, ty + 24, '\u00D7', C.dim, { size: 13, anchor: 'end' }));
  b.push(txt(24, h - SB - 24, 'native Windows notification when a command that ran longer than the threshold finishes in an unfocused tab', C.dim, { size: 11, ui: true }));
  write('18-notifications.svg', svg(id, w, h, win({
    w, h, id, tabs: [{ title: 'bitig', icon: '\u276F' }, { title: 'api', icon: '\u276F' }],
    status: [{ text: 'PowerShell 7' }, { text: 'last command 3m41s', color: C.yellow }, { text: 'notifications: > 5 s' }],
    body: b.join('\n  ')
  }), 'Execution telemetry and desktop notifications'));
}
