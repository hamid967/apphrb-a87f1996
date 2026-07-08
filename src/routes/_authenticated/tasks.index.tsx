import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Check,
  RotateCcw,
  Clock,
  AlertCircle,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict, isPast, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listContacts, listLeads } from "@/lib/crm.functions";
import { listProperties } from "@/lib/properties.functions";
import {
  createTask,
  deleteTask,
  listOrgMembers,
  listTasks,
  updateTask,
} from "@/lib/tasks.functions";
import { can, type OrgRole } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/tasks/")({
  component: TasksPage,
});

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "open" | "in_progress" | "done" | "cancelled";
type Task = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  remind_at: string | null;
  priority: Priority;
  status: Status;
  assignee_id: string | null;
  property_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  completed_at: string | null;
  property?: { id: string; title_ar: string | null; title_en: string | null } | null;
  contact?: { id: string; full_name: string } | null;
  lead?: { id: string } | null;
  deal?: { id: string; title: string } | null;
};

type FilterKey = "all" | "mine" | "today" | "overdue" | "upcoming" | "done";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const STATUSES: Status[] = ["open", "in_progress", "done", "cancelled"];

const priorityBadge: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function TasksPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canEdit = can.editTask(role);
  const canDelete = can.deleteTask(role);

  const listQ = useQuery({
    queryKey: ["tasks", org?.id],
    queryFn: () => listTasks({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const membersQ = useQuery({
    queryKey: ["org-members", org?.id],
    queryFn: () => listOrgMembers({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const list = (listQ.data ?? []) as Task[];
    const term = q.trim().toLowerCase();
    return list.filter((r) => {
      if (term && !`${r.title} ${r.description ?? ""}`.toLowerCase().includes(term)) return false;
      const due = r.due_at ? new Date(r.due_at) : null;
      switch (filter) {
        case "mine":
          return r.assignee_id === user?.id && r.status !== "done" && r.status !== "cancelled";
        case "today":
          return !!due && isToday(due) && r.status !== "done";
        case "overdue":
          return (
            !!due && isPast(due) && !isToday(due) && r.status !== "done" && r.status !== "cancelled"
          );
        case "upcoming":
          return r.status === "open" || r.status === "in_progress";
        case "done":
          return r.status === "done";
        default:
          return true;
      }
    });
  }, [listQ.data, q, filter, user?.id]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks", org?.id] });

  const del = useMutation({
    mutationFn: (id: string) => deleteTask({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const toggle = useMutation({
    mutationFn: (task: Task) =>
      updateTask({ data: { id: task.id, status: task.status === "done" ? "open" : "done" } }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  // Smart in-app reminders: fire a toast once when a task's remind_at (or due_at) time passes.
  useSmartReminders(listQ.data as Task[] | undefined, i18n.language);

  const memberName = (uid: string | null) => {
    if (!uid) return t("tasks.fields.unassigned");
    const m = (membersQ.data ?? []).find((x: any) => x.user_id === uid);
    return (m as any)?.profile?.full_name ?? uid.slice(0, 6);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("tasks.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tasks.subtitle")}</p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="me-2 size-4" /> {t("tasks.add")}
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("tasks.search")}
            className="ps-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "mine", "today", "overdue", "upcoming", "done"] as FilterKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                filter === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted",
              )}
            >
              {t(`tasks.filters.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden surface-card">
        {listQ.isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <CheckSquare className="mx-auto mb-3 size-8 opacity-60" />
            {t("tasks.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {rows.map((r) => {
                const due = r.due_at ? new Date(r.due_at) : null;
                const overdue =
                  !!due &&
                  isPast(due) &&
                  !isToday(due) &&
                  r.status !== "done" &&
                  r.status !== "cancelled";
                const today = !!due && isToday(due) && r.status !== "done";
                const linkedLabel = r.property
                  ? ((i18n.language === "ar" ? r.property.title_ar : r.property.title_en) ??
                    r.property.title_en ??
                    r.property.title_ar)
                  : (r.contact?.full_name ?? r.deal?.title ?? null);
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex flex-wrap items-center gap-3 p-4"
                  >
                    {canEdit && (
                      <button
                        onClick={() => toggle.mutate(r)}
                        className={cn(
                          "grid size-6 place-items-center rounded-md border transition",
                          r.status === "done"
                            ? "bg-primary border-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                        aria-label={r.status === "done" ? t("tasks.reopen") : t("tasks.markDone")}
                      >
                        {r.status === "done" ? <Check className="size-4" /> : null}
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={cn(
                            "truncate font-medium",
                            r.status === "done" && "line-through text-muted-foreground",
                          )}
                        >
                          {r.title}
                        </div>
                        <Badge className={cn("border-transparent", priorityBadge[r.priority])}>
                          {t(`tasks.priorities.${r.priority}`)}
                        </Badge>
                        <Badge variant="outline">{t(`tasks.statuses.${r.status}`)}</Badge>
                        {overdue && (
                          <Badge className="border-transparent bg-red-500/15 text-red-700 dark:text-red-300">
                            <AlertCircle className="me-1 size-3" /> {t("tasks.overdueBadge")}
                          </Badge>
                        )}
                        {today && !overdue && (
                          <Badge className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {t("tasks.dueToday")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {due && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {format(due, "PPp")}
                          </span>
                        )}
                        <span>{memberName(r.assignee_id)}</span>
                        {linkedLabel && <span className="truncate">↳ {linkedLabel}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canEdit && r.status === "done" && (
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>
                          <RotateCcw className="size-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(t("tasks.confirmDelete"))) del.mutate(r.id);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {org && (
        <TaskDialog
          open={open}
          onOpenChange={setOpen}
          orgId={org.id}
          initial={editing}
          members={membersQ.data ?? []}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

function TaskDialog({
  open,
  onOpenChange,
  orgId,
  initial,
  members,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  initial: Task | null;
  members: any[];
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();

  const propsQ = useQuery({
    queryKey: ["properties", orgId, "picker"],
    queryFn: () => listProperties({ data: { org_id: orgId } }),
    enabled: open,
  });
  const contactsQ = useQuery({
    queryKey: ["contacts", orgId],
    queryFn: () => listContacts({ data: { org_id: orgId } }),
    enabled: open,
  });
  const leadsQ = useQuery({
    queryKey: ["leads", orgId],
    queryFn: () => listLeads({ data: { org_id: orgId } }),
    enabled: open,
  });

  const [form, setForm] = useState(() => ({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    due_at: toLocalInput(initial?.due_at ?? null),
    remind_at: toLocalInput(initial?.remind_at ?? null),
    priority: (initial?.priority ?? "medium") as Priority,
    status: (initial?.status ?? "open") as Status,
    assignee_id: initial?.assignee_id ?? "",
    property_id: initial?.property_id ?? "",
    contact_id: initial?.contact_id ?? "",
    lead_id: initial?.lead_id ?? "",
  }));

  useEffect(() => {
    if (!open) return;
    setForm({
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      due_at: toLocalInput(initial?.due_at ?? null),
      remind_at: toLocalInput(initial?.remind_at ?? null),
      priority: (initial?.priority ?? "medium") as Priority,
      status: (initial?.status ?? "open") as Status,
      assignee_id: initial?.assignee_id ?? "",
      property_id: initial?.property_id ?? "",
      contact_id: initial?.contact_id ?? "",
      lead_id: initial?.lead_id ?? "",
    });
  }, [initial, open]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description,
        due_at: fromLocalInput(form.due_at),
        remind_at: fromLocalInput(form.remind_at),
        priority: form.priority,
        status: form.status,
        assignee_id: form.assignee_id || null,
        property_id: form.property_id || null,
        contact_id: form.contact_id || null,
        lead_id: form.lead_id || null,
      } as const;
      if (initial) return updateTask({ data: { id: initial.id, ...payload } });
      return createTask({ data: { org_id: orgId, ...payload } });
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? t("tasks.edit") : t("tasks.create")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("tasks.fields.title")}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("tasks.fields.description")}</Label>
            <Textarea
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("tasks.fields.dueAt")}</Label>
              <Input
                type="datetime-local"
                value={form.due_at}
                onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("tasks.fields.remindAt")}</Label>
              <Input
                type="datetime-local"
                value={form.remind_at}
                onChange={(e) => setForm({ ...form, remind_at: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t("tasks.fields.priority")}</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`tasks.priorities.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("tasks.fields.status")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Status })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`tasks.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("tasks.fields.assignee")}</Label>
              <Select
                value={form.assignee_id || "__none"}
                onValueChange={(v) => setForm({ ...form, assignee_id: v === "__none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("tasks.fields.unassigned")}</SelectItem>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name ?? m.user_id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t("tasks.fields.property")}</Label>
              <Select
                value={form.property_id || "__none"}
                onValueChange={(v) => setForm({ ...form, property_id: v === "__none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("tasks.fields.noLink")}</SelectItem>
                  {(propsQ.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {(i18n.language === "ar" ? p.title_ar : p.title_en) ??
                        p.title_en ??
                        p.title_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("tasks.fields.contact")}</Label>
              <Select
                value={form.contact_id || "__none"}
                onValueChange={(v) => setForm({ ...form, contact_id: v === "__none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("tasks.fields.noLink")}</SelectItem>
                  {(contactsQ.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("tasks.fields.lead")}</Label>
              <Select
                value={form.lead_id || "__none"}
                onValueChange={(v) => setForm({ ...form, lead_id: v === "__none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("tasks.fields.noLink")}</SelectItem>
                  {(leadsQ.data ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.contact?.full_name ?? l.id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!form.title.trim() || save.isPending}>
            {t("tasks.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useSmartReminders(tasks: Task[] | undefined, _lang: string) {
  const { t } = useTranslation();
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tasks) return;
    const check = () => {
      const now = Date.now();
      for (const task of tasks) {
        if (task.status === "done" || task.status === "cancelled") continue;
        const target = task.remind_at ?? task.due_at;
        if (!target) continue;
        const at = new Date(target).getTime();
        // Fire when within last minute or already past (up to 24h old) and not fired yet.
        if (at <= now && now - at < 24 * 60 * 60 * 1000) {
          const key = `${task.id}:${target}`;
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          const when = task.due_at
            ? formatDistanceToNowStrict(new Date(task.due_at), { addSuffix: true })
            : "";
          toast(t("tasks.reminderTitle"), {
            description: t("tasks.reminderDue", { title: task.title, when }),
          });
        }
      }
    };
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, [tasks, t]);
}
