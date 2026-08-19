# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Tabs: multiple independent terminal sessions in one window, each with its
  own real PTY process. New `src/renderer/src/tabs.ts` (`TabStore`) owns
  tab lifecycle (create/close/switch), renders the tab bar, and dispatches
  PTY output to the correct tab via a single shared `pty:data`/`pty:exit`
  listener rather than one listener per tab. Required no changes to
  `src/main/**` or `src/preload/**`, since `PtyManager` already tracked
  sessions in an id-keyed map.
  - Drag-to-reorder tabs via the native HTML5 Drag and Drop API.
  - Windows Terminal-style keyboard shortcuts: `Ctrl+Shift+T` (new tab),
    `Ctrl+Shift+W` (close active tab), `Ctrl+Tab` / `Ctrl+Shift+Tab`
    (next/previous tab), intercepted per-terminal via `xterm.js`'s
    `attachCustomKeyEventHandler` so they never leak through as literal
    shell input.
  - Closing the last remaining tab closes the window, matching Windows
    Terminal behavior.
  - `src/renderer/src/main.ts` reduced to a thin bootstrap (title bar +
    `TabStore` wiring); the single-terminal setup it used to contain moved
    into `TabStore.createTab()`.
- Custom, frameless application window: draggable title bar, minimize,
  maximize/restore (with dynamic icon), and close controls, all wired
  through a new `window:*` IPC namespace (`window:minimize`,
  `window:toggle-maximize`, `window:close`, `window:is-maximized`,
  `window:maximize-change`).
- Rounded window corners and drop shadow, implemented in CSS on a
  transparent `BrowserWindow` since the OS chrome is disabled.
- Dedicated `src/renderer/src/theme.ts` module holding the full ANSI color
  palette used by the terminal (background, cursor, selection, and all 16
  standard colors).
- `src/renderer/src/titlebar.ts` module: wires title bar buttons to the new
  window IPC channels and keeps the maximize icon in sync with actual
  window state.
- Terminal visual polish: Cascadia Code font stack, bar-style cursor,
  5000-line scrollback, and a dedicated padded wrapper (`#terminal-shell`)
  around the xterm.js mount point so padding no longer interferes with
  `FitAddon` size calculations.
- Bilingual documentation in a single `README.md` (English and Turkish
  sections, anchor-linked at the top), with an architecture diagram, IPC
  channel reference table, and a rendered SVG preview banner
  (`assets/banner.svg`).
- Internal developer reference for Git setup and day-to-day commands
  (`dev-docs/GIT-KURULUM-VE-KOMUTLAR.md`, Turkish, intentionally excluded
  from version control).

### Changed

- `.gitignore` expanded to exclude build artifacts (`build/`, `release/`),
  environment files (`.env*`), editor directories, and, notably,
  `CLAUDE.md` / `.claude/` / `dev-docs/` so that internal, developer-facing
  documentation never reaches the public GitHub repository.

## [0.1.0] - 2026-08-19

Initial working prototype.

### Added

- Project scaffold on top of `electron-vite`: separate TypeScript configs
  and build pipelines for the main, preload, and renderer processes
  (`tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`).
- Real shell integration: `PtyManager` (`src/main/pty/ptyManager.ts`) spawns
  a Windows PowerShell process through `node-pty`'s ConPTY backend, with
  create/write/resize/dispose lifecycle management.
- Typed IPC contract for PTY sessions (`src/shared/ptyTypes.ts`,
  `pty:create`, `pty:write`, `pty:resize`, `pty:dispose`, `pty:data`,
  `pty:exit`), registered in `src/main/ipc/ptyHandlers.ts` and exposed to
  the renderer through a narrow `contextBridge` surface
  (`window.bitig.pty`) in `src/preload/index.ts`.
- Minimal renderer: a single `@xterm/xterm` instance with `FitAddon` and
  `WebLinksAddon`, connected end to end to the PTY session
  (`src/renderer/src/main.ts`).
- Security defaults locked in from the start: `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, external links routed through
  `shell.openExternal` instead of opening inside the app.
- `CLAUDE.md`: living architecture and contributor reference for future
  development sessions (vision, folder structure, IPC conventions, code
  style, roadmap).
- `.claudeignore` to keep build artifacts and dependencies out of AI tool
  context.

### Fixed

- Removed an accidental typosquat dependency (`electrion`, npm's official
  typo-guard placebo package) that had been installed in place of the real
  `electron` package; replaced with `electron@43` and verified the ConPTY
  binary path end to end.
- Migrated from the deprecated `xterm` / `xterm-addon-*` packages to their
  maintained `@xterm/*` scoped successors.

[Unreleased]: https://github.com/sametgurtuna/bitig/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sametgurtuna/bitig/releases/tag/v0.1.0
