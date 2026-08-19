import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { initTitleBar } from './titlebar';
import { BITIG_TERMINAL_THEME } from './theme';

/**
 * Minimal prototip: tek xterm.js instance'i, tek PTY oturumuna baglanir.
 * Sekme/pane cogullugu ileride bir store (zustand vb.) ile eklenecek.
 */
async function bootstrap(): Promise<void> {
  initTitleBar();

  const container = document.getElementById('terminal-root');
  if (!container) throw new Error('terminal-root bulunamadi');

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: 14,
    lineHeight: 1.25,
    scrollback: 5000,
    theme: BITIG_TERMINAL_THEME
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  terminal.open(container);
  fitAddon.fit();

  const { id } = await window.bitig.pty.create({ cols: terminal.cols, rows: terminal.rows });

  terminal.onData((data) => window.bitig.pty.write(id, data));

  window.bitig.pty.onData((event) => {
    if (event.id === id) terminal.write(event.data);
  });

  window.bitig.pty.onExit((event) => {
    if (event.id === id) {
      terminal.write(`\r\n[proses sonlandi, exit code: ${event.exitCode}]\r\n`);
    }
  });

  window.addEventListener('resize', () => {
    fitAddon.fit();
    window.bitig.pty.resize(id, terminal.cols, terminal.rows);
  });

  window.addEventListener('beforeunload', () => {
    window.bitig.pty.dispose(id);
  });

  terminal.focus();
}

void bootstrap();
