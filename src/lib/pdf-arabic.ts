// Load Noto Naskh Arabic into a jsPDF instance and shape Arabic text so
// jsPDF (which has no Arabic support out of the box) renders it correctly
// instead of tofu / boxes. Font is fetched once and cached.
import type jsPDF from "jspdf";

let _cache: Promise<{ regular: string; bold: string }> | null = null;

const FONT_BASE =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic";

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed (${res.status}) for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as number[]);
  }
  return btoa(bin);
}

async function loadFonts() {
  if (!_cache) {
    _cache = Promise.all([
      fetchBase64(`${FONT_BASE}/NotoNaskhArabic-Regular.ttf`),
      fetchBase64(`${FONT_BASE}/NotoNaskhArabic-Bold.ttf`),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return _cache;
}

export const ARABIC_FONT = "NotoNaskhArabic";

/** Register Arabic fonts on the jsPDF doc. Call once per document. */
export async function registerArabicFont(doc: jsPDF): Promise<void> {
  const { regular, bold } = await loadFonts();
  doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", regular);
  doc.addFont("NotoNaskhArabic-Regular.ttf", ARABIC_FONT, "normal");
  doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", bold);
  doc.addFont("NotoNaskhArabic-Bold.ttf", ARABIC_FONT, "bold");
}

/** Shape Arabic text (contextual joining + bidi reorder) for jsPDF. */
export async function shapeArabic(text: string): Promise<string> {
  if (!/[\u0600-\u06FF]/.test(text)) return text;
  const [{ default: reshaper }, { default: bidiFactory }] = await Promise.all([
    // @ts-ignore - no types
    import("arabic-reshaper"),
    // @ts-ignore - no types
    import("bidi-js"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reshaped = (reshaper as any).convertArabic(text);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bidi = (bidiFactory as any)();
  const levels = bidi.getEmbeddingLevels(reshaped, "rtl");
  return bidi.getReorderedString(reshaped, levels);
}

/** Synchronous shape variant — requires the modules to already be loaded. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeShaper(reshaper: any, bidi: any) {
  return (text: string) => {
    if (!/[\u0600-\u06FF]/.test(text)) return text;
    const reshaped = reshaper.convertArabic(text);
    const levels = bidi.getEmbeddingLevels(reshaped, "rtl");
    return bidi.getReorderedString(reshaped, levels);
  };
}
