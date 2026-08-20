<div align="center">

# Bitig · Features & Differentiators

<sub>Version <b>1.0.2</b> · Smarter, prefix-exact inline suggestions and a <code>Tab</code> key that stays in the terminal</sub>

<sub><a href="README.md">README</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="ROADMAP.md">Roadmap</a></sub>

</div>

---

## Vision: Why Another Terminal?

Terminals on Windows have drifted to two extremes:

| | Strength | Weakness |
|---|---|---|
| **Windows Terminal** | Fast, stable, native ConPTY | A plain text box; no contextual intelligence, no interactive assistance |
| **Warp and cloud terminals** | Rich feature set | Mandatory account, cloud telemetry, a privacy problem in corporate environments |

Bitig aims to close the gap between the two. Four core principles:

| Principle | What it means |
|---|---|
| **100% local** | Zero cloud dependencies, zero telemetry, no account. All data lives as plain JSON under `%APPDATA%/Bitig/`. |
| **No security compromises** | Strict Electron isolation (`contextIsolation: true`, `sandbox: true`), a separate Node `vm` context for plugins. |
| **Keyboard first** | Every capability is reachable without a mouse via a single shortcut; every shortcut is rebindable. |
| **Developer focused** | Turns an ordinary stream of text into a clickable, parametric, observable workstation. |

---

## Comparison Matrix

Legend: `+` built in and complete, `~` partial or via plugin, `-` absent.

| Feature | Windows Terminal | Warp | Hyper / Tabby | Bitig 1.0.2 |
|---|:---:|:---:|:---:|:---|
| ConPTY integration | `+` native | `-` custom engine | `~` node-pty | `+` **ConPTY + xterm.js** |
| Inline (ghost) command suggestions | `-` | `+` cloud-assisted | `-` | `+` **Local history + project aware, `Tab` to accept** |
| Multiple independent windows | `+` | `+` | `+` | `+` **`Ctrl+Shift+N`, no background ghost process** |
| Live working directory in tab title | `~` needs shell config | `+` | `~` | `+` **Automatic shell integration (OSC 7)** |
| Local parametric runbooks | `-` | `~` cloud / account | `-` | `+` **Bitig Betik, local JSON (`Ctrl+Shift+B`)** |
| Live port sniffer | `-` | `-` | `-` | `+` **ANSI-stripped, buffered, click to open** |
| Secret Shield (token redaction) | `-` | `-` | `-` | `+` **Automatic masking** |
| Local AI assistant | `~` Copilot | `~` Warp AI, cloud | `-` | `+` **Ollama + BYOK (`Ctrl+I`)** |
| Quake / dropdown HUD | `~` separate mode | `-` | `~` via plugin | `+` **Built in (`Win+~`)** |
| Broadcast input | `-` | `-` | `~` some builds | `+` **Built in (`Alt+Shift+I`)** |
| IDE smart links | `-` URLs only | `~` partial | `-` URLs only | `+` **`vscode://`, Cursor** |
| Nerd Font glyph probing | `-` | `-` | `-` | `+` **Canvas PUA probe** |
| Sandboxed plugin runtime | `-` | `-` | `~` full Node access | `+` **Node `vm`, allowlisted API** |

---

## The Cockpit Surface

