/**
 * Font kesfi: sistemdeki fontlari monospace olanlarla sinirlar ve her
 * birinin gercekten Nerd Font glyph'i barindirip barindirmadigini olcer.
 *
 * Iki sinyal de tarayicida (renderer) olculuyor, cunku sorulan sey
 * "isletim sisteminde ne kurulu" degil, "xterm bu fontu kullandiginda ne
 * cizilecek" - ve cevabi veren tek yer fontu gercekten cizen motor.
 */

export interface FontInfo {
  family: string;
  /** Glyph olcumuyle dogrulanmis Nerd Font ikon destegi. */
  hasNerdGlyphs: boolean;
}

/**
 * Nerd Font ikonlari Unicode Private Use Area'da yasar ve farkli ikon
 * setleri farkli bloklara dagilir. Kod noktalarini gorunmez PUA
 * karakterleri yerine acik escape'lerle yaziyoruz: kaynak dosyada
 * okunabilir kaliyorlar ve arac zincirinde sessizce kaybolmuyorlar
 * (ilk yazimda tam bunu yasadik - karakterler bosluga donusmustu).
 *
 * Hepsinin birden bulunmasi araniyor: Cascadia Code gibi bazi normal
 * fontlar Powerline glyph'lerini icerir ama Devicons/Font Awesome
 * setlerini icermez. Tek bir eslesmeyi yeterli saymak bu fontlari
 * yanlislikla "Nerd Font" olarak etiketliyordu.
 */
const NERD_FONT_PROBE_CODEPOINTS = [
  '\uE0B0', // Powerline: dolu sag ok
  '\uE706', // Devicons
  '\uF09B', // Font Awesome (GitHub)
  '\uF07B' // Font Awesome (klasor)
];

/** Kesinlikle kurulu olmayan bir isim: tarayici bunu varsayilan fonta dusurur. */
const MISSING_FONT_SENTINEL = 'BitigNoSuchFontFamily__';

const PROBE_FONT_SIZE = 32;

let probeContext: CanvasRenderingContext2D | null = null;

function getProbeContext(): CanvasRenderingContext2D | null {
  if (probeContext) return probeContext;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  probeContext = canvas.getContext('2d', { willReadFrequently: true });
  return probeContext;
}

/** CSS font-family degeri olarak guvenli sekilde tirnaklar. */
function quoteFamily(family: string): string {
  return `"${family.replace(/"/g, '\\"')}"`;
}

/**
 * Monospace testi: dar bir karakter ('i') ile genis bir karakterin ('W')
 * ilerleme genisligi ayni mi? Sabit genislikli fontlarda esittir.
 */
function isMonospace(ctx: CanvasRenderingContext2D, family: string): boolean {
  ctx.font = `${PROBE_FONT_SIZE}px ${quoteFamily(family)}, monospace`;
  const narrow = ctx.measureText('i').width;
  const wide = ctx.measureText('W').width;
  if (narrow === 0 || wide === 0) return false;
  return Math.abs(narrow - wide) < 0.01;
}

/**
 * Bir karakterin ciziminin piksel imzasi. Genislik karsilastirmasi tek
 * basina yeterli degil: monospace bir fontta eksik glyph'in yerine gecen
 * "tofu" kutusu da ayni ilerleme genisligine sahip olur. Bu yuzden
 * gercekten cizilen pikselleri karsilastiriyoruz. Tum piksel dizisini
 * string'e cevirmek yerine (olcum basina ~16KB) ucuz bir sayisal
 * checksum uretiyoruz - dosya boyunca yuzlerce olcum yapiliyor.
 */
function renderSignature(ctx: CanvasRenderingContext2D, char: string, fontStack: string): number {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = `${PROBE_FONT_SIZE}px ${fontStack}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(char, 4, 4);

  const { data } = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  let hash = 0;
  // Sadece alfa kanali (her 4. bayt) yeterli: metni duz beyaz ciziyoruz,
  // yani bilgi tamamen hangi piksellerin kaplandiginda.
  for (let i = 3; i < data.length; i += 4) {
    hash = (hash * 31 + data[i]) | 0;
  }
  return hash;
}

/**
 * Hicbir fontun eslemedigi bir kod noktasi (Plane 16 PUA'nin sonu):
 * cizildiginde her zaman "eksik glyph" (tofu/notdef) uretir, yani o
 * fontun "bu karakter bende yok" gorunumunun referansi olur.
 */
const KNOWN_MISSING_CHAR = '\u{10FFFD}';

// Ayni font yigini icin tofu referansi sabittir; font basina bir kez
// hesaplanip saklanir.
const notdefSignatures = new Map<string, number>();

function getNotdefSignature(ctx: CanvasRenderingContext2D, fontStack: string): number {
  const cached = notdefSignatures.get(fontStack);
  if (cached !== undefined) return cached;
  const signature = renderSignature(ctx, KNOWN_MISSING_CHAR, fontStack);
  notdefSignatures.set(fontStack, signature);
  return signature;
}

/**
 * Fontun bu karakter icin kendi glyph'i var mi?
 *
 * Karakteri adayla cizip, AYNI font yiginiyla cizilen "kesinlikle eksik"
 * bir karakterle karsilastiriyoruz: sonuc aynysa aday da tofu cizmis,
 * yani glyph yok demektir.
 *
 * Ilk denemede aday yiginini "sadece yedek font" yiginiyla
 * karsilastiriyorduk; bu yanlis pozitif uretiyordu. Iki farkli yigin
 * farkli font metrikleri (ascent) kullaniyor, textBaseline='top' ile
 * ayni tofu glyph'i bile farkli y konumuna dusuyor ve imzalar
 * farklilasiyordu - yani glyph varligini degil metrik farkini
 * olcuyorduk. Ayni yigini kullanmak bu degiskeni ortadan kaldiriyor.
 */
function hasGlyph(ctx: CanvasRenderingContext2D, family: string, char: string): boolean {
  const fontStack = `${quoteFamily(family)}, ${quoteFamily(MISSING_FONT_SENTINEL)}`;
  return renderSignature(ctx, char, fontStack) !== getNotdefSignature(ctx, fontStack);
}

export function hasNerdFontGlyphs(family: string): boolean {
  const ctx = getProbeContext();
  if (!ctx) return false;
  // every, some degil: bkz. NERD_FONT_PROBE_CODEPOINTS uzerindeki not.
  return NERD_FONT_PROBE_CODEPOINTS.every((char) => hasGlyph(ctx, family, char));
}

/**
 * Sistemdeki fontlari alir, terminalde kullanilabilir olanlara (monospace)
 * indirger ve her biri icin Nerd Font ikon destegini olcer.
 * `alwaysInclude`, o an secili olan fontun (artik kurulu degilse ya da
 * monospace algilanmadiysa bile) listeden dusup secimin gorunmez
 * olmasini engeller.
 */
export async function loadUsableFonts(alwaysInclude?: string): Promise<FontInfo[]> {
  const families = await window.bitig.fonts.list();
  const ctx = getProbeContext();
  if (!ctx) return [];

  const usable = families.filter((family) => isMonospace(ctx, family));
  if (alwaysInclude && !usable.includes(alwaysInclude)) {
    usable.unshift(alwaysInclude);
  }

  return usable.map((family) => ({ family, hasNerdGlyphs: hasNerdFontGlyphs(family) }));
}
