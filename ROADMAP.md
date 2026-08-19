# Bitig Roadmap

This document expands the short checklist in `README.md` into a detailed,
working plan: what each milestone actually contains, why it is ordered where
it is, the technical approach, the concrete sub-tasks, and what "done" looks
like. It is a living document; expect sections to be rewritten as design
decisions are made and revisited once real usage exposes wrong assumptions.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

## Guiding Principles

These hold across every milestone below and should be the tie-breaker when a
design decision is not obvious:

1. **Main owns state, renderer owns pixels.** Process lifecycle, PTY
   sessions, settings persistence, and file I/O live in the main process.
   The renderer receives data through IPC and never reaches for Node or the
   filesystem directly.
2. **The IPC surface is the API.** Every new capability is added as a
   typed channel in `src/shared/*.ts` before it is wired up anywhere else.
   If a feature cannot be described as a small set of channels, it is
   probably too coupled to the renderer's internal state and needs
   rethinking.
3. **No feature ships without a working keyboard path.** Mouse-only
   interactions are acceptable as an addition, never as the only way to
   perform a core action (new tab, close pane, switch focus, open
   settings).
4. **Settings are data, not code.** Anything user-configurable is JSON
   under `%APPDATA%/Bitig/`, versioned with a `schemaVersion` field, never
   a TypeScript object baked into a build.
5. **Small, reversible steps.** Each milestone should be shippable on its
   own; a half-built split-pane system should not block tab support from
   being usable.

## Milestone Overview

| # | Milestone | Depends on | Target version |
|---|---|---|---|
| 1 | Minimal terminal | - | `0.1.0` (done) |
| 2 | Tabs | 1 | `0.2.0` (done) |
| 3 | Split panes | 2 | `0.3.0` (done) |
| 4 | Theme system | 1 | `0.4.0` (done) |
| 5 | Transparency and background image | 4 | `0.5.0` (done) |
| 6 | Settings panel (GUI) | 4, 5 | `0.6.0` (done, Appearance only) |
| 7 | Nerd Font detection and font picker | 6 | `0.6.x` (done) |
| 8 | Shell profiles, auto-discovery & in-terminal search | 6 | `0.7.0` (done) |
| 9 | Customizable keyboard shortcuts & action registry | 6, 8 | `0.7.5` (done) |
| 10 | Command palette & runbooks ("Bitig Betik") | 8, 9 | `0.8.0` (done) |
| 11 | Command history, fuzzy search & execution telemetry | 2, 8 | `0.8.5` (done) |
| 12 | Developer cockpit, live port sniffer & secret shield | 8, 10 | `0.9.0` (done) |
| 13 | Quake / Dropdown HUD mode & broadcast input | 3, 9 | `0.9.5` |
| 14 | AI terminal companion ("Bitig Bilge" - Local & BYOK) | 8, 11 | `0.9.8` |
| 15 | Lightweight plugin system & sandboxing | 9, 10 | `1.0.0-rc` |
| 16 | Packaging, installer & auto-updater | all | `1.0.0` |

Milestones can be built iteratively; each milestone represents a self-contained, tested, and deliverable capability.

---

## 1. Minimal Terminal - done

**Goal:** a single window, a single real shell process, full keyboard
input, readable output.

**Shipped:**

- `PtyManager` (`src/main/pty/ptyManager.ts`) spawning PowerShell through
  `node-pty`'s ConPTY backend.
- `pty:*` IPC namespace (create, write, resize, dispose, data, exit).
- A single `@xterm/xterm` instance wired end to end in
  `src/renderer/src/main.ts`.
- A custom frameless window with title bar and window controls
  (`window:*` IPC namespace).
- A hand-authored terminal color theme (`src/renderer/src/theme.ts`).

**Known limitations carried into later milestones:**

- Shell is hardcoded to `powershell.exe` (see milestone 6: shell choice
  belongs in settings).
- Exactly one PTY session can exist; the `PtyManager` map already supports
  multiple sessions by id, but nothing in the renderer creates more than
  one yet (see milestone 2).

---

## 2. Tabs - done

**Goal:** open, close, rename, and switch between multiple independent
terminal sessions in one window, each with its own PTY.

**Implemented in:** `src/renderer/src/tabs.ts` (`TabStore`), wired from
`src/renderer/src/main.ts`. No main-process or IPC changes were needed, as
anticipated below. Rename-on-double-click and the close confirmation dialog
were intentionally left out of this pass (see Sub-tasks); drag-to-reorder
was pulled in from a later idea and shipped now instead.

### Why now

`PtyManager` already keys sessions by id and `pty:create` already returns
an id per call; tabs are mostly a renderer-side state and UI problem, not a
main-process one. This makes it the cheapest big feature to build next.

### Design

- Introduce a `TabStore` in the renderer (a minimal hand-written observable
  store, no framework dependency yet - matches the "small custom store"
  decision in `CLAUDE.md`) holding:
  ```ts
  interface TabState {
    id: string;        // matches the PTY session id
    title: string;      // user-set or derived from the running process
    terminal: Terminal;   // the xterm.js instance for this tab
    fitAddon: FitAddon;
  }
  ```
- One `xterm.js` instance per tab, created on tab open and disposed on tab
  close (`terminal.dispose()` plus `pty:dispose`). Instances for inactive
  tabs stay alive in memory but are not mounted to the DOM (mounting or
  unmounting the container, not tearing down and rebuilding xterm, avoids
  losing scrollback when switching tabs).
- A tab bar rendered below the title bar (`#tabbar`, new element in
  `index.html`), styled consistently with the existing title bar (same
  background family, same hover language).
- Tab title defaults to the shell name (`powershell.exe` for now) and can
  later reflect the foreground process once OSC 7 / OSC 9 title-reporting
  is parsed from PTY output (a real, common xterm.js pattern:
  `terminal.onTitleChange`).

### Sub-tasks

- [x] Add `TabStore` with `createTab`, `closeTab`, `setActiveTab`. Renaming
      a tab (`renameTab`) was not built in this pass; tab titles are
      currently a static "PowerShell" label. Revisit once OSC title
      reporting (see Design note above) or a double-click-to-rename
      interaction is worth adding.
