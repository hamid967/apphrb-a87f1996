import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  Search,
  Loader2,
  Plus,
  Trash2,
  Package,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listTechnicians } from "@/lib/maintenance.functions";
import {
  listMaintenanceLog,
  assignTechnician,
  updateTicketStatus,
  addMaintenancePart,
  deleteMaintenancePart,
} from "@/lib/maintenance-log.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/maintenance-log")({
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
  head: () => sectionHead({ section: "dashboard", entityAr: "سجل الصيانة", entityEn: "Maintenance Log", path: "/dashboard/maintenance-log" }),
  component: MaintenanceLogPage,
});

type Status = "open" | "assigned" | "in_progress" | "on_hold" | "completed" | "cancelled";
const STATUSES: Status[] = ["open", "assigned", "in_progress", "on_hold", "completed", "cancelled"];

const STATUS_STYLES: Record<Status, string> = {
  open: "bg-info/10 text-info dark:text-info",
  assigned: "bg-info/10 text-info dark:text-info",
  in_progress: "bg-warning/10 text-warning dark:text-warning",
  on_hold: "bg-warning/10 text-warning dark:text-warning",
  completed: "bg-success/10 text-success dark:text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/10 text-info",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

function statusLabel(s: Status, isAr: boolean) {
  const ar: Record<Status, string> = {
    open: "مفتوح",
    assigned: "مُسند",
    in_progress: "قيد التنفيذ",
    on_hold: "معلّق",
    completed: "مكتمل",
    cancelled: "ملغى",
  };
  const en: Record<Status, string> = {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In progress",
    on_hold: "On hold",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return isAr ? ar[s] : en[s];
}

function MaintenanceLogPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => listMyOrganizations() });
  const orgs = orgsQ.data ?? [];
  const [orgId, setOrgId] = useState("");
  const activeOrg = orgId || orgs[0]?.org.id || "";

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  const techQ = useQuery({
    queryKey: ["technicians", activeOrg],
    queryFn: () => listTechnicians({ data: { orgId: activeOrg } }),
    enabled: !!activeOrg,
  });
  const technicians = techQ.data ?? [];

  const listQ = useQuery({
    queryKey: ["maintenance-log", activeOrg, statusFilter, q],
    queryFn: () =>
      listMaintenanceLog({
        data: {
          org_id: activeOrg,
          status: statusFilter === "all" ? null : statusFilter,
          q: q || null,
        },
      }),
    enabled: !!activeOrg,
  });
  const rows: any[] = listQ.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["maintenance-log"] });

  const assignMut = useMutation({
    mutationFn: (v: { ticket_id: string; technician_id: string | null }) =>
      assignTechnician({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success(isAr ? "تم الإسناد" : "Assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (v: { ticket_id: string; status: Status }) =>
      updateTicketStatus({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success(isAr ? "تم تحديث الحالة" : "Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = useMemo(() => {
    const counts: Record<Status, number> = {
      open: 0, assigned: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0,
    };
    let totalCost = 0;
    for (const r of rows) {
      counts[r.status as Status] = (counts[r.status as Status] ?? 0) + 1;
      for (const p of r.parts ?? []) totalCost += Number(p.quantity) * Number(p.unit_cost);
    }
    return { counts, totalCost };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Wrench className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? "سجل الصيانة التفاعلي" : "Interactive Maintenance Log"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "تابع كل بلاغ صيانة مع الفني المسؤول وقطع الغيار المستخدمة والحالة الحالية."
              : "Track every maintenance ticket with its technician, spare parts, and current status."}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STATUSES.map((s) => (
          <div key={s} className="surface-card p-3">
            <div className="text-[10px] uppercase text-muted-foreground">
              {statusLabel(s, isAr)}
            </div>
            <div className="text-xl font-bold text-primary">
              {summary.counts[s] ?? 0}
            </div>
          </div>
        ))}
        <div className="surface-card col-span-2 p-3 sm:col-span-1">
          <div className="text-[10px] uppercase text-muted-foreground">
            {isAr ? "قطع الغيار" : "Parts cost"}
          </div>
          <div className="text-xl font-bold text-primary">
            {summary.totalCost.toLocaleString(isAr ? "ar-SA" : "en-US", {
              maximumFractionDigits: 0,
            })}
          </div>
        </div>
      </div>

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-3">
        {orgs.length > 1 && (
          <div className="min-w-[180px]">
            <Select value={activeOrg} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.org.id} value={o.org.id}>{o.org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isAr ? "ابحث بالعنوان أو الرقم..." : "Search title or ticket number..."}
            className="ps-9"
          />
        </div>
        <div className="min-w-[160px]">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{statusLabel(s, isAr)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ms-auto text-xs text-muted-foreground">
          {isAr ? "إجمالي" : "Total"}: {rows.length}
        </div>
      </div>

      <div className="space-y-3">
        {listQ.isLoading && (
          <div className="surface-card grid place-items-center p-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {!listQ.isLoading && rows.length === 0 && (
          <div className="surface-card grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Wrench className="size-6 text-primary/60" />
            {isAr ? "لا توجد بلاغات صيانة." : "No maintenance tickets."}
          </div>
        )}
        {rows.map((t) => (
          <TicketRow
            key={t.id}
            t={t}
            isAr={isAr}
            technicians={technicians}
            onAssign={(technician_id) =>
              assignMut.mutate({ ticket_id: t.id, technician_id })
            }
            onStatus={(status) => statusMut.mutate({ ticket_id: t.id, status })}
            onChanged={invalidate}
          />
        ))}
      </div>
    </div>
  );
}

function TicketRow({
  t,
  isAr,
  technicians,
  onAssign,
  onStatus,
  onChanged,
}: {
  t: any;
  isAr: boolean;
  technicians: Array<{ id: string; full_name: string; specialty?: string | null }>;
  onAssign: (id: string | null) => void;
  onStatus: (s: Status) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = t.status as Status;
  const propTitle = t.property
    ? t.property[isAr ? "title_ar" : "title_en"] ??
      t.property.title_ar ??
      t.property.title_en
    : null;
  const partsTotal =
    (t.parts ?? []).reduce(
      (acc: number, p: any) => acc + Number(p.quantity) * Number(p.unit_cost),
      0,
    ) || 0;

  return (
    <div className="surface-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/5 text-primary">
          <Wrench className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">#{t.ticket_no}</span>
            <div className="font-semibold">{t.title}</div>
            <Badge className={STATUS_STYLES[s]} variant="secondary">
              {statusLabel(s, isAr)}
            </Badge>
            <Badge className={PRIORITY_STYLES[t.priority] ?? ""} variant="secondary">
              {t.priority}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {propTitle && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" /> {propTitle}
              </span>
            )}
            {t.technician && (
              <span className="flex items-center gap-1">
                <UserIcon className="size-3" /> {t.technician.full_name}
                {t.technician.specialty ? ` — ${t.technician.specialty}` : ""}
              </span>
            )}
            {t.technician?.phone && (
              <a href={`tel:${t.technician.phone}`} className="flex items-center gap-1 hover:text-primary">
                <Phone className="size-3" /> {t.technician.phone}
              </a>
            )}
            <span className="flex items-center gap-1">
              <Package className="size-3" /> {(t.parts ?? []).length}{" "}
              {isAr ? "قطعة" : "parts"}
            </span>
            {partsTotal > 0 && (
              <span>
                {partsTotal.toLocaleString(isAr ? "ar-SA" : "en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                {t.currency ?? "SAR"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={t.technician?.id ?? "__none"}
            onValueChange={(v) => onAssign(v === "__none" ? null : v)}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder={isAr ? "اختر فنيًا" : "Choose technician"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{isAr ? "بدون فني" : "Unassigned"}</SelectItem>
              {technicians.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={s} onValueChange={(v) => onStatus(v as Status)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {statusLabel(opt, isAr)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((x) => !x)}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t pt-4">
          <PartsPanel
            ticketId={t.id}
            parts={t.parts ?? []}
            currency={t.currency ?? "SAR"}
            isAr={isAr}
            onChanged={onChanged}
          />
          {t.description && (
            <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs">
              <div className="mb-1 font-semibold">{isAr ? "الوصف" : "Description"}</div>
              {t.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartsPanel({
  ticketId,
  parts,
  currency,
  isAr,
  onChanged,
}: {
  ticketId: string;
  parts: any[];
  currency: string;
  isAr: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [supplier, setSupplier] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      addMaintenancePart({
        data: {
          ticket_id: ticketId,
          name: name.trim(),
          sku: sku || null,
          quantity: qty,
          unit_cost: cost,
          supplier: supplier || null,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تمت إضافة القطعة" : "Part added");
      setName("");
      setSku("");
      setQty(1);
      setCost(0);
      setSupplier("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteMaintenancePart({ data: { id } }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحذف" : "Deleted");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Package className="size-4 text-primary" />
        {isAr ? "قطع الغيار المستخدمة" : "Spare parts used"}
      </div>
      {parts.length === 0 && (
        <div className="mb-3 text-xs text-muted-foreground">
          {isAr ? "لا توجد قطع بعد." : "No parts yet."}
        </div>
      )}
      {parts.length > 0 && (
        <div className="mb-3 overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-2 text-start">{isAr ? "القطعة" : "Part"}</th>
                <th className="p-2 text-start">{isAr ? "الرمز" : "SKU"}</th>
                <th className="p-2 text-end">{isAr ? "الكمية" : "Qty"}</th>
                <th className="p-2 text-end">{isAr ? "سعر الوحدة" : "Unit"}</th>
                <th className="p-2 text-end">{isAr ? "الإجمالي" : "Total"}</th>
                <th className="p-2 text-start">{isAr ? "المورد" : "Supplier"}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">{p.sku ?? "—"}</td>
                  <td className="p-2 text-end">{Number(p.quantity)}</td>
                  <td className="p-2 text-end">{Number(p.unit_cost).toLocaleString()}</td>
                  <td className="p-2 text-end font-semibold text-primary">
                    {(Number(p.quantity) * Number(p.unit_cost)).toLocaleString()}{" "}
                    {p.currency ?? currency}
                  </td>
                  <td className="p-2 text-muted-foreground">{p.supplier ?? "—"}</td>
                  <td className="p-2 text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(isAr ? "حذف القطعة؟" : "Delete part?"))
                          delMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <Label className="text-[10px]">{isAr ? "اسم القطعة" : "Part name"}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px]">{isAr ? "الرمز" : "SKU"}</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px]">{isAr ? "الكمية" : "Qty"}</Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 0)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px]">{isAr ? "سعر الوحدة" : "Unit cost"}</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={cost}
            onChange={(e) => setCost(Number(e.target.value) || 0)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px]">{isAr ? "المورد" : "Supplier"}</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-8" />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          className="gap-2"
          disabled={!name.trim() || qty <= 0 || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          {addMut.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Plus className="size-3" />
          )}
          {isAr ? "إضافة قطعة" : "Add part"}
        </Button>
      </div>
    </div>
  );
}