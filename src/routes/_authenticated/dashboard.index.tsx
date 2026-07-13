import {
  createFileRoute,
  Link,
  stripSearchParams,
  retainSearchParams,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { sectionHead } from "@/lib/section-og-head";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listProperties } from "@/lib/properties.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Home,
  CheckCircle2,
  KeyRound,
  Coins,
  Search,
  Building2,
  SlidersHorizontal,
  Bookmark,
  BookmarkPlus,
  Check,
  Trash2,
  X,
  TrendingUp,
  FileText,
  Users2,
  AlertCircle,
  BellRing,
  ChevronLeft,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  CartesianGrid,
} from "recharts";
import { can, type OrgRole } from "@/lib/permissions";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { AnalyticsPanels } from "@/components/dashboard/AnalyticsPanels";
import { SaudiMap } from "@/components/dashboard/SaudiMap";
import { AIRecommendations } from "@/components/dashboard/AIRecommendations";
import { AssistantDock } from "@/components/dashboard/AssistantDock";
import { RightPanel } from "@/components/dashboard/RightPanel";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { AutoDashboardPanel } from "@/components/dashboard/AutoDashboardPanel";
import { QuickExpenseWidget } from "@/components/dashboard/QuickExpenseWidget";
import { ServicesGrid } from "@/components/dashboard/ServicesGrid";
import { WelcomeChecklist } from "@/components/dashboard/WelcomeChecklist";
import { SubscriptionStatusCard } from "@/components/dashboard/SubscriptionStatusCard";
import { SubscriptionAuditTrail } from "@/components/dashboard/SubscriptionAuditTrail";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { supabase } from "@/integrations/supabase/client";
import { PendingApprovalsPanel } from "@/components/dashboard/PendingApprovalsPanel";
import { SmartRemindersPanel } from "@/components/dashboard/SmartRemindersPanel";
import {
  SortableDashboard,
  type DashboardSection,
} from "@/components/dashboard/SortableDashboard";
import { useAuth } from "@/hooks/use-auth";

const FILTERS = ["all", "sale", "rent"] as const;
type Filter = (typeof FILTERS)[number];

const VIEWS = ["classic", "smart"] as const;
type ViewMode = (typeof VIEWS)[number];

const SORTS = ["relevance", "newest", "oldest", "priceAsc", "priceDesc"] as const;
type SortKey = (typeof SORTS)[number];

const PROPERTY_TYPES = [
  "apartment",
  "villa",
  "office",
  "land",
  "shop",
  "warehouse",
  "building",
  "farm",
  "chalet",
  "other",
] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];
const STATUSES = ["available", "reserved", "sold", "rented", "inactive"] as const;
type Status = (typeof STATUSES)[number];
const BED_BATH = [0, 1, 2, 3, 4, 5] as const;

type DashSearch = {
  q: string;
  filter: Filter;
  sort: SortKey;
  type: "all" | PropertyType;
  status: "all" | Status;
  minBeds: number;
  minBaths: number;
  page: number;
  scrollY: number;
  view: ViewMode;
};

type SavedView = { id: string; name: string; search: DashSearch };
const viewsKey = (orgId: string) => `aqary:dashboard-views:${orgId}`;

type AdvFilters = Pick<DashSearch, "type" | "status" | "minBeds" | "minBaths">;
type SavedPreset = { id: string; name: string; filters: AdvFilters };
const presetsKey = (orgId: string) => `aqary:dashboard-presets:${orgId}`;
const sameAdv = (a: AdvFilters, b: AdvFilters) =>
  a.type === b.type &&
  a.status === b.status &&
  a.minBeds === b.minBeds &&
  a.minBaths === b.minBaths;
const DEFAULT_SEARCH: DashSearch = {
  q: "",
  filter: "all",
  sort: "relevance",
  type: "all",
  status: "all",
  minBeds: 0,
  minBaths: 0,
  page: 1,
  scrollY: 0,
  view: "classic",
};
const sameSearch = (a: DashSearch, b: DashSearch) =>
  a.q === b.q &&
  a.filter === b.filter &&
  a.sort === b.sort &&
  a.type === b.type &&
  a.status === b.status &&
  a.minBeds === b.minBeds &&
  a.minBaths === b.minBaths &&
  a.view === b.view;

const dashboardSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  filter: fallback(z.enum(FILTERS), "all").default("all"),
  sort: fallback(z.enum(SORTS), "relevance").default("relevance"),
  type: fallback(z.enum(["all", ...PROPERTY_TYPES] as const), "all").default("all"),
  status: fallback(z.enum(["all", ...STATUSES] as const), "all").default("all"),
  minBeds: fallback(z.coerce.number().int().min(0).max(5), 0).default(0),
  minBaths: fallback(z.coerce.number().int().min(0).max(5), 0).default(0),
  page: fallback(z.coerce.number().int().min(1).max(500), 1).default(1),
  scrollY: fallback(z.coerce.number().min(0), 0).default(0),
  view: fallback(z.enum(VIEWS), "classic").default("classic"),
});

export const Route = createFileRoute("/_authenticated/dashboard/")({
  validateSearch: zodValidator(dashboardSearchSchema),
  search: {
    // Keep the URL clean when opening /dashboard from the root: strip any
    // fields that equal their defaults, and only retain params explicitly
    // set by the user across navigations.
    middlewares: [retainSearchParams(true), stripSearchParams(DEFAULT_SEARCH)],
  },
  component: Dashboard,
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "النظرة العامة",
      entityEn: "Overview",
      descAr: "نظرة شاملة على العقارات والوحدات والعقود والإيرادات.",
      path: "/dashboard",
    }),
});