- [x] Render tab bar UI: tab list, active-state styling, close button per
      tab, "+" button to open a new tab.
- [x] Keyboard shortcuts: new tab (`Ctrl+Shift+T`), close tab
      (`Ctrl+Shift+W`), next/previous tab (`Ctrl+Tab` / `Ctrl+Shift+Tab`).
      Hardcoded for now; milestone 8 makes them remappable.
- [x] Drag-to-reorder tabs (native HTML5 Drag and Drop API), pulled forward
      into this milestone rather than deferred.
- [x] Middle-click on a tab closes it (`auxclick`, standard browser tab
      convention), in addition to the explicit close button.
- [x] Tab bar merged directly into the title bar, next to the app name,
      instead of a separate strip below it - one row instead of two,
      matching a request to reduce visual weight. The tab list scrolls
      horizontally on overflow; the title bar's remaining empty space
      stays a drag region.
- [ ] Confirm-before-close when a tab has a running foreground process
      other than the shell itself. Deliberately deferred: closing a tab
      kills its PTY immediately, even mid-process. Tracked as a follow-up,
      not a blocker for this milestone.
- [x] Handle the last-tab-closed case: closing the only remaining tab
      closes the window (matches Windows Terminal behavior) rather than
      leaving an empty shell.
- [x] `PtyManager.disposeAll()`'s existing per-session disposal is reused
      correctly: `TabStore.disposeAll()` (called on `beforeunload`) and
      `TabStore.closeTab()` each dispose PTY sessions by id through the
      existing `pty:dispose` channel; no main-process change was needed
      since `PtyManager` already tracked sessions in an id-keyed map.

### Acceptance criteria

- Opening a new tab starts a genuinely independent shell process (verified
  by running a long-lived command in tab A and confirming tab B is
  unaffected and immediately responsive).
- Closing a tab terminates its PTY process (verified via Task Manager or
  `Get-Process powershell`, process count drops by one).
- Switching tabs preserves scrollback and cursor position exactly as left.
- No memory growth from repeatedly opening and closing tabs (basic manual
  check: open/close 50 tabs, watch Electron's process memory in Task
  Manager, expect it to return close to baseline).

> Verified so far: typecheck (`tsc --noEmit` on both configs) and
> `electron-vite build` are clean, and the app launches in `npm run dev`
> with its first tab correctly spawning a real `powershell.exe` child
> process. Multi-tab interaction (opening several tabs, switching, drag
> reorder, closing) has not yet been manually exercised end-to-end in this
> environment and should be spot-checked per the criteria above before
> considering this milestone fully closed out.

---

## 3. Split Panes - done

**Goal:** divide a tab's content area into multiple panes, each an
independent terminal, arranged horizontally or vertically, resizable by
dragging the divider.

**Implemented in:** `src/renderer/src/panes.ts` (pane tree + rendering +
divider drag), wired into `src/renderer/src/tabs.ts` (`TabStore` now holds
a `PaneNode` tree per tab instead of a single terminal). Directional focus
movement was intentionally deferred (see Sub-tasks); split is
keyboard-triggered only, no on-hover UI button, matching the scope decided
before starting this milestone.

### Design

- A pane tree per tab, not a flat list: `type Pane = { kind: 'leaf'; termId:
  string } | { kind: 'split'; direction: 'row' | 'column'; children: [Pane,
  Pane]; ratio: number }`. This is the same structural approach used by
  every terminal with split panes (Windows Terminal, tmux, WezTerm) because
  it naturally supports nested splits (split a pane that is itself already
  a split).
- Rendering: a small recursive renderer that walks the pane tree and lays
  out `<div>` containers with CSS flexbox, one xterm.js instance mounted
  per leaf.
- Divider dragging updates `ratio` on the relevant split node and triggers
  `FitAddon.fit()` plus `pty:resize` on both affected leaves, debounced to
  the animation frame so a fast drag does not flood the PTY with resize
  calls.
- Focus model: exactly one pane is focused at a time; keyboard input goes
  to the focused pane's `xterm.js` instance. Clicking a pane focuses it.
  Directional focus movement (move focus left/up/down/right across the
  pane tree) is a real feature, not just "tab through panes" - the pane
  tree's geometry needs to be consulted to find the nearest neighbor in the
  requested direction.

### Sub-tasks

- [x] Define the pane tree data structure (`PaneNode = PaneLeaf | PaneSplit`
      in `panes.ts`) and pure functions `splitLeaf`, `closeLeafFromTree`,
      `collectLeaves`, `findLeaf` operating on it. `closeLeafFromTree`
      returns `null` when the tree's last leaf is closed, signaling the
      caller (`TabStore`) to close the whole tab.
- [x] Recursive renderer (`renderPaneTree`) for the pane tree: rebuilds
      wrapper/divider DOM on every split or close, but moves (never clones
      or recreates) existing leaf containers, so `xterm.js` canvases and
      scrollback survive every re-render.
- [x] Draggable divider (native mouse events, not pointer capture) with a
      10%/90% ratio clamp so a pane can never be dragged down to zero size.
      Pointer Events / `setPointerCapture` was not needed in practice - a
      document-level `mousemove`/`mouseup` pair during drag was sufficient
      and simpler.
- [x] Resize propagation via a `ResizeObserver` per leaf container
      (rAF-debounced), exactly as anticipated below: window resizes,
      divider drags, and tab switches all resize correctly with no
      special-cased resize logic per interaction. A defensive explicit
      fit+resize on tab activation was kept alongside it, since
      `display:none` to `block` transitions are not perfectly consistent
      across engines for `ResizeObserver`.
- [x] Close-pane behavior (`Ctrl+Shift+X`): closing a leaf collapses its
      parent split node, promoting the sibling up; closing a tab's last
      pane closes the tab itself (reuses the existing last-tab-closed →
      window-closes behavior from milestone 2).
- [ ] Directional focus movement and its keyboard shortcuts. Deliberately
      deferred (confirmed before starting this milestone): focus currently
      changes only via mouse click on a pane. Tracked as a follow-up, not
      a blocker.

### Acceptance criteria

- Splitting a pane horizontally and vertically, including splitting an
  already-split pane, produces the expected layout with no overlapping or
  clipped terminals.
- Resizing the outer window correctly re-fits every visible pane, not just
  the top-level ones.
