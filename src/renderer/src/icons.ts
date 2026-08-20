/**
 * Bitig ikon seti — tek satirlik, stroke tabanli SVG'ler.
 *
 * Emoji yerine bunlar kullanilir: emoji her platformda farkli render edilir,
 * temanin rengini almaz ve kompakt bir arayuzde optik olarak agir durur.
 * Buradaki ikonlar `currentColor` ile boyanir, boylece hover/aktif
 * durumlarinda metinle birlikte renk degistirir.
 *
 * Kullanim: `icon('terminal')` -> innerHTML'e gomulebilen SVG string'i.
 * Boyut CSS'ten gelir (`.bitig-icon { width: 1em; height: 1em }`), gerekirse
 * ikinci parametreyle piksel olarak ezilebilir.
 */

const PATHS: Record<string, string> = {
  // Genel
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 5"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  search: '<circle cx="7.2" cy="7.2" r="4.2"/><path d="M10.4 10.4L13.5 13.5"/>',
  copy: '<rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.6"/><path d="M10.5 5.5V4.1A1.6 1.6 0 0 0 8.9 2.5H4.1A1.6 1.6 0 0 0 2.5 4.1v4.8a1.6 1.6 0 0 0 1.6 1.6h1.4"/>',
  paste: '<rect x="3.5" y="3" width="9" height="10.5" rx="1.6"/><path d="M6 3V2.2a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7V3"/>',
  trash: '<path d="M2.8 4.3h10.4M6.4 4.3V3.1a.9.9 0 0 1 .9-.9h1.4a.9.9 0 0 1 .9.9v1.2M4.2 4.3l.6 8a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8"/>',
  pencil: '<path d="M10.6 2.6a1.6 1.6 0 0 1 2.3 2.3L5.6 12.2l-3 .7.7-3z"/>',
  ban: '<circle cx="8" cy="8" r="5.5"/><path d="M4.1 4.1l7.8 7.8"/>',
  refresh: '<path d="M13 7A5 5 0 1 0 12 11"/><path d="M13 3v4h-4"/>',
  undo: '<path d="M3 8a5 5 0 1 1 1.6 3.7"/><path d="M3 4.5V8h3.5"/>',
  folder: '<path d="M2 5.2a1.4 1.4 0 0 1 1.4-1.4h2.3l1.3 1.6h4.6A1.4 1.4 0 0 1 13 6.8v4.4a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 11.2z"/>',
  arrowLeft: '<path d="M12.5 8h-9M7 3.5L2.5 8 7 12.5"/>',
  alert: '<path d="M8 2.6l5.6 9.8H2.4z"/><path d="M8 6.4v2.6M8 11h.01"/>',
  dot: '<circle cx="8" cy="8" r="3.2" fill="currentColor" stroke="none"/>',
  play: '<path d="M5 3.4l7 4.6-7 4.6z"/>',

  // Alan ikonlari
  palette:
    '<path d="M8 1.8a6.2 6.2 0 0 0 0 12.4c.9 0 1.4-.6 1.4-1.3 0-.8-.7-1.1-.7-1.9 0-.6.5-1.1 1.1-1.1h1.3a3.1 3.1 0 0 0 3.1-3.1C14.2 4.1 11.4 1.8 8 1.8z"/><circle cx="5.2" cy="6.4" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="4.9" r=".9" fill="currentColor" stroke="none"/><circle cx="10.9" cy="6.2" r=".9" fill="currentColor" stroke="none"/>',
  terminal: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8"/><path d="M4.8 6.4L6.9 8l-2.1 1.6M8.6 10.2h2.8"/>',
  keyboard:
    '<rect x="1.5" y="4" width="13" height="8" rx="1.6"/><path d="M4.2 6.6h.01M6.6 6.6h.01M9 6.6h.01M11.4 6.6h.01M4.9 9.4h6.2"/>',
  sparkle:
    '<path d="M8 2l1.3 3.4L12.7 6.7 9.3 8 8 11.4 6.7 8 3.3 6.7 6.7 5.4z"/><path d="M12.4 10.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/>',
  radar: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.4"/><path d="M8 8l3.6-3.6"/>',
  bell: '<path d="M4.4 6.6a3.6 3.6 0 0 1 7.2 0c0 3 1.2 3.9 1.2 3.9H3.2s1.2-.9 1.2-3.9z"/><path d="M6.7 12.6a1.5 1.5 0 0 0 2.6 0"/>',
  plug: '<path d="M6.2 2.2v3M9.8 2.2v3M4.4 5.2h7.2v2.4a3.6 3.6 0 0 1-7.2 0z"/><path d="M8 11.2v2.6"/>',
  zap: '<path d="M8.9 1.8L3.6 8.7h3.7l-.8 5.5 5.3-6.9H8.1z"/>',
  branch:
    '<circle cx="4.5" cy="3.6" r="1.7"/><circle cx="4.5" cy="12.4" r="1.7"/><circle cx="11.5" cy="4.8" r="1.7"/><path d="M4.5 5.3v5.4M11.5 6.5c0 2.4-2.4 2.6-4.2 3.1"/>',
  drive:
    '<rect x="1.8" y="8.4" width="12.4" height="4.4" rx="1.4"/><path d="M3.4 8.4l1.8-4a1.3 1.3 0 0 1 1.2-.8h3.2a1.3 1.3 0 0 1 1.2.8l1.8 4"/><path d="M11.6 10.6h.01"/>',
  splitH: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6"/><path d="M8 2.8v10.4"/>',
  splitV: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6"/><path d="M1.8 8h12.4"/>',
  expand: '<path d="M6.2 2.4H2.4v3.8M9.8 13.6h3.8V9.8M2.4 9.8v3.8h3.8M13.6 6.2V2.4H9.8"/>',
  eraser:
    '<path d="M6.6 13.2H13"/><path d="M9.1 2.9l4 4a1.3 1.3 0 0 1 0 1.9l-4.4 4.4H5.9l-3-3a1.3 1.3 0 0 1 0-1.9l4.3-4.4a1.3 1.3 0 0 1 1.9 0z"/>',
  book: '<path d="M2.6 3.4a1.4 1.4 0 0 1 1.4-1.4h7.2a1.4 1.4 0 0 1 1.4 1.4v9.2H4a1.4 1.4 0 0 0-1.4 1.4z"/><path d="M2.6 12.6A1.4 1.4 0 0 1 4 11.2h9"/>',
  window:
    '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6"/><path d="M1.8 5.8h12.4"/>'
};

/** İkonun SVG string'ini dondurur; bilinmeyen ad icin bos string. */
export function icon(name: keyof typeof PATHS | string, size?: number): string {
  const body = PATHS[name];
  if (!body) return '';
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return (
    `<svg class="bitig-icon" viewBox="0 0 16 16"${dim} fill="none" stroke="currentColor" ` +
    `stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  );
}

export type IconName = keyof typeof PATHS;
