import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Search, History, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { sectionHead } from "@/lib/section-og-head";
import {
  HUB_SERVICES,
  HUB_CATEGORIES,
  type HubCategoryKey,
  type HubService,
} from "@/lib/services-hub-catalog";
import { recordServiceAccess, useServiceAccessLog } from "@/lib/service-access-log";

export const Route = createFileRoute(
  "/_authenticated/dashboard/services/",
)({
  head: () => sectionHead({ section: "dashboard", entityAr: "الخدمات", entityEn: "Services", path: "/dashboard/services" }),
  component: ServicesReportPage,
});

const SERVICES: HubService[] = HUB_SERVICES;
const CATEGORIES = HUB_CATEGORIES;
type CategoryKey = HubCategoryKey;

function ServicesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey>("all");

  const recent = useServiceAccessLog();
  const recentServices = useMemo(() => {
    const seen = new Set<string>();
    const list: { service: HubService; ts: number }[] = [];
    for (const entry of recent) {
      if (seen.has(entry.id)) continue;
      const svc = SERVICES.find((s) => s.id === entry.id);
      if (!svc) continue;
      seen.add(entry.id);
      list.push({ service: svc, ts: entry.ts });
      if (list.length >= 6) break;
    }
    return list;
  }, [recent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SERVICES.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (!q) return true;
      const hay = [
        s.titleAr,
        s.titleEn,
        s.descAr,
        s.descEn,
        ...s.featuresAr,
        ...s.featuresEn,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, cat]);



  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 end-[-4rem] h-52 w-52 rounded-full bg-primary/20 blur-3xl"
        />
        <Badge variant="secondary" className="mb-3">
          {isAr ? "تقرير الخدمات" : "Services Report"}
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {isAr
            ? "جميع خدمات منصة عقاري في مكان واحد"
            : "All HBSpro services in one place"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {isAr
            ? "استعرض الأقسام كبطاقات تفاعلية، ابحث بسرعة، وتنقّل مباشرة إلى الخدمة التي تحتاجها."
            : "Browse sections as interactive cards, search fast, and jump straight to the service you need."}
        </p>

        {/* Search + filters */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? "ابحث عن خدمة..." : "Search services..."}
              className="ps-9"
              aria-label={isAr ? "بحث" : "Search"}
            />
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((c) => {
              const active = cat === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCat(c.key)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {isAr ? c.ar : c.en}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recently visited */}
      {recentServices.length > 0 && (
        <section
          aria-label={isAr ? "آخر الخدمات المستخدمة" : "Recently visited services"}
          className="rounded-2xl border border-border/70 bg-card/60 p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" />
            {isAr ? "آخر الخدمات المستخدمة" : "Recently visited"}
          </div>
          <div className="flex flex-wrap gap-2">
            {recentServices.map(({ service, ts }) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.id}
                  to="/dashboard/services/$key"
                  params={{ key: service.id }}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-primary/50 hover:text-primary"
                >
                  <Icon className="size-3.5" />
                  <span>{isAr ? service.titleAr : service.titleEn}</span>
                  <span className="text-[10px] text-muted-foreground">
                    · {formatDistanceToNow(new Date(ts), { addSuffix: true, locale: isAr ? arLocale : enUS })}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick nav */}
      <nav
        aria-label={isAr ? "تنقّل سريع" : "Quick navigation"}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {filtered.map((s) => (
          <a
            key={s.id}
            href={`#svc-${s.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <s.icon className="size-3.5" />
            {isAr ? s.titleAr : s.titleEn}
          </a>
        ))}
      </nav>


      {/* Cards grid */}
      <motion.section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.04 } },
        }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((s) => {
            const Icon = s.icon;
            return (
              <motion.article
                id={`svc-${s.id}`}
                key={s.id}
                layout
                variants={{
                  hidden: { opacity: 0, y: 16, scale: 0.97 },
                  show: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 260, damping: 22 },
                  },
                }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                whileHover={{ y: -4 }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_4px_20px_-12px_hsl(var(--primary)/0.35)] transition-colors hover:border-primary/40"
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-0 -top-12 h-32 bg-gradient-to-b ${s.hue} opacity-70 blur-2xl`}
                />
                <div className="relative z-10 flex items-start justify-between gap-3">
                  <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="size-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {isAr
                      ? CATEGORIES.find((c) => c.key === s.category)?.ar
                      : CATEGORIES.find((c) => c.key === s.category)?.en}
                  </Badge>
                </div>
                <h2 className="relative z-10 mt-4 text-base font-bold text-foreground">
                  {isAr ? s.titleAr : s.titleEn}
                </h2>
                <p className="relative z-10 mt-1 text-xs text-muted-foreground">
                  {isAr ? s.descAr : s.descEn}
                </p>
                <ul className="relative z-10 mt-3 flex flex-wrap gap-1.5">
                  {(isAr ? s.featuresAr : s.featuresEn).map((f) => (
                    <li
                      key={f}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="relative z-10 mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    {isAr ? "افتح الخدمة" : "Open service"}
                  </span>
                  <Link
                    to={s.to}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
                  >
                    {isAr ? "فتح" : "Open"}
                    <motion.span
                      animate={{ x: [0, isAr ? -3 : 3, 0] }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="inline-flex"
                    >
                      <Arrow className="size-3.5" />
                    </motion.span>
                  </Link>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </motion.section>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد نتائج مطابقة." : "No matching services."}
        </div>
      )}
    </div>
  );
}