- Dragging a divider all the way to one edge does not crash or orphan a
  PTY process; the minimum pane size clamp holds.
- Closing a pane cleanly disposes its `xterm.js` instance and its PTY
  session (verified the same way as the tab-close criterion above).

> Verified so far: typecheck (`tsc --noEmit` on both configs) and
> `electron-vite build` are clean, and the app launches in `npm run dev`
> with its first tab correctly spawning a real `powershell.exe` child
> process through the new `panes.ts` code path. Splitting, resizing via
> divider drag, closing a pane, and the keyboard shortcuts above have not
> yet been manually exercised end-to-end in this environment (see the
> same caveat under milestone 2) and should be spot-checked per the
> criteria above.

---

## 4. Theme System - done

**Goal:** move from the single hardcoded theme in
`src/renderer/src/theme.ts` to a JSON-based system with a handful of
built-in themes and support for user-authored themes, matching the
"Windows Terminal `settings.json`-like, but our own schema" direction
already set in `CLAUDE.md`.

**Implemented in:** `src/shared/themeTypes.ts` (schema),
`src/shared/builtinThemes/` (four built-ins as typed `.ts` modules, not
JSON - see Sub-tasks), `src/main/theme/themeStore.ts` (load + watch),
`src/renderer/src/appearance.ts` (apply + `Alt+Shift+T` cycle). No
settings-panel GUI exists yet (milestone 6), so `theme:set-active` as its
own channel was dropped: selecting a theme is just
`settings:set({ activeTheme: id })` through the general settings channel
built alongside this milestone (see milestone 5's `SettingsStore`, brought
forward since milestone 4 needed persistence too).

### Design

- Theme schema (versioned, JSON):
  ```jsonc
  {
    "schemaVersion": 1,
    "name": "Bitig Dark",
    "author": "Bitig",
    "terminal": {
      "background": "#0f1117",
      "foreground": "#d8dee9",
      "cursor": "#7dd3fc",
      "cursorAccent": "#0f1117",
      "selectionBackground": "#2d3444",
      "black": "#1a1c23", "red": "#f47067", /* ...full 16-color ANSI set... */
      "brightBlack": "#4b5263", "brightRed": "#ff9492" /* ... */
    },
    "ui": {
      "titlebarBackground": "#14161e",
      "titlebarText": "#8b93a7",
      "border": "#22252f",
      "accent": "#7dd3fc"
    }
  }
  ```
  Splitting `terminal` (consumed directly as an xterm.js `ITheme`, shape
  stays close to what xterm.js already expects to minimize translation
  code) from `ui` (consumed by the app chrome's CSS via injected custom
  properties) keeps the two concerns independently themeable.
- Built-in themes ship as JSON files under `resources/themes/` (bundled
  with the app, read-only), for example `bitig-dark.json`,
  `bitig-light.json`, plus two or three well-known community favorites
  reimplemented under this schema (Dracula- and Nord-style palettes are
  common, low-risk choices; exact colors would be re-derived from public
  palette values, not copied assets).
  **Deviation:** shipped as typed `.ts` modules
  (`src/shared/builtinThemes/*.ts`) instead of bundled JSON files. Since
  packaging (milestone 11) isn't done, resolving a `resources/` path
  correctly in both dev and a packaged build was extra complexity with no
  payoff yet; plain TS data modules work identically in both, need zero
  path resolution, and are importable synchronously from the renderer
  (used as the pre-IPC fallback) with no Node dependency. Built-in themes:
  Bitig Dark, Bitig Light, Dracula-style, Nord-style.
- User themes live in `%APPDATA%/Bitig/themes/*.json`, loaded at startup in
  addition to the built-ins, hot-reloaded when the file changes (a
  `fs.watch` on the themes directory in main, pushed to the renderer over a
  new `theme:list-changed` event) so editing a theme file updates the
  running app.
- Applying a theme writes `activeTheme: "<name>"` into the main settings
  file (see milestone 6) and pushes the resolved theme object to every open
  `xterm.js` instance via `Terminal.options.theme = ...` plus updates the
  injected CSS custom properties for the chrome.

### Sub-tasks

- [x] Define and document the theme JSON schema as a TypeScript type
      (`src/shared/themeTypes.ts`). A mirrored JSON Schema file for editor
      autocompletion was not built - there's no user-facing theme-authoring
      workflow promoted yet beyond "copy a built-in and edit it", so the
      autocompletion payoff didn't justify it this pass.
- [x] Main-process `ThemeStore`: loads built-ins, loads user themes, merges
      into one list, exposes `theme:list` and `theme:list-changed`. No
      `theme:get-active`/`theme:set-active` channels - "active" is a
      `settings.json` concern (`activeTheme` field), not a theme-list
      concern; see the note above.
- [x] Converted the hardcoded `BITIG_TERMINAL_THEME` into
      `src/shared/builtinThemes/bitigDark.ts`; added `bitigLight.ts`,
      `dracula.ts`, `nord.ts` alongside it.
- [x] Renderer: `AppearanceController` (`appearance.ts`) applies the active
      theme to every open `xterm.js` instance (via a new
      `TabStore.applyTerminalTheme`) and to the app chrome (CSS custom
      properties) on startup and on `theme:list-changed`/`settings:changed`.
- [x] File-watch based hot reload for user theme files, debounced (see
      `CLAUDE.md`'s "Bilinen Notlar" - a real bug caught during manual
      testing, not a theoretical concern).
- [x] Validation: malformed user theme JSON is skipped with a
      `console.error` naming the file, not a crash and not silently merged
      as a broken entry. Surfacing this in the UI itself is not possible
      yet without a settings panel; for now "visible" means the terminal
      running `npm run dev`, which is the only console available before
      milestone 6.

### Acceptance criteria

- Switching the active theme updates all open tabs and panes immediately,
  with no restart required.
- Dropping a new, valid theme JSON file into `%APPDATA%/Bitig/themes/`
  makes it selectable without restarting the app.
- Editing an already-selected user theme file on disk updates the running
  terminal's colors live.
- A malformed theme file produces a visible, specific error, not a blank
  terminal or an app crash.

