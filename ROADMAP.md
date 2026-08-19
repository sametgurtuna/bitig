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
| 8 | Customizable keyboard shortcuts | 6 | `0.7.0` |
| 9 | Command history and fuzzy search | 2 | `0.8.0` |
| 10 | Plugin system | 6, 8 | `0.9.0` |
| 11 | Packaging | all of the above | `1.0.0` |

Milestones 4 and 2 can technically be built in parallel since neither
depends on the other; they are numbered in the order the project intends to
tackle them, not in a strict dependency chain.

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

## 8. Customizable Keyboard Shortcuts

**Goal:** every default keybinding introduced in earlier milestones (new
tab, close tab, split pane, switch focus, open settings, and so on) becomes
remappable, with conflict detection.

### Design

- Shortcut schema, part of `settings.json`:
  ```jsonc
  {
    "keybindings": [
      { "action": "tab.new", "keys": "Ctrl+Shift+T" },
      { "action": "tab.close", "keys": "Ctrl+Shift+W" },
      { "action": "pane.splitRight", "keys": "Alt+Shift+D" },
      { "action": "pane.splitDown", "keys": "Alt+Shift+E" }
    ]
  }
  ```
  Action identifiers are stable strings defined once in
  `src/shared/actionTypes.ts`, so a keybinding is always "what it does",
  never "what code path it happens to call" - this indirection is what
  makes remapping and the future plugin system (milestone 10) able to
  register their own actions without touching keybinding-handling code.
- A single keyboard event listener at the renderer's top level resolves
  `KeyboardEvent` to an action id via the current keybinding map, then
  dispatches to a central action registry (`actionId -> handler function`).
  Individual components (tab bar, pane manager) register their handlers
  into that registry rather than adding their own `keydown` listeners,
  avoiding the classic bug of two features both trying to own the same key
  combination.
- Conflict detection: assigning a combination already bound to another
  action surfaces the conflict in the shortcut editor UI immediately
  (highlight both entries, do not silently overwrite).
- A reserved set of combinations used by the terminal itself for actual
  shell input (`Ctrl+C`, `Ctrl+V` when not remapped, arrow keys, etc.)
  cannot be bound to app-level actions unless the user explicitly
  acknowledges the override, since doing so changes shell behavior the
  user may not expect.

### Sub-tasks

- [ ] Define the action registry and the stable action-id list covering
      every keyboard-triggered feature from milestones 2, 3, and 6.
- [ ] Central keyboard event resolver replacing any ad hoc `keydown`
      listeners added in earlier milestones.
- [ ] Shortcut editor UI: list of actions with their current binding, a
      "click to record a new binding" control, conflict highlighting.
- [ ] Reserved-combination guard with an explicit override flow.
- [ ] Ship sensible defaults matching common Windows terminal conventions
      (close to Windows Terminal's own defaults where there is no reason
      to diverge, so muscle memory transfers).

### Acceptance criteria

- Rebinding an action in the shortcut editor takes effect immediately, no
  restart required.
- Binding a combination already in use surfaces a visible conflict instead
  of silently applying.
- Deleting `settings.json`'s `keybindings` section (or the whole file)
  falls back cleanly to the documented defaults.

---

## 9. Command History and Fuzzy Search

**Goal:** a searchable history of commands run across sessions, plus a
fuzzy-search overlay (a built-in equivalent of piping through `fzf`) for
quickly finding and re-running a past command.

### Design

- Command boundary detection: this is the hard part. PTY output is an
  opaque stream of bytes; Bitig does not get a clean "command started /
  command finished" signal for free. The practical, widely-used approach
  (also how Warp and other modern terminals do it) is **shell
  integration**: a small snippet injected into the shell's profile (a
  PowerShell profile addition, opt-in and clearly explained, not silently
  modifying the user's existing profile) that emits OSC-sequence markers
  around each prompt and command (OSC 133, the semi-standard "shell
  integration" sequence family: `A` prompt start, `B` command start, `C`
  command executed, `D` command finished with exit code). `xterm.js`
  exposes a parser hook (`Terminal.parser.registerOscHandler`) for exactly
  this.
- Without shell integration installed, history capture degrades
  gracefully to "log of raw input lines the user typed" (still useful for
  search, just without exit codes or precise command boundaries).
