# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [0.9.8] - 2026-08-20

### Added

- **"Bitig Bilge" — AI Terminal Companion (`Ctrl+I`):**
  - `src/main/ai/aiService.ts`: Native fetch-based AI service supporting **Ollama** (`http://localhost:11434` %100 local), **OpenAI**, **Anthropic Claude**, **Google Gemini**, **DeepSeek**, and custom OpenAI-compatible endpoints.
  - `src/renderer/src/bilgeModal.ts`: Glassmorphic interactive modal (`Ctrl+I`) for natural language to shell command generation and error explanation.
  - Press `Enter` to inject & execute the generated command in active terminal, `Tab` to insert without execution for manual editing, `Esc` to close.
  - Privacy-First & BYOK: All API keys stored locally in `%APPDATA%/Bitig/settings.json`, zero cloud telemetry.
- **Settings Panel AI / Bilge Configuration Section:**
  - Configurable provider selection, API endpoint URL, BYOK API key input with toggle masking, model selector, and live connection test button (`⚡ Bağlantıyı Test Et`).
  - Command Palette integration: `Bitig Bilge (AI Asistan)` listed in universal palette actions.

## [0.9.5] - 2026-08-20

### Added

- **Quake / Dropdown HUD Mode (`Win+~` / `Ctrl+~`):**
  - `src/main/ipc/quakeHandlers.ts`: Global OS-level shortcut (`globalShortcut`) listener for instant terminal access from any app.
  - Dedicated always-on-top HUD window sliding down from the top edge of the primary monitor.
  - IPC channels `quake:toggle` and `quake:set-hotkey` for runtime control and custom keybinding configuration.
  - `autoHideOnBlur` support to auto-collapse when focus is lost.
- **Broadcast Input Mode (`Alt+Shift+I`):**
  - Keystroke mirroring across all active split panes in the current tab simultaneously.
  - Visual synchronized HUD banner (`#broadcast-banner`) with a pulsing neon red border (`body.broadcast-active::before`).
  - Action `broadcast.toggle` added to central action registry with customizable keybindings.

## [0.9.0] - 2026-08-19

### Added

- **Developer Cockpit & Live Port Sniffer:**
  - `src/renderer/src/portSniffer.ts`: Real-time detection of dev servers and listening network ports (`localhost:3000`, `5173`, `8080`, `0.0.0.0:8000`, etc.) from PTY output streams.
  - Interactive clickable port badges rendered directly inside tab headers (`🟢 :5173`) with pulsing animations.
  - Clicking any port badge opens `http://localhost:[port]` directly in the default web browser via `window.bitig.cockpit.openUrl`.
- **Smart File/Line Hyperlinks:**
  - `src/renderer/src/smartLinks.ts`: Integrated custom link provider for xterm.js matching stack traces and compiler error patterns (`src/main.ts:42:15`, `C:\...\server.py:102`).
  - Clicking automatically opens the file in VS Code (`vscode://file/...:line:col`) or the default editor.
- **Secret Shield (Sensitive Token Masking):**
  - `src/renderer/src/secretShield.ts` & `src/main/history/historyStore.ts`: Automatic pattern matching for sensitive tokens (OpenAI `sk-...`, GitHub `ghp_...`, AWS `AKIA...`, private keys, bearer tokens).
  - Automatically sanitizes and masks credentials when saved to command history (`ghp_************`) to prevent shoulder surfing and screen share leaks.
- **Settings Panel Developer Cockpit Section:**
  - Toggles for Live Port Sniffer, Secret Shield token masking, and Editor link integration.

## [0.8.5] - 2026-08-19

### Added

- **Cross-Session Command History (`history.json`):**
  - Persistent command store in `%APPDATA%/Bitig/history.json` via `src/main/history/historyStore.ts`.
  - Captures executed commands, timestamp, execution count, working directory (`cwd`), last duration (`lastDurationMs`), and exit code.
  - Frecency algorithm prioritizing recently and frequently used commands.
- **In-Terminal Interactive `Ctrl+R` Fuzzy History Search:**
  - Fast history search modal overlay above the active terminal prompt (`src/renderer/src/historyModal.ts`).
  - Fuzzy-filters past commands with execution count badges (`3x`), duration badges (`4.2s`), and relative timestamps.
  - Press `Enter` to inject the selected command directly into the active terminal, `Escape` to close, or clear history with confirmation.
- **Command Execution Telemetry & Long-Running Task Desktop Notifications:**
  - `src/renderer/src/telemetry.ts` measures command runtimes across all panes.
  - When commands exceed the configured threshold (default: 5 seconds) and Bitig is running in the background or unfocused, triggers native Windows notifications (`windowControls.notify`): `✅ Komut Tamamlandı ("npm run build" (14.2s))`.
  - Clicking the notification automatically focuses and restores the Bitig window.
- **Settings Panel Telemetry Controls:**
  - Toggle for task completion notifications.
  - Configurable notification threshold dropdown (3s, 5s, 10s, 30s, 1m).

## [0.8.0] - 2026-08-19

### Added

- **Universal Command Palette (`Ctrl+Shift+P`):**
  - Instant fuzzy search modal powered by `src/renderer/src/fuzzy.ts`.
  - Searches across all Bitig actions, open tabs, discovered shell profiles, themes, and settings.
  - Arrow key navigation with wrap-around, action execution on Enter, keyboard shortcuts and category badges displayed on the right.