> Verified so far: typecheck and `electron-vite build` are clean;
> `npm run dev` correctly creates `%APPDATA%/Bitig/settings.json` and
> `%APPDATA%/Bitig/themes/` with valid defaults on first launch. Hand-editing
> `settings.json` while the app is running was exercised directly (not just
> theoretically) - including an accidentally-malformed edit, which
> correctly logged an error and fell back to defaults without crashing, and
> a nonexistent `backgroundImage` path, which correctly logged an error and
> returned `null` without crashing. What was **not** visually confirmed in
> this environment: that switching themes actually repaints the terminal
> and title bar correctly on screen, and that `Alt+Shift+T` cycles as
> expected - the same screen-capture limitation noted in milestones 2/3
> applies here too.

---

## 5. Transparency and Background Image Support - done

**Goal:** window background transparency (already partially in place via
the frameless window from milestone 1) becomes a first-class, user-tunable
setting, plus optional background image support behind the terminal
content.

**Implemented in:** `src/shared/settingsTypes.ts` (schema),
`src/main/settings/settingsStore.ts` (load/merge/clamp/watch),
`src/main/ipc/settingsHandlers.ts` (`settings:read-background-image` reads
the image file in main and returns a `data:` URL, so the renderer never
gets raw filesystem access and the CSP stays `img-src 'self' data:` rather
than opening up `file:`), `src/renderer/src/appearance.ts` (applies
opacity as CSS `rgba` alpha and manages the `#bg-image` backdrop layer).
Per the scope agreed before starting: transparency is pure CSS (no
`backgroundMaterial`/acrylic), and the background image covers the entire
window including the title bar (the title bar gained a `text-shadow`/icon
drop-shadow for legibility over arbitrary images, see `style.css`).

### Design

- Extend the theme/settings schema with:
  ```jsonc
  {
    "appearance": {
      "opacity": 0.92,               // 0.0 - 1.0, applied to the window background
      "backgroundImage": null,         // absolute path or null
      "backgroundImageOpacity": 0.25,
      "backgroundImageFit": "cover"    // "cover" | "contain" | "center" | "tile"
    }
  }
  ```
- `opacity` is applied at the `BrowserWindow` compositing level where
  possible (Windows 11 acrylic/mica materials via Electron's
  `backgroundMaterial` option are the preferred path over manual
  `rgba()` transparency, since they get proper OS-level blur and
  performance); manual `rgba()` background stays as the fallback for
  cases where a vibrancy material is not desired (fully custom color, not
  a system material). **Deviation:** implemented as CSS `rgba()` only, by
  agreed scope - `backgroundMaterial` risked visual artifacts against the
  custom CSS-clipped rounded corners already in place since milestone 1,
  and `BrowserWindow` was already `transparent: true`, so a translucent
  CSS background genuinely shows the real desktop through the window with
  zero main-process wiring. No `window:set-opacity` channel exists;
  opacity is entirely a renderer-side concern derived from
  `settings.appearance.opacity`.
- Background image rendering happens in the renderer as a layer behind the
  xterm.js canvas (`z-index` below the terminal, `pointer-events: none`),
  never inside the terminal's own canvas, so it does not interfere with
  text rendering or performance. **Deviation:** by agreed scope, the layer
  sits behind the *entire window* (`#bg-image`, behind `#app`), not just
  the terminal area - it shows through both the terminal content and,
  where the title bar's own background is translucent, the title bar too.
- Large background images are downscaled once on load (via an offscreen
  canvas) rather than re-decoded on every repaint. Implemented client-side
  in `appearance.ts` (`downscaleImage`, capped at 1920px on the long edge)
  rather than in main, since the resize is cheap, one-shot, and keeping it
  in the renderer avoids adding an image-processing dependency to main.

### Sub-tasks

- [x] Extend settings schema (`src/shared/settingsTypes.ts`) with the
      fields above; `SettingsStore` (not a `ThemeStore` extension - themes
      and settings ended up as two separate stores, see milestone 4's
      note) owns persistence.
- [ ] Live `window:set-opacity`-style main-process channel. Not applicable
      given the CSS-only opacity approach above; there is nothing for main
      to do when opacity changes.
- [x] Background image picker flow (`dialog.showOpenDialog`). Deferred at
      the time this milestone was first built (there was no "Browse..."
      button to trigger it without a settings panel); implemented once
      milestone 6 added one - see `settings:pick-background-image` in
      `src/main/ipc/settingsHandlers.ts`.
- [x] Renderer background layer (`#bg-image` in `index.html` +
      `AppearanceController.applyBackgroundImage`) with all four fit
      modes (`cover`/`contain`/`center`/`tile`) and opacity.
- [x] Guardrails: `opacity` is clamped to `[0.3, 1]` in `SettingsStore`
      itself (not just the renderer), so no code path - hand-edited
      `settings.json` included - can make the window fully invisible or
      unclickable. A "Varsayılanlara dön" (reset) button was added to the
      settings panel in milestone 6 (`SettingsStore.reset()`,
      `settings:reset`), rather than only being achievable by manually
      deleting lines from the file.

### Acceptance criteria

- Opacity changes are visible immediately, with no visible flicker or
  window flash during the transition.
- A selected background image persists across app restarts and renders
  correctly at multiple window sizes without distortion for the "cover"
  and "contain" fit modes.
- Text in the terminal remains readable (sufficient contrast) with the
  default background image opacity; this is a manual visual check, not an
  automated one.

> Verified: typecheck, build, and real `%APPDATA%/Bitig/settings.json`
> hand-edit round-trips (including error paths). **On-screen appearance
> was also confirmed visually after the fact** - and doing so was
> necessary, because the first implementation of this milestone did not
> actually work: three separate opaque layers (xterm's own background,
> `@xterm/xterm`'s hardcoded `.xterm-viewport { background-color: #000 }`,
> and a doubled-up `#app`/`#terminal-shell` background) were covering both
> the transparency and the background image. All three are fixed and the
> result was verified by screenshotting the running window at
> `opacity: 0.55` (desktop visible through it) and with a background image
> at `opacity: 1` (image covering the full terminal area, text on top).
> See `CLAUDE.md`'s "Bilinen Notlar" for the layering rules this
> established.

---

## 6. Settings Panel (GUI) - done (Appearance only)