function Dashboard() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { user } = useAuth();
  const { q, filter, sort, type, status, minBeds, minBaths, page, scrollY, view } =
    Route.useSearch();
  const navigate = Route.useNavigate();
  const currentSearch: DashSearch = {
    q,
    filter,
    sort,
    type,
    status,
    minBeds,
    minBaths,
    page,
    scrollY,
    view,
  };
  const setSearch = (patch: Partial<DashSearch>, resetPaging = true) =>
    navigate({
      search: (prev: DashSearch) => ({
        ...prev,
        ...patch,
        ...(resetPaging ? { page: 1, scrollY: 0 } : {}),
      }),
      replace: true,
    });
  const applyView = (v: DashSearch) =>
    navigate({
      search: () => ({ ...v, page: v.page ?? 1, scrollY: v.scrollY ?? 0 }),
      replace: true,
    });
  const activeAdvancedCount =
    (type !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (minBeds > 0 ? 1 : 0) +
    (minBaths > 0 ? 1 : 0);

  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canCreate = can.createProperty(role);

  // Onboarding progress — used to render an inline Empty State when the user
  // has not finished the required setup steps yet, instead of a blank page
  // while the outer redirect effect races to fire.
  const REQUIRED_STEPS = ["profile", "company", "first_receipt"] as const;
  const onboardingQ = useQuery({
    queryKey: ["dashboard-onboarding-state", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_progress, onboarding_completed_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const progress = (data?.onboarding_progress ?? {}) as Record<
        string,
        { done?: boolean } | undefined
      >;
      const steps = REQUIRED_STEPS.map((k) => ({ key: k, done: progress[k]?.done === true }));
      const allDone = steps.every((s) => s.done) && !!data?.onboarding_completed_at;
      return { steps, allDone };
    },
  });
  const onboardingIncomplete =
    onboardingQ.isSuccess && !onboardingQ.data.allDone;

  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    if (!org?.id) return;
    try {
      const raw = localStorage.getItem(viewsKey(org.id));
      setViews(raw ? (JSON.parse(raw) as SavedView[]) : []);
    } catch {
      setViews([]);
    }
  }, [org?.id]);
  const persistViews = (next: SavedView[]) => {
    setViews(next);
    if (org?.id) localStorage.setItem(viewsKey(org.id), JSON.stringify(next));
  };
  const saveCurrentView = () => {
    const name = window.prompt(t("properties.saveViewPrompt"));
    if (!name?.trim()) return;
    persistViews([...views, { id: crypto.randomUUID(), name: name.trim(), search: currentSearch }]);
  };
  const deleteView = (id: string) => persistViews(views.filter((v) => v.id !== id));
  const activeViewId = views.find((v) => sameSearch(v.search, currentSearch))?.id ?? null;

  const [presets, setPresets] = useState<SavedPreset[]>([]);
  useEffect(() => {
    if (!org?.id) return;
    try {
      const raw = localStorage.getItem(presetsKey(org.id));
      setPresets(raw ? (JSON.parse(raw) as SavedPreset[]) : []);
    } catch {
      setPresets([]);
    }
  }, [org?.id]);
  const persistPresets = (next: SavedPreset[]) => {
    setPresets(next);
    if (org?.id) localStorage.setItem(presetsKey(org.id), JSON.stringify(next));
  };
  const currentAdv: AdvFilters = { type, status, minBeds, minBaths };
  const saveCurrentPreset = () => {
    if (activeAdvancedCount === 0) return;
    const name = window.prompt(t("properties.savePresetPrompt"));
    if (!name?.trim()) return;
    persistPresets([
      ...presets,
      { id: crypto.randomUUID(), name: name.trim(), filters: currentAdv },
    ]);
  };
  const deletePreset = (id: string) => persistPresets(presets.filter((p) => p.id !== id));
  const applyPreset = (f: AdvFilters) => setSearch(f);
  const activePresetId = presets.find((p) => sameAdv(p.filters, currentAdv))?.id ?? null;

  const propsQ = useQuery({
    queryKey: ["properties", org?.id],
    queryFn: () => listProperties({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const properties = propsQ.data ?? [];
  const stats = {
    total: properties.length,
    available: properties.filter((p) => p.status === "available").length,
    sold: properties.filter((p) => p.status === "sold").length,
    rented: properties.filter((p) => p.status === "rented").length,
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = properties.filter((p) => {
      if (filter !== "all" && p.listing_type !== filter) return false;
      if (type !== "all" && p.property_type !== type) return false;
      if (status !== "all" && p.status !== status) return false;
      if (minBeds > 0 && (p.bedrooms ?? 0) < minBeds) return false;
      if (minBaths > 0 && (p.bathrooms ?? 0) < minBaths) return false;
      if (!needle) return true;
      const hay = `${p.title_ar} ${p.title_en} ${p.city ?? ""} ${p.address ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
    const score = (p: (typeof properties)[number]) => {
      if (!needle) return 0;
      let s = 0;
      const ta = (p.title_ar ?? "").toLowerCase();
      const te = (p.title_en ?? "").toLowerCase();
      if (ta.startsWith(needle) || te.startsWith(needle)) s += 3;
      if (ta.includes(needle) || te.includes(needle)) s += 2;
      if ((p.city ?? "").toLowerCase().includes(needle)) s += 1;
      return s;
    };
    const time = (p: (typeof properties)[number]) => new Date(p.created_at ?? 0).getTime();
    const sorted = [...list];
    switch (sort) {
      case "priceAsc":
        sorted.sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case "priceDesc":
        sorted.sort((a, b) => Number(b.price) - Number(a.price));
        break;
      case "oldest":
        sorted.sort((a, b) => time(a) - time(b));
        break;
      case "newest":
        sorted.sort((a, b) => time(b) - time(a));
        break;
      case "relevance":
      default:
        sorted.sort((a, b) => score(b) - score(a) || time(b) - time(a));
        break;
    }
    return sorted;
  }, [properties, q, filter, sort, type, status, minBeds, minBaths]);

  const loading = propsQ.isLoading || (orgsQ.isLoading && !org);
  const hasAny = properties.length > 0;
  const filteredEmpty = hasAny && filtered.length === 0;

  const PAGE_SIZE = 8;
  const visible = Math.min(page * PAGE_SIZE, Math.max(filtered.length, PAGE_SIZE));
  const hasMore = visible < filtered.length;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          navigate({
            search: (prev: DashSearch) => ({ ...prev, page: prev.page + 1 }),
            replace: true,
          });
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filtered.length, navigate]);

  // Restore scroll position after results render.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (loading || !hasAny) return;
    if (scrollY > 0) window.scrollTo({ top: scrollY, behavior: "auto" });
    restoredRef.current = true;
  }, [loading, hasAny, scrollY]);

  // Persist scroll position to URL (throttled) so back/forward restores it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const y = Math.round(window.scrollY);
        navigate({
          search: (prev: DashSearch) => (prev.scrollY === y ? prev : { ...prev, scrollY: y }),
          replace: true,
        });
      }, 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [navigate]);

  // Onboarding incomplete or no org yet → show a clear Empty State instead of
  // a blank dashboard shell. The outer _authenticated guard will still redirect
  // to /onboarding[/wizard], but this renders instantly so the user is never
  // faced with an empty page during the transition.
  if (onboardingIncomplete || (orgsQ.isSuccess && !org)) {
    return (
      <DashboardEmptyState
        isAr={isAr}
        steps={onboardingQ.data?.steps ?? REQUIRED_STEPS.map((k) => ({ key: k, done: false }))}
        orgName={org?.name}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6"
    >
      <DashboardHero orgName={org?.name} canCreate={canCreate} isAr={isAr} />

      <div className="mt-6">
        <SubscriptionStatusCard isAr={isAr} />
      </div>

      <div className="mt-4">
        <SubscriptionAuditTrail isAr={isAr} />
      </div>


      <div className="mt-6">
        <WelcomeChecklist isAr={isAr} />
      </div>

      <div className="mt-6">
        <ServicesGrid isAr={isAr} />
      </div>

      {/* View mode tabs: Classic vs Smart (shares layout & sidebar) */}
      <div
        role="tablist"
        aria-label={isAr ? "وضع اللوحة" : "Dashboard view"}
        className="mt-6 inline-flex rounded-xl border p-1"
        style={{
          borderColor: "rgba(212,175,55,0.28)",
          background: "linear-gradient(135deg, rgba(212,175,55,0.06), rgba(37,99,235,0.06))",
        }}
      >
        {(["classic", "smart"] as const).map((v) => {
          const active = view === v;
          const label =
            v === "classic" ? (isAr ? "الكلاسيكية" : "Classic") : isAr ? "الذكية" : "Smart";
          return (
            <button
              key={v}
              role="tab"
              aria-selected={active}
              onClick={() => setSearch({ view: v }, false)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "bg-white text-foreground shadow dark:bg-slate-900"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "smart" && <Sparkles className="size-3.5 text-warning" aria-hidden />}
              {label}
              {v === "smart" && !active && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                  style={{ background: "rgba(212,175,55,0.18)", color: "#B8891F" }}
                >
                  {isAr ? "جديد" : "NEW"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {view === "smart" ? (
        <div className="mt-6">
          <AutoDashboardPanel />
        </div>
      ) : (
        <div className="mt-6">
          <SortableDashboard
            userId={user?.id}
            isAr={isAr}
            sections={(
              [
                {
                  id: "kpi",
                  labelAr: "المؤشرات الرئيسية",
                  labelEn: "Key metrics",
                  node: <KpiGrid orgId={org?.id} isAr={isAr} />,
                },
                {
                  id: "reminders",
                  labelAr: "التذكيرات الذكية",
                  labelEn: "Smart reminders",
                  node: <SmartRemindersPanel orgId={org?.id} isAr={isAr} />,
                },
                {
                  id: "analytics",
                  labelAr: "التحليلات والخريطة",
                  labelEn: "Analytics & map",
                  node: (
                    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                      <div className="space-y-4">
                        <AnalyticsPanels orgId={org?.id} isAr={isAr} />
                        <SaudiMap orgId={org?.id} isAr={isAr} />
                      </div>
                      <aside className="lg:sticky lg:top-4 lg:self-start">
                        <div className="space-y-4">
                          <RightPanel orgId={org?.id} isAr={isAr} />
                          <QuickExpenseWidget orgId={org?.id} />
                          <AIRecommendations orgId={org?.id} isAr={isAr} />
                          <AssistantDock orgId={org?.id} isAr={isAr} />
                        </div>
                      </aside>
                    </div>
                  ),
                },
                {
                  id: "summary",
                  labelAr: "الإيرادات والعقود المنتهية",
                  labelEn: "Revenue & expiring contracts",
                  node: (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <RevenueChartCard isAr={isAr} />
                      <ExpiringContractsCard isAr={isAr} />
                    </div>
                  ),
                },
                {
                  id: "approvals",
                  labelAr: "الموافقات المعلقة",
                  labelEn: "Pending approvals",
                  node: <PendingApprovalsPanel />,
                },
                {
                  id: "payments-notifications",
                  labelAr: "المدفوعات والإشعارات",
                  labelEn: "Payments & notifications",
                  node: (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <RecentPaymentsCard isAr={isAr} />
                      <NotificationsCard isAr={isAr} />
                    </div>
                  ),
                },
              ] as DashboardSection[]
            )}
          />
        </div>
      )}

      {view === "smart" ? null : (
        <>


          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t("dashboard.recent")}</h2>
              {hasAny && (
                <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setSearch({ q: e.target.value })}
                      placeholder={t("properties.search")}
                      className="ps-9"
                    />
                  </div>
                  <Select value={sort} onValueChange={(v) => setSearch({ sort: v as SortKey })}>
                    <SelectTrigger className="h-9 w-[180px]" aria-label={t("properties.sortBy")}>
                      <SelectValue placeholder={t("properties.sortBy")} />
                    </SelectTrigger>
                    <SelectContent>
                      {SORTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`properties.sort.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2">
                        <Bookmark className="size-4" />
                        {t("properties.views")}
                        {views.length > 0 && (
                          <span className="ms-1 grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                            {views.length}
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>{t("properties.savedViews")}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {views.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {t("properties.noViews")}
                        </div>
                      ) : (
                        views.map((v) => (
                          <DropdownMenuItem
                            key={v.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              applyView(v.search);
                            }}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {activeViewId === v.id ? (
                                <Check className="size-3.5 text-primary" />
                              ) : (
                                <span className="inline-block size-3.5" />
                              )}
                              <span className="truncate">{v.name}</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteView(v.id);
                              }}
                              aria-label={t("properties.deleteView")}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </DropdownMenuItem>
                        ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          saveCurrentView();
                        }}
                      >
                        <BookmarkPlus className="me-2 size-4" />
                        {t("properties.saveView")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2">
                        <SlidersHorizontal className="size-4" />
                        {t("properties.filters")}
                        {activeAdvancedCount > 0 && (
                          <span className="ms-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                            {activeAdvancedCount}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{t("properties.advancedFilters")}</div>
                        {activeAdvancedCount > 0 && (
                          <button
                            onClick={() =>
                              setSearch({ type: "all", status: "all", minBeds: 0, minBaths: 0 })
                            }
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t("properties.reset")}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">{t("properties.savedPresets")}</Label>
                          <button
                            type="button"
                            onClick={saveCurrentPreset}
                            disabled={activeAdvancedCount === 0}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                          >
                            <BookmarkPlus className="size-3.5" />
                            {t("properties.savePreset")}
                          </button>
                        </div>
                        {presets.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t("properties.noPresets")}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {presets.map((p) => {
                              const active = activePresetId === p.id;
                              return (
                                <span
                                  key={p.id}
                                  className={
                                    "group inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs " +
                                    (active
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "bg-card hover:border-foreground/30")
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() => applyPreset(p.filters)}
                                    className="max-w-[10rem] truncate"
                                  >
                                    {p.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deletePreset(p.id)}
                                    aria-label={t("properties.deletePreset")}
                                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("properties.propertyType")}</Label>
                        <Select
                          value={type}
                          onValueChange={(v) => setSearch({ type: v as "all" | PropertyType })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t("properties.any")}</SelectItem>
                            {PROPERTY_TYPES.map((pt) => (
                              <SelectItem key={pt} value={pt}>
                                {t(`properties.types.${pt}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("properties.status")}</Label>
                        <Select
                          value={status}
                          onValueChange={(v) => setSearch({ status: v as "all" | Status })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t("properties.any")}</SelectItem>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`properties.statuses.${s}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("properties.minBeds")}</Label>
                          <Select
                            value={String(minBeds)}
                            onValueChange={(v) => setSearch({ minBeds: Number(v) })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BED_BATH.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                  {n === 0 ? t("properties.any") : `${n}+`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t("properties.minBaths")}</Label>
                          <Select
                            value={String(minBaths)}
                            onValueChange={(v) => setSearch({ minBaths: Number(v) })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BED_BATH.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                  {n === 0 ? t("properties.any") : `${n}+`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex gap-1 rounded-lg border bg-card p-1">
                    {FILTERS.map((f) => (
                      <button
                        key={f}
                        onClick={() => setSearch({ filter: f })}
                        className={
                          "relative rounded-md px-3 py-1.5 text-sm transition " +
                          (filter === f
                            ? "text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {filter === f && (
                          <motion.span
                            layoutId="dash-filter-pill"
                            className="absolute inset-0 rounded-md bg-primary"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative">
                          {f === "all"
                            ? t("properties.filterAll")
                            : f === "sale"
                              ? t("properties.filterSale")
                              : t("properties.filterRent")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {hasAny && activeAdvancedCount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                {type !== "all" && (
                  <FilterChip
                    label={`${t("properties.propertyType")}: ${t(`properties.types.${type}`)}`}
                    onRemove={() => setSearch({ type: "all" })}
                  />
                )}
                {status !== "all" && (
                  <FilterChip
                    label={`${t("properties.status")}: ${t(`properties.statuses.${status}`)}`}
                    onRemove={() => setSearch({ status: "all" })}
                  />
                )}
                {minBeds > 0 && (
                  <FilterChip
                    label={`${t("properties.minBeds")}: ${minBeds}+`}
                    onRemove={() => setSearch({ minBeds: 0 })}
                  />
                )}
                {minBaths > 0 && (
                  <FilterChip
                    label={`${t("properties.minBaths")}: ${minBaths}+`}
                    onRemove={() => setSearch({ minBaths: 0 })}
                  />
                )}
                <button
                  onClick={() => setSearch({ type: "all", status: "all", minBeds: 0, minBaths: 0 })}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t("properties.reset")}
                </button>
              </motion.div>
            )}

            <div className="mt-3 overflow-hidden surface-card">
              {loading ? (
                <ul className="divide-y">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
                      </div>
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </li>
                  ))}
                </ul>
              ) : !hasAny ? (
                <EmptyState
                  icon={<Building2 className="size-6" />}
                  title={t("dashboard.empty")}
                  cta={
                    canCreate
                      ? { to: "/properties/new", label: t("dashboard.addFirst") }
                      : undefined
                  }
                />
              ) : filteredEmpty ? (
                <EmptyState icon={<Search className="size-6" />} title={t("properties.empty")} />
              ) : (
                <>
                  <ul className="divide-y">
                    <AnimatePresence initial={false}>
                      {filtered.slice(0, visible).map((p, idx) => (
                        <motion.li
                          key={p.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, delay: idx * 0.02 }}
                        >
                          <Link
                            to="/dashboard/properties/$id"
                            params={{ id: p.id }}
                            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {isAr ? p.title_ar : p.title_en}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {t(`properties.types.${p.property_type}`)} ·{" "}
                                {t(`properties.listingTypes.${p.listing_type}`)} · {p.city ?? "—"}
                              </div>
                            </div>
                            <div className="text-end text-sm font-medium tabular-nums">
                              {Number(p.price).toLocaleString(isAr ? "ar" : "en")} {p.currency}
                            </div>
                          </Link>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                    {hasMore && (
                      <>
                        {Array.from({ length: Math.min(PAGE_SIZE, filtered.length - visible) }).map(
                          (_, i) => (
                            <li
                              key={`sk-${i}`}
                              className="flex items-center justify-between gap-3 px-4 py-4"
                            >
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
                              </div>
                              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                            </li>
                          ),
                        )}
                      </>
                    )}
                  </ul>
                  {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  delta,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "emerald" | "amber" | "sky" | "primary";
  delta?: string;
  loading?: boolean;
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-success/10 text-success"
      : tone === "amber"
        ? "bg-warning/10 text-warning"
        : tone === "sky"
          ? "bg-info/10 text-info"
          : "bg-primary/10 text-primary";
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="surface-card p-5 transition-shadow hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          {loading ? (
            <div className="mt-2 h-7 w-20 animate-pulse rounded bg-muted" />
          ) : (
            <motion.div
              key={String(value)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1.5 text-display text-2xl tabular-nums"
            >
              {value}
            </motion.div>
          )}
          {delta && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              <TrendingUp className="size-3" /> {delta}
            </div>
          )}
        </div>
        <div className={"grid size-11 shrink-0 place-items-center rounded-xl " + toneCls}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

const REV_DATA = [
  { m: "يناير", v: 700 },
  { m: "فبراير", v: 900 },
  { m: "مارس", v: 1100 },
  { m: "أبريل", v: 1250 },
  { m: "مايو", v: 1400 },
  { m: "يونيو", v: 1700 },
];

function RevenueChartCard({ isAr }: { isAr: boolean }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isAr ? "الإيرادات الشهرية" : "Monthly revenue"}</h3>
        <button className="text-xs text-primary hover:underline">
          {isAr ? "عرض الكل" : "View all"}
        </button>
      </div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={REV_DATA} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="m"
              reversed={isAr}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}K`}
              orientation={isAr ? "right" : "left"}
            />
            <RTooltip formatter={(v: number) => `${v}K`} />
            <Line
              type="monotone"
              dataKey="v"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ExpiringContractsCard({ isAr }: { isAr: boolean }) {
  const rows = [
    {
      t: isAr ? "عقد مكتب العليا" : "Al-Olaya office",
      d: isAr ? "ينتهي بعد 5 أيام" : "5 days",
      sub: isAr ? "ينتهي بعد 8 يوم" : "8 days",
    },
    {
      t: isAr ? "عقد شقة النخيل" : "Al-Nakheel apt.",
      d: isAr ? "ينتهي بعد 12 يوم" : "12 days",
      sub: isAr ? "ينتهي بعد 13 يوم" : "13 days",
    },
    {
      t: isAr ? "عقد محل السلام مول" : "Salam Mall shop",
      d: isAr ? "ينتهي بعد 18 يوم" : "18 days",
      sub: isAr ? "ينتهي بعد 18 يوم" : "18 days",
    },
  ];
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {isAr ? "العقود المنتهية قريباً" : "Contracts expiring soon"}
        </h3>
        <button className="text-xs text-primary hover:underline">
          {isAr ? "عرض الكل" : "View all"}
        </button>
      </div>
      <ul className="mt-4 divide-y">
        {rows.map((r) => (
          <li key={r.t} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.t}</div>
              <div className="text-[11px] text-muted-foreground">{r.sub}</div>
            </div>
            <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-warning">
              {r.d}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentPaymentsCard({ isAr }: { isAr: boolean }) {
  const rows = [
    { name: isAr ? "محمد السبيعي" : "Mohammed A.", amount: "10,000", status: "paid" },
    { name: isAr ? "شركة الهادي" : "Al-Hadi Co.", amount: "25,500", status: "paid" },
    { name: isAr ? "أحمد آل سعود" : "Ahmed S.", amount: "12,000", status: "pending" },
  ] as const;
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isAr ? "آخر المدفوعات" : "Recent payments"}</h3>
        <button className="text-xs text-primary hover:underline">
          {isAr ? "عرض الكل" : "View all"}
        </button>
      </div>
      <ul className="mt-4 divide-y">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 py-3">
            <div className="truncate text-sm font-medium">{r.name}</div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums">
                {r.amount} {isAr ? "ر.س" : "SAR"}
              </span>
              <span
                className={
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
                  (r.status === "paid"
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning")
                }
              >
                {r.status === "paid"
                  ? isAr
                    ? "تم الدفع"
                    : "Paid"
                  : isAr
                    ? "بانتظار الدفع"
                    : "Pending"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotificationsCard({ isAr }: { isAr: boolean }) {
  const items = [
    {
      icon: <AlertCircle className="size-4 text-warning" />,
      text: isAr
        ? "عقد مكتب العليا سينتهي بعد 5 أيام"
        : "Al-Olaya office contract expires in 5 days",
    },
    {
      icon: <BellRing className="size-4 text-info" />,
      text: isAr ? "دفعة شهر يونيو لم يتم استلامها" : "June payment not received",
    },
    {
      icon: <Home className="size-4 text-primary" />,
      text: isAr ? "طلب صيانة جديد في شقة 101" : "New maintenance request in apt 101",
    },
  ];
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isAr ? "تنبيهات" : "Notifications"}</h3>
        <button className="text-xs text-primary hover:underline">
          {isAr ? "عرض الكل" : "View all"}
        </button>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((n, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 hover:bg-muted/60 transition"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="shrink-0">{n.icon}</div>
              <div className="truncate text-sm">{n.text}</div>
            </div>
            <ChevronLeft className="size-4 text-muted-foreground shrink-0 rtl:rotate-180" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  cta?: { to: string; label: string };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center gap-3 p-12 text-center"
    >
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{title}</p>
      {cta && (
        <Button asChild className="mt-2">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      )}
    </motion.div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onRemove}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-foreground hover:border-destructive/40 hover:text-destructive"
    >
      <span>{label}</span>
      <X className="size-3 opacity-60 group-hover:opacity-100" />
    </motion.button>
  );
}
