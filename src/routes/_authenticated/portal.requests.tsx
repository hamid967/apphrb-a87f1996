import { createFileRoute, useRouter } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileClock, Search, Plus } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { Button } from "@/components/ui/button";
import { listPortalRequests } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/requests")({
  head: () => portalHead({ titleAr: 'الطلبات', titleEn: 'Requests', descAr: 'تابع طلبات الصيانة والدعم.', path: '/portal/requests' }),
  component: RequestsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

const STATUSES = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "todo", ar: "جديد", en: "New" },
  { key: "in_progress", ar: "قيد التنفيذ", en: "In progress" },
  { key: "done", ar: "مكتمل", en: "Completed" },
  { key: "cancelled", ar: "ملغى", en: "Cancelled" },
];

function RequestsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const router = useRouter();

  const { data, isFetching } = useQuery({
    queryKey: ["portal", "requests", status, search],
    queryFn: () => listPortalRequests({ data: { status, search } }),
  });

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<FileClock className="size-5" />}
        title={isAr ? "طلباتي" : "My requests"}
        subtitle={isAr ? "تتبع كل طلباتك الحكومية والداخلية" : "Track every gov & internal request"}
        actions={
          <Button size="sm" onClick={() => router.invalidate()}>
            <Plus className="size-4" /> {isAr ? "طلب جديد" : "New"}
          </Button>
        }
      />
      <div className="surface-card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                (status === s.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground")
              }
            >
              {isAr ? s.ar : s.en}
            </button>
          ))}
          <div className="relative ms-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث…" : "Search…"}
              aria-label={isAr ? "بحث في الطلبات" : "Search requests"}
              className="h-9 rounded-full border border-border/60 bg-muted/30 pl-10 pr-3 text-sm outline-none focus:border-primary/50 focus:bg-background rtl:pl-3 rtl:pr-10"
            />
          </div>
        </div>
        {isFetching && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isAr ? "لا توجد طلبات" : "No requests"}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.items.map((r: any) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileClock className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  {r.description && (
                    <div className="line-clamp-1 text-[11px] text-muted-foreground">
                      {r.description}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
