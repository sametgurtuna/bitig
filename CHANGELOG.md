# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Settings panel (GUI), Appearance section: a gear button in the title bar
  opens a view (`src/renderer/src/settingsPanel.ts`) that replaces
  `#terminal-shell` in place - a clickable theme grid, an opacity slider,
  and a background image picker backed by a real native
  `dialog.showOpenDialog` (`settings:pick-background-image`), closing out
  the file-picker item deferred back in the transparency/background-image
  work. Sliders preview instantly via
  `AppearanceController.previewOpacity`/`previewBackgroundImageStyle`
  without waiting on an IPC round trip, and only persist
  (`settings:set`) once the drag ends, so dragging a slider doesn't write
  `settings.json` on every frame. A "Varsayilanlara don" button resets
  everything through a new `SettingsStore.reset()` / `settings:reset`.
  Closes with Escape (only listened for while the panel is open, so it
  never intercepts Escape inside a terminal) or the gear button again.
- Theme system: JSON-schema based themes (`src/shared/themeTypes.ts`)
  replace the single hardcoded terminal palette. Four built-in themes
  (`src/shared/builtinThemes/`: Bitig Dark, Bitig Light, a Dracula-style
  palette, a Nord-style palette) plus user themes dropped into
  `%APPDATA%/Bitig/themes/*.json`, loaded and hot-reloaded by a new
  main-process `ThemeStore`. Malformed user theme files are skipped with a
  logged error, never a crash. `Alt+Shift+T` cycles through all available
  themes; new tabs and splits pick up the current theme automatically
  (`TabStore.applyTerminalTheme`).
- Transparency and background image support: `appearance.opacity` (CSS
  `rgba` alpha on the app's own background, clamped to `[0.3, 1]` so the
  window can never become fully invisible or unclickable) and
  `appearance.backgroundImage`/`backgroundImageOpacity`/`backgroundImageFit`,
  rendered as a `#bg-image` layer behind the entire window including the
  title bar (which gained a `text-shadow`/icon drop-shadow so it stays
  legible over arbitrary images). Background images are read in the main
  process and handed to the renderer as `data:` URLs
  (`settings:read-background-image`), then downscaled client-side (capped
  at 1920px) before use.
- A minimal `SettingsStore` (`src/main/settings/settingsStore.ts`),
  foreshadowed since milestone 1's `CLAUDE.md`: persists
  `%APPDATA%/Bitig/settings.json`, deep-merges partial updates, and
  hot-reloads hand-edits. There is no settings-panel GUI yet (that's
  milestone 6) - hand-editing `settings.json` plus the theme-cycle
  shortcut are the only ways to change appearance for now, by design.
- New IPC namespaces: `theme:list` / `theme:list-changed`, and
  `settings:get` / `settings:set` / `settings:changed` /
  `settings:read-background-image`, exposed via `window.bitig.theme` and
  `window.bitig.settings`.
- `app.setName('Bitig')` added as the first statement in
  `src/main/index.ts` so `app.getPath('userData')` resolves to exactly
  `%APPDATA%/Bitig/`, matching what `CLAUDE.md` had already documented.

- Split panes: a tab's content area can now be divided horizontally or
  vertically into multiple independent terminals. New
  `src/renderer/src/panes.ts` introduces a `PaneNode` tree
  (`PaneLeaf | PaneSplit`) per tab, with pure `splitLeaf` /
  `closeLeafFromTree` tree operations and a `renderPaneTree` function that
  rebuilds split/divider DOM on every change while moving (never
  recreating) existing leaf containers, so `xterm.js` canvases and
  scrollback survive re-renders. `src/renderer/src/tabs.ts`'s `TabStore`
  was refactored accordingly: a tab now owns a pane tree instead of a
  single terminal, and tab ids are client-generated
  (`crypto.randomUUID()`), decoupled from PTY session ids now that one tab
  can contain several PTY sessions.
  - Keyboard shortcuts: `Alt+Shift+D` (split right), `Alt+Shift+E` (split
    down), `Ctrl+Shift+X` (close the focused pane). Splitting is
    keyboard-only in this pass, no hover UI button.
  - Draggable dividers (plain `mousedown`/`mousemove`/`mouseup`, no Pointer
    Events needed) resize panes live, clamped to a 10%/90% ratio so a pane
    can never be dragged down to zero size.
  - Every pane's size is tracked by its own `ResizeObserver`
    (rAF-debounced), which calls `FitAddon.fit()` and `pty:resize`
    whenever the pane's actual container size changes - covering window
    resizes and divider drags alike with no per-interaction resize code.
  - Closing a pane collapses its parent split and promotes the sibling up;
    closing a tab's last pane closes the tab itself, reusing the
    last-tab-closed-closes-the-window behavior from tabs.
  - Directional focus movement (Alt+Arrow between panes) was intentionally
    left out of this pass; focus currently changes via mouse click only.
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
  - Middle-click on a tab closes it (`auxclick`), matching standard browser
    tab behavior.
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

- Tab bar moved into the title bar itself, next to the app name, instead of
  a separate strip underneath it: one row instead of two, less visual
  weight. The tab list scrolls horizontally on overflow; the title bar's
  remaining empty space stays a window drag region.
- `panes.ts`'s `createPaneLeaf` now takes the active terminal theme as a
  parameter instead of importing a hardcoded constant, so every new tab
  and split opens with whatever theme is currently active.
- `.gitignore` expanded to exclude build artifacts (`build/`, `release/`),
  environment files (`.env*`), editor directories, and, notably,
  `CLAUDE.md` / `.claude/` / `dev-docs/` so that internal, developer-facing
  documentation never reaches the public GitHub repository.

### Removed

- `src/renderer/src/theme.ts` (the hardcoded `BITIG_TERMINAL_THEME`
  constant added in `0.1.0`), superseded by
  `src/shared/builtinThemes/bitigDark.ts` under the new theme system.

### Fixed

- Transparency and background image did not actually work: the terminal
  area stayed fully opaque, hiding both. Three separate opaque layers were
  covering them, each found and fixed by testing the running app:
  - `xterm.js` paints its own opaque background by default. Fixed with
    `allowTransparency: true` plus a zero-alpha theme background, so the
    color comes from a single CSS layer instead.
  - `@xterm/xterm`'s own stylesheet hardcodes
    `.xterm-viewport { background-color: #000 }` (a macOS scrollbar
    workaround). This was the subtle one - it painted the terminal area
    solid black, leaving the background image visible only in the 12px
    padding strip around it. Now explicitly overridden to `transparent`.
  - `#app` and `#terminal-shell` both painted a background, stacking two
    alpha layers. Painting is now done once, by `#app`.
- Background image is no longer hidden when opacity is `1`: `#bg-image`
  sits above the window's background color but below the content layers,
  so image and window transparency are independent settings (matching
  Windows Terminal) rather than the image only showing through a
  semi-transparent window.
- `fs.watch`-based hot reload (both `SettingsStore` and `ThemeStore`) is
  debounced 100ms. Caught during manual testing, not theoretical: a single
  file save can fire multiple `fs.watch` events for its intermediate write
  steps, and reading the file on the first event could catch it mid-write,
  parse-fail, and permanently fall back to defaults in memory until the
  next real change - even though the file on disk was correct the whole
  time. The debounce reads only the settled state.

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