```
┌────────────────────────────────────────────────────────────────────────┐
│  B I T I G   C O C K P I T                                             │
├────────────────────────────────────────────────────────────────────────┤
│  Ports     :3000 (Next.js)   :5173 (Vite)      Quake HUD    Win+~      │
│  Betik     Docker Dev Cluster                  Broadcast    Alt+Shift+I│
│  Shield    1 API key masked                    Bilge AI     Ctrl+I     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Inline Command Suggestions

`Tab` to accept · Shipped v1.0.1 · Rebuilt in v1.0.2

**Problem.** You type `npm run dev` twenty times a day. Reaching for `Ctrl+R` and
searching history for a command you already know by heart is friction, and the
shell's own `Tab` completion knows nothing about the commands *you* actually run.

**Solution.** As you type, Bitig renders the most likely full command as
translucent ghost text after the cursor. Press `Tab` (or `→` / `End` at the end of
the line) to accept it, `Ctrl`/`Alt`+`→` to accept a single word or path segment,
`Esc` to dismiss. If there is no suggestion, `Tab` is passed straight through to
the shell, so native completion is never broken.

A suggestion is always a **true prefix extension** of what you typed — it is
rendered as `candidate.slice(line.length)`, so a fuzzy match (scattered
characters) would produce a suffix unrelated to the line. v1.0.2 removed fuzzy
candidates from this path entirely.

The suggestion engine (`src/renderer/src/autocomplete.ts`) ranks candidates from:

| Source | Ranking signal | Example |
|---|---|---|
| **Command history** | frecency: recency bucket + `log2(count)` + same-working-directory bonus + non-zero-exit penalty | `docker compose up -d` |
| **Current session** | anything you ran in this pane outranks the history file it is not in yet | `npm run typecheck` |
| **Project context** | `package.json` scripts across `npm` / `pnpm` / `yarn` / `bun`, `Makefile` targets | `pnpm dev`, `make release` |
| **Path arguments** | directory and file names for the last argument of `cd`, `ls`, `cat`, `code`, `rm`, `node`, ... (`cd`, `pushd`, `mkdir` get directories only) | `cd src/renderer/` |
| **Built-in dictionary** | fallback for an empty history | `git status`, `code .` |

Exact-case candidates beat case-folded ones, and longer completions are
penalized, so the safest completion wins. Project context is resolved in the main
process (`completion:context`), cached per directory by mtime, and refreshed on a
5 second TTL plus after every command — so a file you just created is
completable immediately, with no disk access on the keystroke path.

> **Implementation note.** The ghost text is a positioned DOM overlay, never
> written into the terminal buffer — writing it would collide with the shell's own
> echo and corrupt the line. Its letter spacing is corrected at render time so it
> lands exactly on the terminal's character grid.
>
> **`Tab` never leaves the terminal.** xterm.js only calls `preventDefault()` for
> keys it handles itself; when the suggestion layer swallows `Tab`, that step is
> skipped and the browser would move DOM focus onto a title bar or status bar
> button. Every path that swallows `Tab` calls `preventDefault()` explicitly, and
> a capture-phase guard blocks focus traversal outside real text inputs (v1.0.2).

---

## 2. True Multi-Window

`Ctrl+Shift+N` · Shipped v1.0.1

**Problem.** In 1.0.0 a second launch of Bitig only focused the existing window,
and — worse — closing the last window left an invisible process alive, still
holding PTY sessions and a global hotkey.

**Solution.** Launching the executable again opens a **new, fully independent
window**, exactly like Windows Terminal; `Ctrl+Shift+N` does the same from inside
the app. Each window owns its own tabs and PTY sessions: closing one window kills
only its shells, and closing the last one terminates the process completely.

Settings, themes, history and snippets stay under a single owner (one process,
many windows), so there is never more than one writer for `settings.json`.

> **Root cause of the 1.0.0 ghost process.** The Quake HUD window was created
> eagerly at startup. Because a (hidden) window was always open, Electron's
> `window-all-closed` event never fired. The HUD is now created lazily on first
> use, and quitting is driven by an explicit count of real Bitig windows.

---

## 3. Live Working Directory in Tab Titles

Shipped v1.0.1

**Problem.** Tab titles came only from OSC 0/2, which PowerShell and cmd emit
once at startup — with the *full path of the executable*. The result: a tab
labelled `system32` forever, no matter how many times you `cd`.

**Solution.** Bitig injects a prompt hook into the shell it spawns
(`src/main/pty/shellIntegration.ts`) so every prompt emits the current directory
as an OSC 7 sequence:

| Shell | Injection |
|---|---|
| PowerShell / pwsh | `-NoExit -EncodedCommand` wrapping the existing `prompt` function |
| cmd | `/K prompt $E]7;file:///$P$E\$P$G` |
| bash / Git Bash | `PROMPT_COMMAND` prefixed with a `printf` of `$PWD` |

The renderer listens for OSC 7 (and OSC 9;9 for ConEmu compatibility) and
retitles the tab to the folder name the moment it changes — `cd Desktop` renames
the tab to **Desktop** instantly. Your own `prompt` function or `PROMPT_COMMAND`
is wrapped, never replaced.

