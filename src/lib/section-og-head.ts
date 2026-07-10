/**
 * Shared head() helper for the four top-level authenticated sections
 * (Dashboard, Admin, Accounting, Assistant). Reflects the section name
 * and the current entity (if any) inside title + og subtitle so every
 * screen and detail page has a distinctive, section-aware preview.
 */
import { ogImageMeta, type OgKind } from "@/lib/og-image";

export type SectionKey = "dashboard" | "admin" | "accounting" | "assistant";

type Labels = { ar: string; en: string };

export const SECTION_LABELS: Record<SectionKey, Labels> = {
  dashboard: { ar: "لوحة التحكم", en: "Dashboard" },
  admin: { ar: "لوحة المشرف", en: "Admin" },
  accounting: { ar: "المحاسبة", en: "Accounting" },
  assistant: { ar: "المساعد الذكي", en: "Assistant" },
};

const BASE = "https://hrhbs.com";
const BRAND = "HBSpro";

export type SectionHeadInput = {
  section: SectionKey;
  /** Arabic entity/screen name (e.g. "العقود", "عقد #12345"). Optional. */
  entityAr?: string;
  /** English entity/screen name (mirror of entityAr). Optional. */
  entityEn?: string;
  /** Arabic description (falls back to a generic section description). */
  descAr?: string;
  /** Optional path under hrhbs.com for canonical + og:url. */
  path?: string;
  /** OG accent kind (defaults to "dashboard"). */
  kind?: OgKind;
  /** Emit robots noindex (default true — authenticated surfaces). */
  noindex?: boolean;
};

export function sectionHead(input: SectionHeadInput) {
  const {
    section,
    entityAr,
    entityEn,
    descAr,
    path,
    kind = "dashboard",
    noindex = true,
  } = input;
  const s = SECTION_LABELS[section];

  // Card title reflects the entity, then the section, then the brand.
  const cardTitleAr = entityAr ? `${entityAr} · ${s.ar}` : s.ar;
  const fullTitle = entityAr
    ? `${entityAr} — ${s.ar} · ${BRAND}`
    : `${s.ar} — ${BRAND}`;
  const subtitle = `${entityEn ?? s.en} · ${BRAND} ${s.en}`;
  const description =
    descAr ?? `${entityAr ? `${entityAr} داخل ` : ""}${s.ar} في ${BRAND}.`;
  const url = path ? `${BASE}${path}` : undefined;

  const meta: Array<
    { title: string } | { name: string; content: string } | { property: string; content: string }
  > = [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    ...ogImageMeta({
      title: cardTitleAr,
      subtitle,
      kind,
      lang: "ar",
      url,
    }),
  ];
  if (noindex) meta.splice(2, 0, { name: "robots", content: "noindex,nofollow" });

  return {
    meta,
    ...(url ? { links: [{ rel: "canonical", href: url }] } : {}),
  };
}