- Storage: an append-only local log per shell session, flushed
  periodically, indexed for search. Given the expected data volume
  (personal command history, not a multi-user dataset), a simple
  JSON-lines file under `%APPDATA%/Bitig/history/` plus an in-memory index
  loaded at startup is sufficient; a real embedded database (SQLite via a
  native module) is a reasonable upgrade later if the flat-file approach
  becomes a bottleneck, but is not justified as a starting point.
- Fuzzy search overlay: a modal invoked by keybinding (default close to
  `Ctrl+R`, matching shell reverse-search muscle memory), fuzzy-matching
  against the history index (a small, dependency-free fuzzy match
  implementation - subsequence matching with a scoring function that
  favors contiguous matches and matches near the start of the string is
  enough; no need for a heavyweight library), showing results ranked by
  score with recency as a tiebreaker, Enter to insert the selected command
  at the current prompt (not auto-execute, to avoid accidental destructive
  re-runs).

### Sub-tasks

- [ ] PowerShell shell-integration snippet (OSC 133 markers) plus an
      in-app, opt-in installer flow that appends it to the user's
      `$PROFILE` with a clear diff preview before writing.
- [ ] OSC 133 parser hook in the renderer, wired per PTY session.
- [ ] History store: append-only writer in main, loaded index at startup,
      basic pruning (age-based or count-based cap, configurable).
- [ ] Fuzzy match scoring function and unit tests covering the common
      cases (prefix match, subsequence match, no match).
- [ ] Search overlay UI: input box, ranked result list, keyboard
      navigation, Enter-to-insert.
- [ ] Privacy controls: a per-project or global "do not record history"
      toggle, and a "clear history" action.

### Acceptance criteria

- With shell integration installed, running several distinct commands and
  opening the search overlay finds each one by a partial, non-contiguous
  match of its text.
- Without shell integration installed, the feature still degrades to
  usable line-based search rather than being entirely broken.
- History persists across app restarts.
- Clearing history actually removes the on-disk log, verified by
  re-opening the search overlay and finding it empty.

---

## 10. Lightweight Plugin System

