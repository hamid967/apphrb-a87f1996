import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listProperties } from "@/lib/properties.functions";
import {
  createTicket, deleteTicket, listTechnicians, listTickets, updateTicket,
} from "@/lib/maintenance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Wrench, AlertCircle, Home, User } from "lucide-react";
import { cn } from "@/lib/utils";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/maintenance")({
  head: () => sectionHead({ section: "dashboard", entityAr: "الصيانة", entityEn: "Maintenance", path: "/dashboard/maintenance" }),
  component: TicketsPage,
});

const STATUSES = ["open", "assigned", "in_progress", "on_hold", "completed", "cancelled"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  medium: "bg-info/15 text-info dark:text-info",
  high: "bg-warning/15 text-warning dark:text-warning",
  urgent: "bg-destructive/15 text-destructive dark:text-destructive",
};

function TicketsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const STATUS_LABEL: Record<string, string> = {
    open: t("maintenance.statuses.open"),
    assigned: t("maintenance.statuses.assigned"),
    in_progress: t("maintenance.statuses.in_progress"),
    on_hold: t("maintenance.statuses.on_hold"),
    completed: t("maintenance.statuses.completed"),
    cancelled: t("maintenance.statuses.cancelled"),
  };
  const PRIORITY_LABEL: Record<string, string> = {
    low: t("maintenance.priorities.low"),
    medium: t("maintenance.priorities.medium"),
    high: t("maintenance.priorities.high"),
    urgent: t("maintenance.priorities.urgent"),
  };
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const ticketsQ = useQuery({
    queryKey: ["tickets", orgId],
    queryFn: () => listTickets({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const techsQ = useQuery({
    queryKey: ["technicians", orgId],
    queryFn: () => listTechnicians({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const propsQ = useQuery({
    queryKey: ["properties-lite", orgId],
    queryFn: () => listProperties({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ticket_no: "",
    title: "",
    description: "",
    property_id: "none",
    technician_id: "none",
    priority: "medium" as (typeof PRIORITIES)[number],
    scheduled_at: "",
    cost: "",
  });

  const create = useMutation({
    mutationFn: (payload: any) => createTicket({ data: payload }),
    onSuccess: () => {
      toast.success(t("maintenance.toast.ticketCreated"));
      qc.invalidateQueries({ queryKey: ["tickets", orgId] });
      setOpen(false);
      setForm({ ticket_no: "", title: "", description: "", property_id: "none", technician_id: "none", priority: "medium", scheduled_at: "", cost: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateTicket({ data: { id, patch: { status: status as any } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets", orgId] }),
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const assign = useMutation({
    mutationFn: ({ id, technician_id }: { id: string; technician_id: string | null }) =>
      updateTicket({ data: { id, patch: { technician_id, status: technician_id ? "assigned" : "open" } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets", orgId] }),
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTicket({ data: { id } }),
    onSuccess: () => { toast.success(t("maintenance.toast.ticketDeleted")); qc.invalidateQueries({ queryKey: ["tickets", orgId] }); },
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const rows = ticketsQ.data ?? [];
  const filtered = useMemo(
    () => (priorityFilter === "all" ? rows : rows.filter((r: any) => r.priority === priorityFilter)),
    [rows, priorityFilter],
  );

  const stats = useMemo(() => ({
    open: rows.filter((r: any) => r.status === "open").length,
    active: rows.filter((r: any) => ["assigned", "in_progress"].includes(r.status)).length,
    urgent: rows.filter((r: any) => r.priority === "urgent" && r.status !== "completed" && r.status !== "cancelled").length,
    completed: rows.filter((r: any) => r.status === "completed").length,
  }), [rows]);

  const groups = useMemo(() => {
    const g: Record<string, any[]> = { open: [], assigned: [], in_progress: [], on_hold: [], completed: [], cancelled: [] };
    for (const r of filtered) g[r.status]?.push(r);
    return g;
  }, [filtered]);

  const techs = techsQ.data ?? [];
  const properties = propsQ.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label={t("maintenance.stats.open")} value={stats.open} icon={<Wrench className="size-4" />} />
        <Stat label={t("maintenance.stats.active")} value={stats.active} tone="info" />
        <Stat label={t("maintenance.stats.urgent")} value={stats.urgent} tone="warn" icon={<AlertCircle className="size-4" />} />
        <Stat label={t("maintenance.stats.completed")} value={stats.completed} tone="pos" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">{t("maintenance.filters.priority")}</span>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("maintenance.filters.all")}</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="size-4" /> {t("maintenance.actions.newTicket")}</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("maintenance.dialog.newTicket")}</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("maintenance.fields.ticketNo")}>
                  <Input value={form.ticket_no} onChange={(e) => setForm({ ...form, ticket_no: e.target.value })} placeholder="MT-0001" />
                </Field>
                <Field label={t("maintenance.fields.priority")}>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label={t("maintenance.fields.title")}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label={t("maintenance.fields.description")}><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("maintenance.fields.property")}>
                  <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("maintenance.placeholders.none")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("maintenance.placeholders.none")}</SelectItem>
                      {properties.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("maintenance.fields.technician")}>
                  <Select value={form.technician_id} onValueChange={(v) => setForm({ ...form, technician_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("maintenance.placeholders.unassigned")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("maintenance.placeholders.unassigned")}</SelectItem>
                      {techs.filter((t: any) => t.active).map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("maintenance.fields.scheduled")}>
                  <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
                </Field>
                <Field label={t("maintenance.fields.estCost")}>
                  <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={create.isPending || !form.ticket_no || !form.title}
                onClick={() => create.mutate({
                  org_id: orgId!,
                  ticket_no: form.ticket_no,
                  title: form.title,
                  description: form.description || null,
                  property_id: form.property_id === "none" ? null : form.property_id,
                  technician_id: form.technician_id === "none" ? null : form.technician_id,
                  priority: form.priority,
                  scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
                  cost: form.cost ? Number(form.cost) : null,
                })}
              >
                {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />} {t("maintenance.actions.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {ticketsQ.isLoading ? (
        <div className="grid place-items-center p-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STATUSES.map((s) => (
            <Card key={s} className="border-border/50 bg-card/40 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{STATUS_LABEL[s]}</span>
                  <Badge variant="secondary" className="rounded-full">{groups[s].length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {groups[s].length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
                    {t("maintenance.empty.tickets")}
                  </div>
                ) : groups[s].map((r: any) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border/50 bg-background/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{r.ticket_no}</span>
                          <Badge className={cn("rounded-full text-[10px]", PRIORITY_STYLE[r.priority])}>{PRIORITY_LABEL[r.priority]}</Badge>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium">{r.title}</div>
                        {(r.property?.title_ar || r.property?.title_en) && (
                          <div className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Home className="size-3" /> {(i18n.language?.startsWith("ar") ? r.property?.title_ar : r.property?.title_en) ?? r.property?.title_en ?? r.property?.title_ar}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <User className="size-3" /> {r.technician?.full_name ?? t("maintenance.placeholders.unassigned")}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("maintenance.actions.deleteTicket") || "حذف"} onClick={() => { if (confirm(t("maintenance.actions.deleteTicketConfirm"))) del.mutate(r.id); }}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <Select value={r.status} onValueChange={(v) => setStatus.mutate({ id: r.id, status: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((x) => <SelectItem key={x} value={x}>{STATUS_LABEL[x]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select
                        value={r.technician_id ?? "none"}
                        onValueChange={(v) => assign.mutate({ id: r.id, technician_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("maintenance.placeholders.unassigned")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("maintenance.placeholders.unassigned")}</SelectItem>
                          {techs.filter((t: any) => t.active).map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone?: "pos" | "warn" | "info"; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
          <span>{label}</span>{icon}
        </div>
        <div className={cn("mt-1 text-2xl font-semibold",
          tone === "pos" && "text-success dark:text-success",
          tone === "warn" && "text-destructive dark:text-destructive",
          tone === "info" && "text-info dark:text-info",
        )}>{value}</div>
      </CardContent>
    </Card>
  );
}