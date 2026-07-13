import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Loader2,
  Plus,
  Phone,
  Mail,
  MapPin,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listProperties } from "@/lib/properties.functions";
import {
  createViewing,
  listViewings,
  updateViewingStatus,
  deleteViewing,
} from "@/lib/viewings.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/viewings")({
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
  head: () => sectionHead({ section: "dashboard", entityAr: "المعاينات", entityEn: "Viewings", path: "/dashboard/viewings" }),
  component: ViewingsPage,
});

type Status = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

const STATUS_STYLES: Record<Status, string> = {
  scheduled: "bg-info/10 text-info dark:text-info",
  confirmed: "bg-success/10 text-success dark:text-success",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-warning/10 text-warning dark:text-warning",
};

function ViewingsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => listMyOrganizations() });
  const orgs = orgsQ.data ?? [];
  const [orgId, setOrgId] = useState<string>("");
  const activeOrg = orgId || orgs[0]?.org.id || "";

  const propsQ = useQuery({
    queryKey: ["properties", activeOrg],
    queryFn: () => listProperties({ data: { org_id: activeOrg } }),
    enabled: !!activeOrg,
  });

  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [range, setRange] = useState<"upcoming" | "past" | "all">("upcoming");

  const { from, to } = useMemo(() => {
    if (range === "upcoming") return { from: new Date().toISOString(), to: null };
    if (range === "past") return { from: null, to: new Date().toISOString() };
    return { from: null, to: null };
  }, [range]);

  const listQ = useQuery({
    queryKey: ["viewings", activeOrg, statusFilter, range],
    queryFn: () =>
      listViewings({
        data: {
          org_id: activeOrg,
          from,
          to,
          status: statusFilter === "all" ? null : statusFilter,
          limit: 100,
        },
      }),
    enabled: !!activeOrg,
  });

  const rows = listQ.data ?? [];

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: Status }) =>
      updateViewingStatus({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["viewings"] });
      toast.success(isAr ? "تم التحديث" : "Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteViewing({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["viewings"] });
      toast.success(isAr ? "تم الحذف" : "Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusLabel = (s: Status) =>
    isAr
      ? { scheduled: "مجدول", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغى", no_show: "لم يحضر" }[s]
      : { scheduled: "Scheduled", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" }[s];

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isAr ? "حجز مواعيد الزيارات" : "Viewing Appointments"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "نظّم جولات معاينة العقارات مع المستأجرين والمشترين المحتملين."
                : "Schedule and manage property viewings with prospective tenants and buyers."}
            </p>
          </div>
        </div>

        <NewViewingDialog
          isAr={isAr}
          orgId={activeOrg}
          properties={propsQ.data ?? []}
          onCreated={() => qc.invalidateQueries({ queryKey: ["viewings"] })}
        />
      </div>

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-3">
        {orgs.length > 1 && (
          <div className="min-w-[180px]">
            <Select value={activeOrg} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.org.id} value={o.org.id}>
                    {o.org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="min-w-[160px]">
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">{isAr ? "القادمة" : "Upcoming"}</SelectItem>
              <SelectItem value="past">{isAr ? "السابقة" : "Past"}</SelectItem>
              <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
              {(["scheduled", "confirmed", "completed", "cancelled", "no_show"] as Status[]).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ),
              )}
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
            <CalendarClock className="size-6 text-primary/60" />
            {isAr ? "لا توجد مواعيد ضمن هذه التصفية." : "No viewings match this filter."}
          </div>
        )}
        {rows.map((v: any) => {
          const dt = new Date(v.scheduled_at);
          const s = v.status as Status;
          const propTitle =
            v.properties?.[isAr ? "title_ar" : "title_en"] ??
            v.properties?.title_ar ??
            v.properties?.title_en ??
            (isAr ? "بدون عقار محدد" : "No property linked");
          return (
            <div
              key={v.id}
              className="surface-card flex flex-wrap items-start gap-4 p-4"
            >
              <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-primary/5 p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {dt.toLocaleDateString(isAr ? "ar-SA" : "en-US", { month: "short" })}
                </div>
                <div className="text-xl font-bold text-primary">{dt.getDate()}</div>
                <div className="text-[10px] text-muted-foreground">
                  {dt.toLocaleTimeString(isAr ? "ar-SA" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{v.visitor_name}</div>
                  <Badge className={STATUS_STYLES[s]} variant="secondary">
                    {statusLabel(s)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {v.duration_min} {isAr ? "د" : "min"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {propTitle}
                    {v.properties?.city ? ` — ${v.properties.city}` : ""}
                  </span>
                  {v.visitor_phone && (
                    <a
                      href={`tel:${v.visitor_phone}`}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Phone className="size-3" /> {v.visitor_phone}
                    </a>
                  )}
                  {v.visitor_email && (
                    <a
                      href={`mailto:${v.visitor_email}`}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Mail className="size-3" /> {v.visitor_email}
                    </a>
                  )}
                </div>
                {v.notes && (
                  <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs">{v.notes}</div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={s}
                  onValueChange={(val) =>
                    statusMut.mutate({ id: v.id, status: val as Status })
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["scheduled", "confirmed", "completed", "cancelled", "no_show"] as Status[]).map(
                      (opt) => (
                        <SelectItem key={opt} value={opt}>
                          {statusLabel(opt)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm(isAr ? "حذف الموعد؟" : "Delete viewing?"))
                      delMut.mutate(v.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewViewingDialog({
  isAr,
  orgId,
  properties,
  onCreated,
}: {
  isAr: boolean;
  orgId: string;
  properties: Array<{ id: string; title_ar: string; title_en: string; city?: string | null }>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [when, setWhen] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState(30);
  const [source, setSource] = useState<"internal" | "portal" | "website" | "whatsapp" | "other">(
    "internal",
  );
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      createViewing({
        data: {
          org_id: orgId,
          property_id: propertyId || null,
          visitor_name: name.trim(),
          visitor_phone: phone || null,
          visitor_email: email || null,
          scheduled_at: when,
          duration_min: duration,
          source,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم حجز الموعد" : "Viewing scheduled");
      onCreated();
      setOpen(false);
      setName("");
      setPhone("");
      setEmail("");
      setNotes("");
      setPropertyId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!orgId && name.trim().length >= 2 && !!when && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!orgId} className="gap-2">
          <Plus className="size-4" /> {isAr ? "موعد جديد" : "New viewing"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAr ? "حجز موعد زيارة" : "Schedule viewing"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>{isAr ? "العقار (اختياري)" : "Property (optional)"}</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder={isAr ? "اختر عقارًا" : "Choose property"} />
              </SelectTrigger>
              <SelectContent>
                {properties.slice(0, 200).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {isAr ? p.title_ar : p.title_en}
                    {p.city ? ` — ${p.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{isAr ? "اسم الزائر" : "Visitor name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "الهاتف" : "Phone"}</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+9665..."
              />
            </div>
            <div>
              <Label>{isAr ? "البريد" : "Email"}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "تاريخ ووقت" : "Date & time"}</Label>
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <div>
              <Label>{isAr ? "المدة (دقيقة)" : "Duration (min)"}</Label>
              <Input
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 30)}
              />
            </div>
          </div>

          <div>
            <Label>{isAr ? "المصدر" : "Source"}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">{isAr ? "داخلي" : "Internal"}</SelectItem>
                <SelectItem value="portal">{isAr ? "بوابة العميل" : "Portal"}</SelectItem>
                <SelectItem value="website">{isAr ? "الموقع" : "Website"}</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="other">{isAr ? "أخرى" : "Other"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{isAr ? "ملاحظات" : "Notes"}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button disabled={!canSubmit} onClick={() => mut.mutate()}>
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <CalendarClock className="size-4" />{" "}
                {isAr ? "تأكيد الحجز" : "Confirm booking"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Kept for future icon reuse
void CheckCircle2;
void XCircle;
void Clock;