**Goal:** every setting introduced so far (shell choice, active theme,
appearance, and everything in milestones 7-9) becomes editable through a
GUI, with the underlying JSON file as the source of truth and manual
editing still fully supported.

**Implemented in:** `src/renderer/src/settingsPanel.ts` (`SettingsPanel`),
plus the `SettingsStore`/`ThemeStore` groundwork that was actually laid
back in milestones 4-5 (this milestone confirms that foresight paid off -
no store changes were needed beyond adding `reset()` and the
`dialog.showOpenDialog` picker handler). Scope was deliberately narrowed
before starting: **Appearance only** (theme, opacity, background image).
No General, Text, or Keyboard sections - there is nothing real to put in
them yet (shell choice isn't configurable, font isn't configurable until
milestone 7, shortcuts aren't remappable until milestone 8), and stub
"coming soon" controls were explicitly rejected as extra maintenance
weight with no payoff. **Deviation on entry point:** not a literal tab in
the tab strip (Windows Terminal's actual model) - a gear button in the
title bar toggles a full view that replaces `#terminal-shell` in place.
This was a deliberate trade-off, confirmed before starting: a real
"non-PTY tab" would have meant teaching `TabStore`'s PTY-centric data
model (every tab = a pane tree = one or more PTY sessions) about a tab
that isn't one, touching tab creation, closing, cycling, and drag-reorder
throughout `tabs.ts`. The gear-button overlay delivers the same "no more
hand-editing JSON" outcome with a much smaller, self-contained surface
(`settingsPanel.ts` alone, zero changes to `tabs.ts`/`panes.ts`).

### Design

- Settings persist to `%APPDATA%/Bitig/settings.json`, versioned with
  `schemaVersion`, loaded once at startup by a main-process
  `SettingsStore` (the module referenced but not yet built, per
  `CLAUDE.md`'s "Ayarlar / Temalar" section).
- IPC surface: `settings:get` (invoke, returns the full settings object),
  `settings:set` (send, accepts a partial update, deep-merged), and
  `settings:changed` (event, pushed to all renderer windows whenever the
  file changes, whether from the GUI, a hand-edit, or another window).
- The settings file itself is watched (`fs.watch`) so hand-editing
  `settings.json` in a text editor while the app is running is a
  first-class, supported workflow, not an edge case.
- GUI is a dedicated view inside the same renderer bundle (not a separate
  `BrowserWindow`), reachable via a keyboard shortcut and a title-bar
  entry point, organized into sections that map directly onto the settings
  schema: General (shell, starting directory), Appearance (theme,
  opacity, background image), Text (font, size, line height, cursor
  style - ties into milestone 7), Keyboard (shortcut editor - ties into
  milestone 8). **Deviation:** no keyboard shortcut to open it, gear
  button only - milestone 8 doesn't exist yet to make one remappable, and
  a hardcoded one felt premature to commit to. Only the Appearance section
  was built, for the reasons in the note above.
- Every control writes through `settings:set` immediately (no separate
  "Save" step, matching how Windows Terminal and VS Code settings UIs
  behave); a "Reset to defaults" action per section and one for the whole
  file. **Deviation:** one reset action for the whole (currently
  Appearance-only) settings object, not per-section - there's only one
  section, so per-section reset would be the same button twice.

### Sub-tasks

- [x] Settings JSON schema (`src/shared/settingsTypes.ts`) - covers what
      milestones 4-5 actually needed (`activeTheme`, `appearance.*`), not
      speculatively every field milestones 7-9 might eventually want.
      Extending it when those milestones land is an additive, backward
      compatible change (`mergeAndClamp` already deep-merges onto
      defaults), not a breaking one - the speculative up-front schema this
      sub-task originally called for wasn't necessary to get that safety.
- [x] `SettingsStore` in main: load, validate, deep-merge partial updates,
      persist, file-watch, broadcast changes. Built in milestone 5,
      extended here with `reset()`.
- [x] Settings IPC handlers (`settings:get`, `settings:set`,
      `settings:changed`), extended here with `settings:reset` and
      `settings:pick-background-image`.
- [x] Settings GUI shell (`SettingsPanel`): since there's only one section
      (Appearance), there's no section navigation to build yet - generic,
      reusable `buildSection`/`buildSlider` helpers exist and are the
      obvious place to hang a nav once a second section is real.
- [ ] Migration path for `schemaVersion` bumps. Not needed yet - the
      schema has only ever had one version, and `mergeAndClamp`'s
      deep-merge-onto-defaults already absorbs additive field changes
      without a dedicated migration step. Revisit if a future change is
      ever destructive (a rename or type change) rather than additive.
- [ ] "Open settings.json in default editor" escape hatch. Not built -
      with the panel covering every field that currently exists, there is
      nothing left to escape to; revisit once fields the panel doesn't
      expose exist.

### Acceptance criteria

- Every setting changed in the GUI is reflected in `settings.json` on disk
  immediately and takes effect in the running app without a restart.
- Hand-editing `settings.json` while the app is open and saving the file
  updates the GUI and the app's live behavior.
- Deleting `settings.json` entirely and relaunching the app regenerates it
  with defaults rather than crashing.
- An intentionally malformed `settings.json` (invalid JSON, or a value of
  the wrong type) falls back to defaults for the broken fields only, with a
  visible warning, not a full crash.

> Verified so far: typecheck and `electron-vite build` are clean; the app
> launches cleanly in `npm run dev` with the settings panel fully wired
> (no console errors from the new `dialog`-based IPC handler at
> registration time). The malformed-file and missing-file fallback
> behavior was already exercised directly under milestone 4/5 and is
> unchanged here. What was **not** exercised in this environment: actually
> clicking the gear button, picking a theme card, dragging the opacity
> slider, or using the native "Gozat..." file dialog - the same
> screen-capture/interaction limitation noted throughout this document
> applies, and is more relevant here than anywhere else so far, since this
> whole milestone's value is a GUI. This needs a real, human pass before
> considering it solid.

---

## 7. Nerd Font Detection and Font Picker - done

**Implemented in:** `src/main/ipc/fontHandlers.ts` (enumeration),
`src/renderer/src/fonts.ts` (monospace filter + glyph probe),
`src/renderer/src/settingsPanel.ts` (Font section), wired through
`settings.terminal.{fontFamily,fontSize}`.

**Goal:** make font selection safe and informed - the user should not be
able to pick a font that silently breaks icon/ligature rendering without
knowing why.

### Design

- Font enumeration: use Electron/Chromium's
  `queryLocalFonts()` (the Local Font Access API) where available to list
  installed fonts without shelling out to PowerShell; a PowerShell-based
  fallback (`Get-ChildItem` over the Fonts registry key, or the
  `System.Drawing.Text.InstalledFontCollection` .NET type via a small
  helper script) is the backup for environments where the API is
  unavailable.
- Nerd Font detection: maintain a small known-name list (Cascadia Code NF,
  FiraCode Nerd Font, JetBrainsMono Nerd Font, Hack Nerd Font, etc. -
  sourced from the Nerd Fonts project's own naming convention) matched
  case-insensitively against enumerated font names, plus a live glyph
  probe as a second signal: render a known Nerd Font private-use-area
  codepoint offscreen with the candidate font and measure whether a glyph
  actually painted (a zero-width or tofu/notdef box result means the font
  does not actually contain that glyph, regardless of its name).
- Font picker UI (part of the Text section in milestone 6's settings
  panel) shows a live preview pane rendering sample text plus a row of
  common Nerd Font icons in the selected font, so the icon-support gap is
  visible immediately rather than discovered later in a broken prompt.
- If the selected font is not detected as a Nerd Font, show a non-blocking
  notice with a link to https://www.nerdfonts.com/ rather than silently
  degrading icons to tofu boxes.

### Sub-tasks

- [x] Font enumeration IPC channel (`fonts:list`) in main. **Deviation:**
      only the PowerShell/.NET path (`InstalledFontCollection`) was built,
      not `queryLocalFonts()`. The Local Font Access API needs a
      permission grant that can fail silently in Electron; the .NET route
      needs no permission and was verified working directly before any
      code was written. Result is cached for the process lifetime, so the
      ~1s spawn happens once.
- [x] Glyph-probe verification function. **Deviation:** no known-name
      list. A name list would have been both redundant (the probe is
      strictly more accurate) and actively misleading here - it would have
      labelled `Cascadia Code` correctly by luck while still mislabelling
      any renamed or patched font. Detection is purely measured.
- [x] Font picker component with live preview and Nerd Font status badge
      (rendered as a `(Nerd Font)` suffix in the dropdown plus a
      non-blocking notice under the preview linking to nerdfonts.com).
- [x] Wire the selected font into `xterm.js`'s `fontFamily`/`fontSize`
      and persist through `settings:set`. Font changes also re-fit every
      pane and push a `pty:resize`, since unlike a theme change they alter
      the cell grid.
- [x] Extra, not originally listed: the font list is filtered to
      monospace families (measured, by comparing `i` and `W` advance
      widths). Offering all 281 installed families - most of them
      proportional and unusable in a terminal - would have made the
      picker worse, not more capable.

### Acceptance criteria

- The font list shown matches the fonts actually installed on the machine
  (spot-checked against Windows' own Fonts settings page).
- A genuine Nerd Font (for example, a locally installed "CaskaydiaCove
  Nerd Font") is correctly flagged as Nerd-Font-capable; a plain font like
  Consolas is correctly flagged as not.
- Selecting a font updates every open terminal's rendering immediately.

> Verified on-screen, and the verification mattered - the first
> implementation had two real bugs that only running it exposed:
> 1. The glyph probe compared the candidate font stack against a
>    *different* (fallback-only) stack. Different stacks use different
>    font metrics, so with `textBaseline='top'` even an identical tofu
>    glyph landed on a different y and the signatures differed - the probe
>    was measuring metrics, not glyph presence. It now compares against a
>    known-missing codepoint rendered with the *same* stack.
> 2. The PUA icon characters, written literally into the source, were
>    silently reduced to spaces by the toolchain, so the preview's icon
>    row rendered blank. They are now explicit `\uXXXX` escapes.
>
> Final measured result, read directly out of the running renderer:
> `MesloLGS Nerd Font=true | Cascadia Code=false | Consolas=false |
> Courier New=false` - matching the acceptance criteria above, including
> the named Consolas case. The preview was also confirmed visually to
> render real icons under a Nerd Font and tofu boxes under Cascadia Code.

---

## 8. Shell Profiles, Auto-Discovery & In-Terminal Search - done

**Goal:** move away from hardcoded `powershell.exe` to a first-class Profile
Manager with automatic shell discovery (PowerShell 7, Windows PowerShell, CMD,
Git Bash, WSL distros), plus in-terminal interactive search via `@xterm/addon-search`,
directional pane navigation (`Alt+Arrows`/`Alt+HJKL`), focused pane zoom (`Ctrl+Shift+Z`),
and dynamic CWD/title tracking via OSC 7.

### Design

- **Profile Schema & Store:**
  Extend `settings.json` with a `profiles` array and `defaultProfileId`:
  ```jsonc
  {
    "profiles": [
      {
        "id": "pwsh",
        "name": "PowerShell 7",
        "command": "pwsh.exe",
        "args": [],
        "icon": "powershell",
        "startingDirectory": "%USERPROFILE%",
        "color": "#7dd3fc"
      },
      {
        "id": "wsl-ubuntu",
        "name": "Ubuntu (WSL)",
        "command": "wsl.exe",
        "args": ["-d", "Ubuntu"],
        "icon": "linux",
        "startingDirectory": "~",
        "color": "#e95420"
      }
    ],
    "defaultProfileId": "pwsh"
  }
  ```
- **Auto-Discovery:** At startup, the main process probes common executable paths
  (`pwsh.exe` via PATH/Program Files, `cmd.exe`, `git-bash.exe`, and installed WSL
  distros via `wsl.exe -l -q`). Discovered profiles populate defaults if not already set.
- **Tab Bar Profile Dropdown:** Clicking `+` opens a dropdown listing available
  profiles; clicking a profile opens a tab for it. `Ctrl+Shift+1..9` opens the Nth profile.
- **In-Terminal Search (`Ctrl+F`):** Mounts a floating, glassmorphic search bar
  over the focused terminal using `@xterm/addon-search` (already in `package.json`),
  with Next/Previous match navigation, regex toggle, case-sensitivity toggle, and match counter.
- **Directional Pane Navigation & Zoom:**
  - `Alt+Left/Right/Up/Down` (and `Alt+H/J/K/L`) moves focus to adjacent split panes.
  - `Ctrl+Shift+Z` toggles Zoom on the active pane (temporarily hiding sibling panes for full-screen focus).
- **OSC 7 / OSC 9;9 Dynamic Title & CWD:**
  Register OSC 7 / OSC 9 handlers to track the active working directory and running command,
  updating tab labels and allowing new tabs/splits to optionally open in the same directory.

### Sub-tasks

- [x] Shell discovery module in main (`src/main/pty/profileDiscovery.ts`) probing Windows PATH, Registry, and WSL.
- [x] Profile management IPC (`PtyCreateOptions` with `command`, `args`, `cwd`) passing parameters to `PtyManager`.
- [x] Settings panel: new **Kabuk Profilleri (Profiles)** section with default profile selection and badge list.
- [x] Titlebar UI: Profile dropdown button and popup menu next to the `+` new tab button.
- [x] Search overlay component (`src/renderer/src/searchBar.ts`) wired to `@xterm/addon-search` with `Ctrl+F`.
- [x] Pane directional focus (`Alt+Arrows`/`Alt+HJKL`) and Zoom toggle (`Ctrl+Shift+Z`) in `panes.ts` and `tabs.ts`.

---

## 9. Customizable Keyboard Shortcuts & Central Action Registry - done

**Goal:** every default keybinding (new tab, close tab, split pane, switch focus, open settings,
search, zoom, etc.) becomes remappable, with conflict detection and an interactive recorder.

### Design

- **Action Registry:** Stable action identifiers (`tab.new`, `tab.close`, `pane.splitRight`,
  `pane.splitDown`, `pane.zoom`, `terminal.search`, `settings.toggle`, `theme.cycle`, `profile.open1..9`) defined in
  `src/shared/actionTypes.ts`.
- **Central Keyboard Dispatcher:** A single `keydown` handler at window level resolving
  `KeyboardEvent` through the current keybindings map, passing to registered handlers.
- **Interactive Shortcut Editor:** Settings GUI section allowing users to click a shortcut, press
  their desired key combination, detect conflicts instantly, and reset individual shortcuts.

### Sub-tasks

- [x] Action registry (`src/shared/actionTypes.ts`) and `KeybindingManager` (`src/renderer/src/keybindings.ts`) dispatch system.
- [x] `keybindings` schema in `settingsTypes.ts` with sensible defaults in `DEFAULT_KEYBINDINGS`.
- [x] Interactive Key Recorder component in Settings Panel (`settingsPanel.ts`) with live key capture.
- [x] Conflict detection logic (`findConflict`) with visual warning badges (`⚠ Çakışıyor: [Action]`).

---

## 10. Command Palette & Runbooks ("Bitig Betik") *(Bitig Differentiator)* - done

**Goal:** provide a universal, keyboard-driven Command Palette (`Ctrl+Shift+P`) and a built-in
parametric Runbook / Snippets system ("Bitig Betik", `Ctrl+Shift+B`) that turns complex, multi-flag
commands into reusable, visual forms without cloud dependencies.

### Design

- **Command Palette (`Ctrl+Shift+P`):**
  - Instant fuzzy search across all Bitig actions, open tabs, themes, and shell profiles.
  - Arrow key navigation, immediate execution on Enter.
- **Runbooks & Snippets ("Bitig Betik"):**
  - Developers frequently run complex CLI invocations (e.g. `docker run -d -p {{host_port}}:{{container_port}} -v {{src}}:{{dst}} {{image}}`, `ffmpeg -i {{input}} -c:v libx264 {{output}}`, `git rebase -i HEAD~{{count}}`).
  - Stored locally in `%APPDATA%/Bitig/snippets.json`.
  - Pressing `Ctrl+Shift+B` opens the Runbook modal: fuzzy-select a snippet -> Bitig renders a dynamic form with inputs for placeholders -> Press Enter to inject the fully composed command into the active terminal!

### Sub-tasks

- [x] Command Palette overlay component with high-performance fuzzy filtering (`src/renderer/src/commandPalette.ts`, `fuzzy.ts`).
- [x] Snippet schema and store (`src/shared/snippetTypes.ts`, `src/main/snippets/snippetStore.ts`).
- [x] Snippet modal with dynamic placeholder form generator and live preview (`src/renderer/src/betikModal.ts`).
- [x] Pre-packaged starter runbooks (Docker, Git, FFmpeg, NPM/Cargo, Kubernetes).

---

## 11. Command History, Fuzzy Search & Execution Telemetry - done

**Goal:** searchable history across sessions, a `Ctrl+R` fuzzy search popup, and execution duration
telemetry with background task completion notifications.

### Design

- **Shell Integration & Input Tracking:**
  - Input stream & terminal output tracking for prompt starts, command lines, and exit codes.
- **Fuzzy Search Overlay (`Ctrl+R`):**
  - Instant history search modal ranking commands by frequency and recency (`src/renderer/src/historyModal.ts`).
- **Execution Telemetry & Toast Notifications:**
  - When a command runs for longer than a configurable threshold (e.g. 5 seconds) and the Bitig window is in the background, send a native Windows notification: `✅ "npm run build" finished in 14.2s (exit code 0)`.
  - Configurable notification threshold in Settings.

### Sub-tasks

- [x] Persistent history store in main (`%APPDATA%/Bitig/history.json`, `src/main/history/historyStore.ts`).
- [x] Fuzzy search modal (`Ctrl+R`) with keyboard-first interaction (`src/renderer/src/historyModal.ts`).
- [x] Background command timer and Windows native notification dispatch (`src/renderer/src/telemetry.ts`, `windowHandlers.ts`).
- [x] Settings panel telemetry & notification controls (`src/renderer/src/settingsPanel.ts`).

---

## 12. Developer Cockpit, Live Port Sniffer & Secret Shield *(Bitig Differentiator)* - done

**Goal:** transform Bitig from a passive text box into an active developer cockpit: live detection
of opened network ports (`localhost:3000`), smart file/line hyperlinks that open directly in VS Code,
and automatic masking of accidental sensitive token leaks.

### Design

- **Live Port Sniffer (Port & Process Sentinel):**
  - Detect when child processes bind to TCP listening ports on Windows (e.g. Vite on `5173`, Next.js on `3000`, API on `8080`).
  - Render an interactive badge in tab headers: `🟢 :5173` -> 1-click open in default browser.
- **Smart File Hyperlinks:**
  - Regex match file references in terminal output (e.g., `src/renderer/src/main.ts:45:12` or `C:\project\error.log`).
  - Clicking automatically opens the file at the exact line in VS Code / default IDE (`vscode://file/...:line:col`).
- **Secret Shield (Privacy Guard):**
  - Scanner that detects accidental output of JWT tokens, AWS keys (`AKIA...`), GitHub PATs (`ghp_...`), or private keys in terminal output.
  - Automatically sanitizes and masks credentials when saved to command history (`history.json`).

### Sub-tasks

- [x] Live Port Sniffer regex stream scanner (`src/renderer/src/portSniffer.ts`).
- [x] Tab bar port badge UI with 1-click browser opener (`src/renderer/src/tabs.ts`, `style.css`).
- [x] Smart hyperlink link provider using xterm custom link provider (`src/renderer/src/smartLinks.ts`).
- [x] Secret Shield regex pattern matcher with toggle in Settings (`src/renderer/src/secretShield.ts`, `src/main/history/historyStore.ts`).

---

## 13. Quake / Dropdown HUD Mode & Broadcast Input *(Bitig Differentiator)*

**Goal:** instant access terminal from anywhere via a global system hotkey (`Win+~` / `Ctrl+~`),
and simultaneous multi-pane command broadcast for cluster management.

### Design

- **Quake / Dropdown HUD Window:**
  - Register a global OS hotkey (`globalShortcut.register('CommandOrControl+`', ...)`).
  - Smoothly slides down from the top edge of the primary monitor over any running application.
  - Loss of focus can automatically pin or slide back up.
- **Broadcast Input Mode (`Alt+Shift+I`):**
  - When enabled, keystrokes typed into the focused pane are mirrored to all active split panes in the current tab.
  - A distinct glowing border / status indicator ("🔴 Sync Active") alerts the user to prevent accidental command execution across servers.

### Sub-tasks

- [ ] Global shortcut manager in main with multi-monitor positioning support.
- [ ] Window slide animation and drop-down window mode toggle in Settings.
- [ ] Broadcast dispatcher in `TabStore` / `panes.ts`.
- [ ] Visual broadcast HUD banner and warning state.

---

## 14. AI Terminal Companion ("Bitig Bilge" - Local & BYOK) *(Bitig Differentiator)*

**Goal:** an intelligent, privacy-first terminal assistant that helps debug failed commands,
generate complex bash/powershell one-liners, and summarize long logs, using local models (Ollama)
or personal API keys (OpenAI, Gemini, Anthropic, DeepSeek).

### Design

- **Privacy-First & BYOK (Bring Your Own Key):**
  - Zero telemetry or forced cloud accounts. Keys stored securely in OS credential vault / encrypted settings.
  - First-class support for local Ollama instances (`http://localhost:11434`).
- **Inline Error Explainer:**
  - When a command fails (`exit code != 0`), an optional "💡 Neden hata verdi?" icon appears.
  - Clicking sends only the relevant error snippet and shell context to the AI model, displaying an actionable fix.
- **Natural Language to CLI Generator (`Ctrl+I` / Inline Ghost Prompt):**
  - Type `# find all files larger than 100MB and delete them` -> AI suggests the exact PowerShell/Bash syntax -> Press Tab to accept.

### Sub-tasks

- [ ] AI provider abstraction in main (`OllamaProvider`, `OpenAIProvider`, `GeminiProvider`, `AnthropicProvider`).
- [ ] Settings Panel: **AI / Bilge** configuration section (Provider, API Key, Model name, Temperature).
- [ ] Inline explanation drawer / tooltip component in renderer.
- [ ] Inline ghost-text suggestion prompt.

---

## 15. Lightweight Plugin System & Sandboxing

**Goal:** let developers extend Bitig safely without patching core source: new actions,
status bar widgets, custom themes, custom OSC handlers, and AI prompt hooks.

### Design

- Plugins live in `%APPDATA%/Bitig/plugins/<plugin-name>/` with a `plugin.json` manifest.
- **Security Sandbox:** Plugins execute inside Node's `vm` module with an explicit permission model
  (`pty:read`, `ui:statusbar`, `settings:read`, `action:register`), completely denying access to raw
  `fs`, `child_process`, or ambient Node globals.
- Plugin UI contribution points: Status Bar, Command Palette actions, and Settings Panel tabs.

### Sub-tasks

- [ ] Plugin manifest loader and validator.
- [ ] `vm`-based sandbox environment with scoped Bitig API.
- [ ] Permission grant UI in Settings.
- [ ] Reference example plugins (Git Status widget, System Resource monitor).

---

## 16. Packaging, Installer & Auto-Updater

**Goal:** deliver a production-ready, frictionless installer (`.exe`) and auto-update mechanism for Windows.

### Design

- `electron-builder` NSIS configuration targeting `x64` and `arm64` Windows.
- `asarUnpack` configured for `node-pty` native `.node` binaries and ConPTY prebuilds.
- Multi-resolution application icon set (`.ico` containing 16, 32, 48, 256px).
- Auto-update support via GitHub Releases (`electron-updater`).

### Sub-tasks

- [ ] `electron-builder.yml` configuration and build scripts.
- [ ] Native icon design and asset generation.
- [ ] Clean-machine VM verification matrix.
- [ ] Automated GitHub Actions release pipeline.

---

## Explicit Non-Goals (for now)

Listed to maintain focus and performance:

- **Cross-platform support (macOS, Linux):** Bitig remains Windows-first (ConPTY, Windows Registry, Windows Font APIs).
- **Heavy web browser embed inside terminal:** Bitig is a high-performance terminal emulator, not a web browser.
- **Cloud-forced accounts / mandatory subscriptions:** Bitig is 100% local, sovereign, and privacy-respecting.
