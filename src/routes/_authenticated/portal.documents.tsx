import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Search, Upload } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { Button } from "@/components/ui/button";
import { listPortalDocuments } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/documents")({
  head: () => portalHead({ titleAr: 'المستندات', titleEn: 'Documents', descAr: 'كل عقودك ومستنداتك في مكان واحد.', path: '/portal/documents' }),
  component: DocumentsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

const CATS = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "contract", ar: "عقود", en: "Contracts" },
  { key: "invoice", ar: "فواتير", en: "Invoices" },
  { key: "identification", ar: "هويات", en: "IDs" },
  { key: "license", ar: "تراخيص", en: "Licenses" },
  { key: "report", ar: "تقارير", en: "Reports" },
  { key: "other", ar: "أخرى", en: "Other" },
];

function DocumentsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["portal", "documents", category, search],
    queryFn: () => listPortalDocuments({ data: { category, search } }),
  });
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<FolderOpen className="size-5" />}
        title={isAr ? "الوثائق" : "Documents"}
        subtitle={isAr ? "مكتبة الوثائق مع تحليل OCR/AI" : "Central library with OCR & AI analysis"}
        actions={
          <Button size="sm">
            <Upload className="size-4" /> {isAr ? "رفع" : "Upload"}
          </Button>
        }
      />
      <div className="surface-card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                (category === c.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground")
              }
            >
              {isAr ? c.ar : c.en}
            </button>
          ))}
          <div className="relative ms-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث…" : "Search…"}
              aria-label={isAr ? "بحث في الوثائق" : "Search documents"}
              className="h-9 rounded-full border border-border/60 bg-muted/30 pl-10 pr-3 text-sm outline-none focus:border-primary/50 focus:bg-background rtl:pl-3 rtl:pr-10"
            />
          </div>
        </div>
        {isFetching && !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isAr ? "لا وثائق" : "No documents"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((d: any) => (
              <div
                key={d.id}
                className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur transition hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <FolderOpen className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{d.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {d.category ?? "—"} • {d.status ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