**Goal:** let third-party (and the author's own) code extend Bitig without
patching core source: new actions, new settings-panel sections, new status
bar items, custom OSC-sequence handlers, to start.

### Design

- Plugins are npm-style packages: a folder with a `plugin.json` manifest
  (name, version, entry point, declared permissions) and a JS entry file,
  installed under `%APPDATA%/Bitig/plugins/<plugin-name>/`.
- **Plugins run in the main process, in a restricted context, never with
  direct access to the real `require`/`fs`/`child_process` globals.** This
  is a deliberate, non-negotiable security boundary: a terminal emulator
  plugin ecosystem is an extremely sensitive place to get sandboxing wrong,
  since plugins are exactly the kind of code most likely to be installed
  from an untrusted third party. The practical mechanism is Node's `vm`
  module with a curated context object exposing only a permission-gated
  Bitig API (`bitig.registerAction(...)`, `bitig.onPtyData(...)`,
  `bitig.settings.get(...)`), not the ambient Node globals.
- A plugin manifest declares the permissions it needs (`pty:read`,
  `settings:read`, `settings:write`, `ui:register-panel`, etc.); the app
  shows these to the user before enabling a plugin, the same trust model
  as a browser extension install prompt, not a silent capability grant.
- Plugin API surface starts intentionally small (register an action,
  register a settings-panel section, read PTY output, contribute a status
  bar item) and grows only when a real plugin idea needs more, rather than
  speculatively building a large API up front.

### Sub-tasks

- [ ] Plugin manifest schema and a `PluginLoader` in main that discovers,
      validates, and loads plugins from the plugins directory.
- [ ] `vm`-based sandboxed execution context with the curated `bitig` API
      object; explicit denial of ambient Node globals.
- [ ] Permission model: manifest-declared permissions, a user-facing
      enable/disable/review UI (part of the settings panel from
      milestone 6), and enforcement at the API boundary (a plugin without
      `settings:write` gets a `bitig.settings.set` that throws, not one
      that silently succeeds).
- [ ] The initial small API surface: `registerAction`, `onPtyData`,
      `settings.get`/`settings.set` (permission-gated), a status-bar
      contribution point.
- [ ] A reference example plugin (in-repo, under a `plugins-examples/`
      folder, not shipped in the packaged app) demonstrating the API and
      doubling as a manual integration test.
- [ ] Crash isolation: an uncaught exception inside a plugin's code must
      not take down the host app; the plugin is disabled and the user is
      notified, the rest of the app keeps running.

### Acceptance criteria

- The reference example plugin loads, registers an action, and that action
  is invokable from the shortcut system built in milestone 8.
- A plugin without a declared permission genuinely cannot use the
  corresponding API (verified by writing a plugin that tries and observing
  a clean rejection, not a silent no-op and not a crash).
- A plugin that throws inside its own code is caught, disabled, and
  reported, without crashing the main window or killing any running PTY
  session.

---

## 11. Packaging

**Goal:** a distributable, installable `.exe` for end users who are not
running the project from source.

### Design

- `electron-builder` (already a devDependency) targets an NSIS installer
  for Windows, matching the ecosystem norm and giving a familiar
  install/uninstall experience integrated with Windows' Add/Remove
  Programs.
- Code signing: unsigned builds trigger SmartScreen warnings on first run.
  A proper Authenticode certificate is a real cost/process decision the
  author needs to make (EV cert for immediate SmartScreen reputation vs.
  standard cert that builds reputation over time vs. shipping unsigned
  with a documented warning for early users) - tracked here as an open
  decision, not resolved by this document.
- Auto-update: `electron-builder`'s built-in `autoUpdater` integration
  (NSIS + a generic or GitHub-Releases-backed update feed) is the natural
  fit once there is a stable release cadence; not needed for the very
  first packaged release, but the build config should be structured so it
  is a small addition later (using `electron-builder`'s config format from
  the start rather than a fully custom packaging script).
- Native module handling: `node-pty`'s prebuilt binaries (already
  confirmed working without a source rebuild, see `CLAUDE.md`'s "Bilinen
  Notlar" section) need `asarUnpack` configuration so the native `.node`
  files are not sealed inside the asar archive, where native `require`
  cannot load them.

### Sub-tasks

- [ ] `electron-builder` configuration (`electron-builder.yml` or the
      `build` key in `package.json`): app id, product name, NSIS target,
      icon set (multiple resolutions), `asarUnpack` for `node-pty`'s
      native binary and prebuilds directory.
- [ ] App icon design (`.ico` for Windows, multiple sizes: 16, 32, 48, 256).
- [ ] `npm run dist` (or similarly named) script producing a signed or
      clearly-labeled-unsigned installer artifact.
- [ ] Verify a clean-machine install: the installer works on a Windows 11
      VM with no Node.js, no git, nothing beyond the OS itself installed
      (this is the real test that catches "works on my machine because I
      have the toolchain installed" bugs).
- [ ] Decide and document the code-signing approach (see Design above).
- [ ] Release process documentation: how to cut a version bump, tag,
      build, and publish a GitHub Release with the installer attached.

### Acceptance criteria

- The installer runs and produces a working, launchable app on a clean
  Windows 11 machine with no development tools installed.
- The installed app's PTY functionality works identically to the
  `npm run dev` experience (this is the real proof that native module
  packaging is correct, since a broken `asarUnpack` config typically shows
  up as node-pty failing to load only in the packaged build).
- Uninstalling through Windows' standard "Apps" settings page removes the
  application cleanly, including its Start Menu entry.

---

## Explicit Non-Goals (for now)

Listed to avoid scope creep and to give future contributors a clear
"not yet, and here is why" answer:

- **Cross-platform support (macOS, Linux).** The project is intentionally
  Windows-first (ConPTY, Windows paths, Windows-specific font/registry
  APIs). Nothing here is designed to be hostile to a future port, but
  nothing is being built speculatively for portability either.
- **Multi-window support.** Tabs and split panes cover the vast majority
  of real workflows; a second top-level window is a meaningfully larger
  state-management problem (which window owns which settings, focus
  across windows, etc.) and is not planned until the single-window
  experience is solid.
- **Remote/SSH session management as a first-class feature.** Bitig runs
  local shells; SSH is just another command a user can type. A dedicated
  SSH session manager (like some commercial terminals offer) is out of
  scope unless a strong need emerges later.
- **A built-in package manager for plugins.** Milestone 10 ships the
  loading and sandboxing mechanism, not a discovery/install UI or a
  registry; that is a substantially larger undertaking appropriate only
  once there is an actual plugin ecosystem worth managing.
