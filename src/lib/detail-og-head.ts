/**
 * Head helper for dashboard *detail* pages (contract $id, expense
 * batch $batchId, audit $id, …). The record itself isn't fetched here
 * (that happens in the component's useQuery), so the OG is built from
 * the URL parameter — enough to make each shared link visually
 * distinct without an extra server roundtrip in the loader.
 */
import { type OgKind } from "@/lib/og-image";
import { sectionHead, type SectionKey } from "@/lib/section-og-head";

export type DetailHeadInput = {
  /** Arabic entity label e.g. "عقد" / "دفعة مصروفات". */
  entityAr: string;
  /** English entity label e.g. "Contract" / "Expense Batch". */
  entityEn: string;
  /** The id/param value to render on the card. */
  id: string;
  /** Path under hrhbs.com (used for canonical + og:url). */
  path: string;
  /** OG kind for accent color (defaults to "dashboard"). */
  kind?: OgKind;
  /** Which top-level section owns this detail page (default "dashboard"). */
  section?: SectionKey;
};

export function detailHead(input: DetailHeadInput) {
  const { entityAr, entityEn, id, path, kind = "dashboard", section = "dashboard" } = input;
  const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return sectionHead({
    section,
    entityAr: `${entityAr} #${shortId}`,
    entityEn: `${entityEn} #${shortId}`,
    descAr: `تفاصيل ${entityAr} رقم ${shortId}.`,
    path,
    kind,
    noindex: true,
  });
}
