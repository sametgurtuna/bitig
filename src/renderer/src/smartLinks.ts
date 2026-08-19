import type { ILink, Terminal } from '@xterm/xterm';

/**
 * xterm.js terminaline ozel dosya baglantisi yakalayici kaydeder.
 * Terminal ciktisindaki dosya yollari ve satir/sutun numaralarini (orn. `src/main.ts:42:15`, `C:\app\index.js:10`)
 * xterm.js uzerinde tiklanabilir link haline getirir ve editorde acar.
 */
export function registerSmartLinks(
  terminal: Terminal,
  getCwd: () => string | undefined
): void {
  const fileRegex =
    /(?:[a-zA-Z]:[\\/][^\s:'"]+|(?:\.\/|\.\.\/|[a-zA-Z0-9_\-]+[\\/])[^\s:'"]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g;

  terminal.registerLinkProvider({
    provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
      const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      fileRegex.lastIndex = 0;
      const links: ILink[] = [];
      let match: RegExpExecArray | null;

      while ((match = fileRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const lineNum = match[1] ? parseInt(match[1], 10) : undefined;
        const colNum = match[2] ? parseInt(match[2], 10) : undefined;

        // Dosya yolundan :satir:sutun kismini cikar
        const rawPath = fullMatch.replace(/:\d+(?::\d+)?$/, '');
        const startIndex = match.index + 1; // xterm 1-indexed sutun bekler
        const length = fullMatch.length;

        links.push({
          range: {
            start: { x: startIndex, y: bufferLineNumber },
            end: { x: startIndex + length - 1, y: bufferLineNumber }
          },
          text: fullMatch,
          activate: (_event, _text) => {
            const cwd = getCwd();
            let resolvedPath = rawPath;
            // Eger goreceli yol ise ve CWD biliniyorsa birlestir
            if (!rawPath.match(/^[a-zA-Z]:[\\/]/) && cwd) {
              resolvedPath = `${cwd.replace(/[\\/]$/, '')}/${rawPath.replace(/^\.[\\/]/, '')}`;
            }

            void window.bitig.cockpit.openFile({
              filePath: resolvedPath,
              line: lineNum,
              column: colNum
            });
          }
        });
      }

      callback(links);
    }
  });
}