For shells that cannot be instrumented (WSL, exotic setups) a fallback tracker
(`src/renderer/src/cwdTracker.ts`) infers the directory from the prompt line
itself. Manually renamed tabs (double-click) are always left alone, and the full
path is available as the tab's tooltip.

---

## 4. Bitig Betik: Parametric Runbook Manager

`Ctrl+Shift+B` · Shipped v0.8.0

**Problem.** Developers run long, parameter-heavy commands every day:

```
docker run -d -p 8080:80 -v C:\project:/app --name api-dev node:20
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -c:a aac output.mp4
kubectl port-forward svc/my-service 8080:80 -n staging
```

Memorizing them, or pasting them out of a notes app and hand-editing quotes and
ports, is both slow and error-prone.

**Solution.** `Ctrl+Shift+B` opens a searchable template picker. Bitig turns the
`{{variable}}` placeholders into a dynamic form; filling it in and pressing
`Enter` types the compiled command straight into the active terminal. A live
preview shows exactly what will run before it runs.

<details>
<summary><b>Template schema</b> (<code>%APPDATA%/Bitig/snippets.json</code>)</summary>

```jsonc
{
  "snippets": [
    {
      "id": "docker-run-volume",
      "name": "Start Docker Container (Port & Volume)",
      "description": "Runs a container with port forwarding and a bind mount",
      "category": "Docker",
      "command": "docker run -d -p {{host_port}}:{{container_port}} -v \"{{host_dir}}\":{{container_dir}} --name {{name}} {{image}}",
      "variables": {
        "host_port":      { "label": "Host Port",      "default": "3000" },
        "container_port": { "label": "Container Port", "default": "3000" },
        "host_dir":       { "label": "Local Directory","default": "%CD%" },
        "container_dir":  { "label": "Target Directory","default": "/app" },
        "name":           { "label": "Container Name", "default": "app-dev" },
        "image":          { "label": "Docker Image",   "default": "node:20-alpine" }
      }
    }
  ]
}
```

</details>

---

## 5. Live Port & Service Sniffer

Shipped v0.9.0

**Problem.** After `npm run dev`, `cargo run` or `docker compose up`, finding the
port the app came up on means scanning a wall of scrolling logs.

**Solution.** `src/renderer/src/portSniffer.ts` analyses the PTY output stream:

- **ANSI escape sequences are stripped** before scanning, so color codes never
  break the regex.
- A **per-pane rolling buffer** (512 characters) keeps URLs that are split across
  PTY chunks from being lost.
- The moment a port opens, a pulsing, clickable badge appears in the tab title and
  status bar. One click opens `http://localhost:PORT` in the default browser.
- Millisecond values such as `ready in 153 ms` are never mistaken for ports.

---

## 6. Smart Links & IDE Integration

Shipped v0.9.0

**Problem.** When a build error prints `at src/renderer/src/main.ts:42:15`, a
standard terminal shows it as flat text. Hunting the file down in your editor and
jumping to the line breaks your flow.

**Solution.** `src/renderer/src/smartLinks.ts` registers a custom link provider
with xterm.js. It recognizes stack-trace patterns (`src/main.ts:42:15`,
`C:\Users\...\file.py:102`) and `Ctrl + Left click` opens the file at the exact
line and column:

```
vscode://file/c:/Users/samet/Desktop/Bitig/src/renderer/src/main.ts:42:15
```

The handoff goes through the `cockpit:open-file` channel via `shell.openExternal`.

---

## 7. Secret Shield

Shipped v0.9.0

**Problem.** On a stream or in a screen share, `cat .env` or `echo $STRIPE_KEY`
exposes live credentials. Worse, those commands are written to command history in
plain text and stay there.

**Solution.** `src/renderer/src/secretShield.ts` and
`src/main/history/historyStore.ts` work together.

| Detected pattern | Example |
|---|---|
| JWT token | `eyJhbGciOi...` |
| AWS access key | `AKIA[0-9A-Z]{16}` |
| GitHub PAT | `ghp_[0-9a-zA-Z]{36}` |
| OpenAI / Anthropic key | `sk-...`, `sk-ant-...` |
| Private key block | `-----BEGIN RSA PRIVATE KEY-----` |

