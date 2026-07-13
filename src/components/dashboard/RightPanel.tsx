import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Plus,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  FileText,
  Activity,
  ShieldCheck,
  ArrowLeft,
  Search,
  ListChecks,
  BellRing,
  CalendarDays,
  X,
} from "lucide-react";
import { listTasks, type TaskRow } from "@/lib/tasks.functions";
import { listContracts } from "@/lib/contracts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ActivityTimeline, type TimelineItem, type TimelineStatus } from "@/components/ui/activity-timeline";


type Props = { orgId: string | undefined; isAr: boolean };

const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const STATUS_STYLE: Record<string, string> = {
  open: "bg-info/10 text-info ring-info/20 dark:text-info",
  in_progress: "bg-warning/10 text-warning ring-warning/20 dark:text-warning",
  done: "bg-success/10 text-success ring-success/20 dark:text-success",
  cancelled: "bg-muted text-muted-foreground ring-border",
};
const statusLabel = (s: string, isAr: boolean) => {
  const map: Record<string, [string, string]> = {
    open: ["مفتوحة", "Open"],
    in_progress: ["قيد التنفيذ", "In progress"],
    done: ["مكتملة", "Done"],
    cancelled: ["ملغاة", "Cancelled"],
  };
  const p = map[s] ?? [s, s];
  return isAr ? p[0] : p[1];
};
const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-destructive",
  high: "bg-warning",
  medium: "bg-info",
  low: "bg-muted-foreground",
};

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof Activity;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
            <Icon className="size-4" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function RightPanel({ orgId, isAr }: Props) {
  const [tab, setTab] = useState<"tasks" | "alerts" | "calendar">("tasks");
  const [q, setQ] = useState("");
  const fetchTasks = useServerFn(listTasks);
  const fetchContracts = useServerFn(listContracts);

  const tasksQ = useQuery({
    queryKey: ["right-panel-tasks", orgId],
    queryFn: () => fetchTasks({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });
  const contractsQ = useQuery({
    queryKey: ["right-panel-contracts", orgId],
    queryFn: () => fetchContracts({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const tasks: TaskRow[] = tasksQ.data ?? [];
  const contracts = contractsQ.data ?? [];

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "open" || t.status === "in_progress"),
    [tasks],
  );
  const approvals = useMemo(
    () => openTasks.filter((t) => t.priority === "high" || t.priority === "urgent").slice(0, 3),
    [openTasks],
  );
  const expiring = useMemo(
    () =>
      contracts
        .filter((c: any) => {
          if (!c.end_date || c.status !== "active") return false;
          const d = daysUntil(c.end_date);
          return d >= 0 && d <= 30;
        })
        .slice(0, 4),
    [contracts],
  );
  const activities = useMemo(() => {
    const items: { id: string; label: string; when: string; icon: typeof Activity }[] = [];
    for (const t of tasks.slice(0, 5)) {
      items.push({
        id: `t-${t.id}`,
        label: t.title,
        when: t.updated_at ?? t.created_at,
        icon: t.status === "done" ? CheckCircle2 : Clock3,
      });
    }
    for (const c of contracts.slice(0, 3) as any[]) {
      items.push({
        id: `c-${c.id}`,
        label: isAr ? `عقد ${c.contract_number ?? ""}` : `Contract ${c.contract_number ?? ""}`,
        when: c.start_date,
        icon: FileText,
      });
    }
    return items
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 6);
  }, [tasks, contracts, isAr]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
      month: "short",
      day: "numeric",
    });

  const norm = (s: string) => s.toLowerCase().trim();
  const query = norm(q);
  const matches = (v: string | null | undefined) => !query || norm(v ?? "").includes(query);

  const filteredTasks = useMemo(
    () => openTasks.filter((t) => matches(t.title) || matches(t.description)).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTasks, query],
  );
  const filteredApprovals = useMemo(
    () => approvals.filter((t) => matches(t.title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approvals, query],
  );
  const filteredExpiring = useMemo(
    () => expiring.filter((c: any) => matches(c.contract_number) || matches(c.tenants?.full_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expiring, query],
  );
  const calendarItems = useMemo(() => {
    type Item = { id: string; label: string; iso: string; kind: "task" | "contract" };
    const out: Item[] = [];
    for (const t of tasks) {
      if (!t.due_at) continue;
      const d = daysUntil(t.due_at);
      if (d < 0 || d > 60) continue;
      if (!matches(t.title)) continue;
      out.push({ id: `t-${t.id}`, label: t.title, iso: t.due_at, kind: "task" });
    }
    for (const c of contracts as any[]) {
      if (!c.end_date) continue;
      const d = daysUntil(c.end_date);
      if (d < 0 || d > 60) continue;
      const label = c.contract_number ?? c.id.slice(0, 8);
      if (!matches(label) && !matches(c.tenants?.full_name)) continue;
      out.push({
        id: `c-${c.id}`,
        label: isAr ? `عقد ${label}` : `Contract ${label}`,
        iso: c.end_date,
        kind: "contract",
      });
    }
    return out.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, contracts, query, isAr]);

  const tasksCount = filteredTasks.length;
  const alertsCount = filteredApprovals.length + filteredExpiring.length;
  const calendarCount = calendarItems.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Quick Add — big gold CTA */}
      <Button
        asChild
        className={cn(
          "group h-14 w-full justify-between rounded-2xl border border-primary/40",
          "bg-gradient-to-r from-primary via-primary to-primary/85 text-primary-foreground",
          "shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.55)] hover:shadow-[0_14px_40px_-10px_hsl(var(--primary)/0.7)]",
          "transition-all",
        )}
      >
        <Link to="/dashboard/properties/new">
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
              <Plus className="size-5" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold">{isAr ? "إضافة سريعة" : "Quick Add"}</span>
              <span className="text-[11px] opacity-80">
                {isAr ? "عقار · عقد · مستأجر" : "Property · Contract · Tenant"}
              </span>
            </span>
          </span>
          <ArrowLeft
            className={cn(
              "size-4 transition-transform",
              isAr ? "group-hover:-translate-x-1" : "rotate-180 group-hover:translate-x-1",
            )}
          />
        </Link>
      </Button>

      {/* Quick Search */}
      <div className="relative">
        <Search
          className={cn(
            "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
            isAr ? "right-3" : "left-3",
          )}
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isAr ? "بحث سريع في اللوحة…" : "Quick search in panel…"}
          className={cn(
            "h-9 rounded-xl bg-background/50",
            isAr ? "pr-9 pl-8 text-right" : "pl-9 pr-8",
          )}
          dir={isAr ? "rtl" : "ltr"}
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground",
              isAr ? "left-2" : "right-2",
            )}
            aria-label={isAr ? "مسح" : "Clear"}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Tabs: Tasks / Alerts / Calendar */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="tasks" className="gap-1.5 text-xs">
            <ListChecks className="size-3.5" />
            {isAr ? "المهام" : "Tasks"}
            {tasksCount > 0 && (
              <Badge variant="secondary" className="ms-1 h-4 px-1.5 text-[10px]">
                {tasksCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 text-xs">
            <BellRing className="size-3.5" />
            {isAr ? "التنبيهات" : "Alerts"}
            {alertsCount > 0 && (
              <Badge variant="secondary" className="ms-1 h-4 px-1.5 text-[10px]">
                {alertsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 text-xs">
            <CalendarDays className="size-3.5" />
            {isAr ? "التقويم" : "Calendar"}
            {calendarCount > 0 && (
              <Badge variant="secondary" className="ms-1 h-4 px-1.5 text-[10px]">
                {calendarCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-3">
          <SectionCard
            title={isAr ? "المهام المفتوحة" : "Open Tasks"}
            icon={ListChecks}
            action={
              <Link
                to="/dashboard"
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {isAr ? "الكل" : "All"}
              </Link>
            }
          >
            {filteredTasks.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {query
                  ? isAr
                    ? "لا نتائج مطابقة"
                    : "No matches"
                  : isAr
                    ? "لا مهام مفتوحة"
                    : "No open tasks"}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          PRIORITY_DOT[t.priority ?? "low"] ?? "bg-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.due_at
                            ? `${isAr ? "استحقاق" : "Due"} · ${fmtDate(t.due_at)}`
                            : isAr
                              ? "بدون تاريخ"
                              : "No date"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                        STATUS_STYLE[t.status] ?? STATUS_STYLE.open,
                      )}
                    >
                      {statusLabel(t.status, isAr)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="alerts" className="mt-3 space-y-4">
          <SectionCard
            title={isAr ? "موافقات سريعة" : "Quick Approvals"}
            icon={ShieldCheck}
            action={
              filteredApprovals.length > 0 ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {filteredApprovals.length}
                </span>
              ) : null
            }
          >
            {filteredApprovals.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {query
                  ? isAr
                    ? "لا نتائج مطابقة"
                    : "No matches"
                  : isAr
                    ? "لا توجد موافقات معلّقة"
                    : "No pending approvals"}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredApprovals.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.due_at
                          ? `${isAr ? "استحقاق" : "Due"} · ${fmtDate(t.due_at)}`
                          : isAr
                            ? "بدون تاريخ"
                            : "No date"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                        {isAr ? "لاحقاً" : "Later"}
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 bg-primary px-2 text-[11px] text-primary-foreground hover:bg-primary/90"
                      >
                        {isAr ? "اعتماد" : "Approve"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title={isAr ? "عقود على وشك الانتهاء" : "Expiring Contracts"}
            icon={AlertTriangle}
            action={
              <Link
                to="/dashboard/contracts"
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {isAr ? "عرض الكل" : "View all"}
              </Link>
            }
          >
            {filteredExpiring.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {query
                  ? isAr
                    ? "لا نتائج مطابقة"
                    : "No matches"
                  : isAr
                    ? "لا شيء خلال 30 يوماً"
                    : "Nothing in next 30 days"}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredExpiring.map((c: any) => {
                  const d = daysUntil(c.end_date);
                  const critical = d <= 7;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {c.contract_number ?? c.id.slice(0, 8)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.tenants?.full_name ?? (isAr ? "بدون مستأجر" : "No tenant")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                          critical
                            ? "bg-destructive/10 text-destructive ring-destructive/20 dark:text-destructive"
                            : "bg-warning/10 text-warning ring-warning/20 dark:text-warning",
                        )}
                      >
                        {d}
                        {isAr ? " يوم" : "d"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="calendar" className="mt-3">
          <SectionCard title={isAr ? "الأحداث القادمة" : "Upcoming Events"} icon={CalendarDays}>
            {calendarItems.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {query
                  ? isAr
                    ? "لا نتائج مطابقة"
                    : "No matches"
                  : isAr
                    ? "لا أحداث خلال 60 يوماً"
                    : "No events in next 60 days"}
              </p>
            ) : (
              <ul className="space-y-2">
                {calendarItems.map((e) => {
                  const d = daysUntil(e.iso);
                  const soon = d <= 7;
                  const Icon = e.kind === "contract" ? FileText : Clock3;
                  return (
                    <li
                      key={e.id}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 p-2.5"
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <div className="text-center leading-tight">
                          <div className="text-[9px] font-semibold uppercase tracking-wide">
                            {new Date(e.iso).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                              month: "short",
                            })}
                          </div>
                          <div className="text-sm font-bold">
                            {new Date(e.iso).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                              day: "numeric",
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          {e.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {isAr ? `خلال ${d} يوم` : `In ${d} day${d === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                          soon
                            ? "bg-destructive/10 text-destructive ring-destructive/20 dark:text-destructive"
                            : "bg-success/10 text-success ring-success/20 dark:text-success",
                        )}
                      >
                        {soon ? (isAr ? "قريب" : "Soon") : isAr ? "قادم" : "Upcoming"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Recent Activities */}
      <SectionCard title={isAr ? "أحدث النشاطات" : "Recent Activities"} icon={Activity}>
        {activities.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {isAr ? "لا يوجد نشاط بعد" : "No activity yet"}
          </p>
        ) : (
          <ol className="relative space-y-3 ps-4">
            <span className="absolute inset-y-1 start-1.5 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />
            {activities.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.id} className="relative">
                  <span className="absolute -start-[13px] top-1 grid size-4 place-items-center rounded-full bg-primary/15 ring-2 ring-background">
                    <Icon className="size-2.5 text-primary" />
                  </span>
                  <p className="truncate text-sm">{a.label}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(a.when)}</p>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>
    </motion.div>
  );
}

export default RightPanel;