- **"Bitig Betik" — Parametric Runbook / Snippet Manager (`Ctrl+Shift+B`):**
  - Local snippet manager backed by `%APPDATA%/Bitig/snippets.json` and `src/main/snippets/snippetStore.ts`.
  - Built-in library of 10 essential multi-parameter snippets (Docker Run Port & Volume, Docker Compose Up, Git Rebase Interactive, Git Commit, FFmpeg H.264 Convert, Windows Port Kill, Find Large Files, Kubectl Pod Logs, etc.).
  - **Dynamic Parametric Form:** Automatically extracts placeholders (`{{var_name}}`) from command templates and generates visual input fields with Tab navigation.
  - **Live Command Preview:** Real-time highlighted preview box showing the fully composed command with variable substitutions.
  - **Terminal Injection:** Pressing Enter injects the rendered command directly into the active PTY session (`writeToActivePane`).
  - **Snippet Management:** Add new custom templates, categorize, and persist locally via IPC (`snippets:list`, `snippets:save`, `snippets:delete`, `snippets:reset`).

## [0.7.5] - 2026-08-19

### Added

- **Customizable Keyboard Shortcuts & Central Action Registry:**
  - `src/shared/actionTypes.ts`: Central action registry defining stable action IDs (`tab.new`, `tab.close`, `pane.splitRight`, `pane.zoom`, `terminal.search`, `theme.cycle`, `settings.toggle`, `profile.open1`..`9`), categories, human-readable descriptions, and default key combinations.
  - `src/renderer/src/keybindings.ts`: Unified `KeybindingManager` handling action dispatch, dynamic key binding maps, conflict detection, and xterm reserved key resolution (`attachCustomKeyEventHandler`).
  - Settings panel **Klavye Kısayolları (Keybindings)** section:
    - Categorized table of all shortcuts (Sekmeler, Paneller, Görünüm ve Arama, Uygulama).
    - Interactive key capture: click a keybinding button to enter recording mode with a pulsing animation, press any key combination to rebind.
    - Live conflict detection: displays a warning badge (`⚠ Çakışıyor: [Action]`) when a key combination is already bound to another action.
    - Reset to default button per shortcut (`↺`) and global settings reset.
  - `settings.keybindings` persisted to `settings.json` and hot-reloaded across the app.
  - Added `Ctrl+,` shortcut to toggle the Settings panel.

## [0.7.0] - 2026-08-19

### Added

- **Shell Profiles & Auto-Discovery:**
  - Automatic detection of installed shells on Windows (`pwsh.exe`, `powershell.exe`, `cmd.exe`, Git Bash `bash.exe`, and installed WSL distributions via `wsl.exe -l -q`).
  - New Tab dropdown menu next to the `+` button in the titlebar listing all discovered shell profiles with their icons and shortcuts.
  - Direct shortcut launch: `Ctrl+Shift+1..9` opens a new tab with the Nth profile immediately.
  - Settings panel **Kabuk Profilleri (Profiles)** section: set default shell profile, view configured commands and starting directories.
  - PTY manager extended to support launching custom commands, arguments, and working directories per session.
- **In-Terminal Interactive Search (`Ctrl+F`):**
  - Integrated `@xterm/addon-search` into a floating, glassmorphic search overlay mounted on the focused terminal.
  - Search input with incremental matching, previous/next match navigation (`Enter`/`Shift+Enter`), match status, case-sensitivity toggle (`Aa`), regex toggle (`.*`), and whole-word toggle (`\b`).
  - Escape closes the search bar and returns focus to the terminal.
- **Directional Split Pane Navigation & Focused Pane Zoom:**
  - Keyboard navigation between split panes: `Alt+Left/Right/Up/Down` and `Alt+H/J/K/L` move focus to adjacent panes using a geometric center-distance calculation.
  - Pane Zoom (`Ctrl+Shift+Z`): expands the focused pane to 100% full area, temporarily hiding sibling panes, and toggles back to split layout with a visual `[🔍]` badge.
- **Dynamic Tab Titles & CWD Tracking (OSC 7):**
  - Tab titles automatically update to match the foreground process or shell title reported via `terminal.onTitleChange`.
  - OSC 7 working directory parser hook tracks the active directory, allowing splits and new tabs to inherit the current directory.

## [0.6.x] - 2026-08-19

### Added

- Font picker with measured Nerd Font detection, in the settings panel's
  new Font section: choose any installed monospace family, set the size,
  and see a live preview rendering both sample terminal text and a row of
  Nerd Font icons in that font. Fonts that actually contain the icon
  glyphs are marked `(Nerd Font)` in the dropdown; ones that do not get a
  non-blocking notice linking to nerdfonts.com, so a missing-icon prompt
  is discovered here rather than in a broken shell prompt.
  - Detection is measured, not name-matched: each candidate renders four
    Private Use Area probe codepoints (Powerline, Devicons, two Font
    Awesome) to an offscreen canvas and compares each against a
    known-missing codepoint drawn with the same font stack. All four must
    render distinctly, which correctly separates a full Nerd Font from a
    font like Cascadia Code that ships Powerline glyphs only.
  - The list is filtered to monospace families by comparing `i` and `W`
    advance widths, so the picker offers usable terminal fonts rather
    than all ~280 installed families.
  - New `fonts:list` IPC channel enumerates installed families in main
    via .NET's `InstalledFontCollection`, cached for the process
    lifetime.
  - Font and size persist as `terminal.fontFamily` / `terminal.fontSize`
    in `settings.json` and apply to every open tab and pane immediately,
    re-fitting each pane and pushing a `pty:resize` (a font change alters
    the cell grid, unlike a theme change).
  - The chosen family always gets a fallback chain appended, so removing
    the font later cannot leave the terminal rendering in a proportional
    face.
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