Values are masked to `ghp_************` before the command is persisted, so
searching your history never carries a leak risk.

---

## 8. Bitig Bilge: Local, Privacy-First AI Assistant

`Ctrl+I` · Shipped v0.9.8

**Problem.** Copying an unfamiliar error into a browser search breaks your flow,
and pasting company code or logs into a cloud AI service violates most data
security policies.

**Solution.**

- **100% local, or BYOK.** With Ollama (`http://localhost:11434`) nothing ever
  leaves the machine; alternatively bring your own OpenAI, Anthropic, Gemini or
  DeepSeek key. Bitig never forwards data to servers of its own, because there
  are none.
- **Natural language to command.** Press `Ctrl+I`, type *"find and delete all .log
  files larger than 100MB"*, and get a command appropriate for the active shell.
  `Enter` runs it, `Tab` sends it to the terminal for editing.
- **Smart error explainer.** The last command and the relevant error lines are
  analysed into an actionable fix.
- **Key handling.** API keys live only in `%APPDATA%/Bitig/settings.json`, are
  entered masked in the settings panel, and can be verified with a live
  connection test.

---

## 9. Quake / Dropdown HUD

`Win+~` or `Ctrl+~` · Shipped v0.9.5

**Problem.** Digging a terminal out from behind a dozen windows for one quick Git
command is pure overhead.

**Solution.** On the hotkey, Bitig drops down from the top edge of the screen as a
translucent, always-on-top HUD. It is controlled at runtime through the
`quake:toggle` and `quake:set-hotkey` channels and auto-hides on blur. Since
v1.0.1 the HUD window is created lazily on first use, so it never keeps the app
alive in the background.

---

## 10. Broadcast Input

`Alt+Shift+I` · Shipped v0.9.5

**Problem.** With four split panes connected to four servers, typing `git pull` or
`systemctl restart` into each one by hand is tedious and error-prone.

**Solution.** With broadcast mode on, every keystroke in the focused pane is sent
to every PTY session in the tab simultaneously. A pulsing red frame around the
window and a banner dropping from the top edge make the mode impossible to miss.
Turning it off restores independent panes.

---

## 11. Sandboxed Plugin System

Shipped v1.0.0

**Problem.** Plugin support is usually either absent or grants plugins full Node
access, turning every plugin into a potential security hole.

**Solution.** A plugin is a `plugin.json` manifest plus an entry script under
`%APPDATA%/Bitig/plugins/<id>/`. The script runs in an isolated Node `vm` context
with no `require`, `process` or `fs`. The only reachable surface is the explicitly
allowlisted `bitig` object:

| API | Purpose |
|---|---|
| `bitig.ui.setStatusBarWidget` | Adds a live widget to the status bar |
| `bitig.actions.register` | Adds an action to the command palette and keybinding system |
| `bitig.getGitBranch` | Returns the Git branch of the active directory |
| `bitig.getSystemMemory` | Returns system memory usage |
| `bitig.openUrl` | Opens a URL in the default browser |
| `bitig.setInterval` | A timer that is cleaned up automatically when the plugin unloads |

Three reference plugins ship in the box: `git-status` (current branch),
`system-monitor` (live RAM usage) and `quick-web-search` (universal actions for
Google and Stack Overflow searches).

---

## Architectural Principles

Every feature added to Bitig has to obey these four rules.

1. **Zero latency.** Terminal text flows directly between the PTY and xterm.js.
   Additional analysis (port sniffer, secret shield, telemetry, suggestions) runs
   asynchronously and may never add perceptible input lag.
2. **Keyboard first.** Every action is bound to an `actionId`, is rebindable, and
   is reachable from the Command Palette (`Ctrl+Shift+P`).
3. **Data sovereignty.** User data — snippets, history, settings, API keys — stays
   on the user's own machine as plain JSON.
4. **Isolated plugin architecture.** Plugins run inside a Node `vm` with access
   only to allowlisted Bitig APIs; they can never reach the operating system
   directly.

---

<div align="center">
<sub><b>Bitig</b> · Old Turkic for "writing, script, written text".</sub>
</div>
