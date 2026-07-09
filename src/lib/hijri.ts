/**
 * Hijri date utilities — pure Intl (islamic-umalqura). Zero dependencies.
 * Works both on server (SSR) and client.
 */

const HIJRI_LONG_AR = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const HIJRI_LONG_EN = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const HIJRI_SHORT_AR = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const HIJRI_SHORT_EN = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export type HijriStyle = "long" | "short";

function coerce(input: Date | string | number | null | undefined): Date | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toHijri(
  input: Date | string | number | null | undefined,
  opts: { locale?: "ar" | "en"; style?: HijriStyle } = {},
): string {
  const d = coerce(input);
  if (!d) return "—";
  const isAr = (opts.locale ?? "ar") === "ar";
  const short = opts.style === "short";
  const fmt = short ? (isAr ? HIJRI_SHORT_AR : HIJRI_SHORT_EN) : isAr ? HIJRI_LONG_AR : HIJRI_LONG_EN;
  return `${fmt.format(d)} هـ`;
}

/** Numeric hijri parts (year/month/day) for programmatic use (e.g. VAT period). */
export function toHijriParts(input: Date | string | number): { year: number; month: number; day: number } | null {
  const d = coerce(input);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}
