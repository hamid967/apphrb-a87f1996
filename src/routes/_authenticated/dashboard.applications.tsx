import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listRentalApplications,
  getRentalApplication,
  updateApplicationStatus,
  approveApplication,
  listVacantUnits,
  listApplicationAudit,
  signApplicationDocuments,
  listOrgListings,
  addApplicationNote,
} from "@/lib/rental-applications.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Eye, UserPlus, Inbox, GripVertical, MessageSquarePlus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, History, ChevronDown, ChevronUp, Image as ImageIcon, FileType } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

import { sectionHead } from "@/lib/section-og-head";
const AppsSearchSchema = z.object({
  open: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/dashboard/applications")({
  validateSearch: zodValidator(AppsSearchSchema),
  head: () => sectionHead({ section: "dashboard", entityAr: "طلبات الإيجار", entityEn: "Rental Applications", path: "/dashboard/applications" }),
  component: ApplicationsPage,
});

type Status = "new" | "reviewing" | "approved" | "rejected";

function statusColor(s: Status) {
  switch (s) {
    case "new":
      return "bg-info/10 text-info dark:text-info border-info/20";
    case "reviewing":
      return "bg-warning/10 text-warning dark:text-warning border-warning/20";
    case "approved":
      return "bg-success/10 text-success dark:text-success border-success/20";
    case "rejected":
      return "bg-destructive/10 text-destructive dark:text-destructive border-destructive/20";
  }
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-success dark:text-success font-semibold";
  if (score >= 50) return "text-warning dark:text-warning font-semibold";
  return "text-destructive dark:text-destructive font-semibold";
}

function ApplicationsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const { orgId, loading: orgLoading } = useCurrentOrg();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [listingId, setListingId] = useState<string>("all");
  const routeSearch = Route.useSearch();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(routeSearch.open ?? null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // Sync selection with the ?open= URL search param (e.g. from notification links).
  useEffect(() => {
    if (routeSearch.open && routeSearch.open !== selectedId) {
      setSelectedId(routeSearch.open);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch.open]);

  const clearSelection = () => {
    setSelectedId(null);
    if (routeSearch.open) {
      router.navigate({
        to: "/dashboard/applications",
        search: { open: undefined } as never,
        replace: true,
      });
    }
  };

  const list = useQuery({
    queryKey: ["rental-applications", orgId, statusFilter, search, listingId],
    queryFn: () =>
      listRentalApplications({
        data: {
          orgId: orgId!,
          status: statusFilter === "all" ? undefined : statusFilter,
          search: search || undefined,
          listingId: listingId === "all" ? undefined : listingId,
        },
      }),
    enabled: !!orgId,
  });

  const listings = useQuery({
    queryKey: ["org-listings", orgId],
    queryFn: () => listOrgListings({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const statusMut = useMutation({
    mutationFn: (input: { id: string; status: "reviewing" | "rejected" }) =>
      updateApplicationStatus({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-applications"] });
      qc.invalidateQueries({ queryKey: ["rental-application"] });
      toast.success(isAr ? "تم تحديث الحالة" : "Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const rows = list.data ?? [];
    const c: Record<Status, number> = { new: 0, reviewing: 0, approved: 0, rejected: 0 };
    rows.forEach((r) => {
      c[r.status as Status] = (c[r.status as Status] ?? 0) + 1;
    });
    return c;
  }, [list.data]);

  const grouped = useMemo(() => {
    const rows = list.data ?? [];
    const g: Record<Status, typeof rows> = { new: [], reviewing: [], approved: [], rejected: [] };
    rows.forEach((r) => {
      const s = r.status as Status;
      if (g[s]) g[s].push(r);
    });
    return g;
  }, [list.data]);

  const listingTitle = (id: string | null | undefined) => {
    if (!id) return "—";
    const l = (listings.data ?? []).find((x) => x.id === id);
    return l?.title ?? "—";
  };

  function onDropTo(target: Status, appId: string) {
    const row = (list.data ?? []).find((r) => r.id === appId);
    if (!row || row.status === target) return;
    if (target === "approved") {
      setSelectedId(appId);
      setApproveOpen(true);
      return;
    }
    if (target === "new") return; // don't allow moving back to new
    statusMut.mutate({ id: appId, status: target });
  }

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir={isAr ? "rtl" : "ltr"}>
      <div>
        <h1 className="text-2xl font-bold">{isAr ? "طلبات السكن" : "Rental Applications"}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAr
            ? "لوحة Kanban لإدارة الطلبات — اسحب البطاقة بين الأعمدة لتغيير الحالة."
            : "Kanban board for managing applications — drag cards between columns to change status."}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالاسم / البريد / الجوال" : "Search name / email / phone"}
            className="w-64"
          />
          <Select value={listingId} onValueChange={setListingId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={isAr ? "كل الإعلانات" : "All listings"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الإعلانات" : "All listings"}</SelectItem>
              {(listings.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
              <SelectItem value="new">{isAr ? "جديدة" : "New"}</SelectItem>
              <SelectItem value="reviewing">{isAr ? "قيد المراجعة" : "Reviewing"}</SelectItem>
              <SelectItem value="approved">{isAr ? "مقبولة" : "Approved"}</SelectItem>
              <SelectItem value="rejected">{isAr ? "مرفوضة" : "Rejected"}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
          {isAr ? "لا توجد طلبات مطابقة" : "No matching applications"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(["new", "reviewing", "approved", "rejected"] as Status[]).map((col) => (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                if (id) onDropTo(col, id);
                setDragId(null);
              }}
              className="rounded-xl border border-border/60 bg-muted/30 min-h-[240px] flex flex-col"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusColor(col)}>
                    {isAr
                      ? { new: "جديدة", reviewing: "قيد المراجعة", approved: "مقبولة", rejected: "مرفوضة" }[col]
                      : { new: "New", reviewing: "Reviewing", approved: "Approved", rejected: "Rejected" }[col]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{counts[col]}</span>
                </div>
              </div>
              <div className="p-2 flex flex-col gap-2 flex-1">
                {grouped[col].length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-8 opacity-70">
                    {isAr ? "لا شيء هنا" : "Nothing here"}
                  </div>
                ) : (
                  grouped[col].map((r) => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={(e) => {
                        setDragId(r.id);
                        e.dataTransfer.setData("text/plain", r.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`group rounded-lg bg-card border border-border/60 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/40 transition ${
                        dragId === r.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{r.applicant_name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>
                        </div>
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-2 truncate">
                        {isAr ? "الإعلان: " : "Listing: "}
                        {listingTitle(r.listing_id)}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs ${scoreColor(r.score)}`}>
                          {isAr ? "التقييم: " : "Score: "}
                          {r.score ?? "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setSelectedId(r.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {(r.status === "new" || r.status === "reviewing") && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-success"
                              onClick={() => {
                                setSelectedId(r.id);
                                setApproveOpen(true);
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive"
                              onClick={() => statusMut.mutate({ id: r.id, status: "rejected" })}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <ApplicationDetailSheet
          id={selectedId}
          open={!approveOpen}
          onClose={clearSelection}
          onApprove={() => setApproveOpen(true)}
        />
      )}
      {selectedId && approveOpen && orgId && (
        <ApproveDialog
          appId={selectedId}
          orgId={orgId}
          onClose={() => {
            setApproveOpen(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}

function ApplicationDetailSheet({
  id,
  open,
  onClose,
  onApprove,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const qc = useQueryClient();
  const q = useSuspenseQuery({
    queryKey: ["rental-application", id],
    queryFn: () => getRentalApplication({ data: { id } }),
  });
  const app = q.data;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const statusMut = useMutation({
    mutationFn: (input: { status: "reviewing" | "rejected"; notes?: string }) =>
      updateApplicationStatus({ data: { id, ...input } }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["rental-applications"] });
      qc.invalidateQueries({ queryKey: ["rental-application", id] });
      qc.invalidateQueries({ queryKey: ["application-audit", id] });
      toast.success(
        vars.status === "rejected"
          ? isAr
            ? "تم رفض الطلب"
            : "Application rejected"
          : isAr
            ? "بدأت المراجعة"
            : "Review started",
      );
      if (vars.status === "rejected") {
        setRejectOpen(false);
        setReason("");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteMut = useMutation({
    mutationFn: (text: string) => addApplicationNote({ data: { id, note: text } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-applications"] });
      qc.invalidateQueries({ queryKey: ["rental-application", id] });
      qc.invalidateQueries({ queryKey: ["application-audit", id] });
      toast.success(isAr ? "تمت إضافة الملاحظة وأُرسلت الإشعارات" : "Note added and notifications sent");
      setNoteOpen(false);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!app) return null;
  const isOpen = app.status === "new" || app.status === "reviewing";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={isAr ? "left" : "right"} className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {app.applicant_name}
            <Badge variant="outline" className={statusColor(app.status as Status)}>
              {isAr
                ? { new: "جديد", reviewing: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" }[
                    app.status as Status
                  ]
                : app.status}
            </Badge>
          </SheetTitle>
          <SheetDescription>{app.email}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="details" className="mt-4" dir={isAr ? "rtl" : "ltr"}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">{isAr ? "التفاصيل" : "Details"}</TabsTrigger>
            <TabsTrigger value="documents">
              {isAr ? "المستندات" : "Documents"}
              <span className="ms-1 text-[10px] opacity-70">
                ({Array.isArray(app.documents) ? (app.documents as unknown[]).length : 0})
              </span>
            </TabsTrigger>
            <TabsTrigger value="history">{isAr ? "السجل" : "History"}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-3 text-sm">
            <Row label={isAr ? "التقييم الآلي" : "Auto score"} value={app.score?.toString() ?? "—"} />
            <Row label={isAr ? "الجوال" : "Phone"} value={app.phone ?? "—"} />
            <Row label={isAr ? "رقم الهوية" : "National ID"} value={app.national_id ?? "—"} />
            <Row label={isAr ? "نوع الهوية" : "ID type"} value={app.id_type ?? "—"} />
            <Row label={isAr ? "نوع التوظيف" : "Employment"} value={app.employment_type ?? "—"} />
            <Row label={isAr ? "جهة العمل" : "Employer"} value={app.employer ?? "—"} />
            <Row
              label={isAr ? "الدخل الشهري" : "Monthly income"}
              value={
                app.monthly_income != null
                  ? `${Number(app.monthly_income).toLocaleString()} ${isAr ? "ر.س" : "SAR"}`
                  : "—"
              }
            />
            <Row
              label={isAr ? "الإيجار الحالي" : "Current rent"}
              value={
                app.current_rent != null
                  ? `${Number(app.current_rent).toLocaleString()} ${isAr ? "ر.س" : "SAR"}`
                  : "—"
              }
            />
            <Row label={isAr ? "المعالون" : "Dependents"} value={app.dependents?.toString() ?? "—"} />
            <Row label={isAr ? "تاريخ السكن المرغوب" : "Move-in date"} value={app.move_in_date ?? "—"} />
            <Row
              label={isAr ? "موافقة فحص الائتمان" : "Credit check consent"}
              value={app.credit_check_consent ? (isAr ? "نعم" : "Yes") : isAr ? "لا" : "No"}
            />
            <Row
              label={isAr ? "تاريخ الاستلام" : "Received at"}
              value={new Date(app.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
            />
            {app.reviewed_at && (
              <Row
                label={isAr ? "تاريخ المراجعة" : "Reviewed at"}
                value={new Date(app.reviewed_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
              />
            )}
            {app.converted_contract_id && (
              <Row
                label={isAr ? "العقد" : "Contract"}
                value={String(app.converted_contract_id).slice(0, 8) + "…"}
              />
            )}
            {app.notes && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {isAr ? "ملاحظات" : "Notes"}
                </div>
                <div className="rounded border p-2 whitespace-pre-wrap">{app.notes}</div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsList
              documents={
                (Array.isArray(app.documents) ? app.documents : []) as ApplicationDocument[]
              }
              isAr={isAr}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <AuditTimeline id={id} isAr={isAr} />
          </TabsContent>
        </Tabs>

        {isOpen && (
          <div className="mt-6 pt-4 border-t space-y-2">
            {app.status === "new" && (
              <Button
                variant="outline"
                className="w-full"
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate({ status: "reviewing" })}
              >
                {isAr ? "بدء المراجعة" : "Start review"}
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full"
              disabled={statusMut.isPending || noteMut.isPending}
              onClick={() => setNoteOpen(true)}
            >
              <MessageSquarePlus className="h-4 w-4 me-2" />
              {isAr ? "إضافة ملاحظة وإشعار" : "Add note & notify"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="w-full"
                onClick={onApprove}
                disabled={statusMut.isPending}
              >
                <CheckCircle2 className="h-4 w-4 me-2" />
                {isAr ? "قبول" : "Approve"}
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setRejectOpen(true)}
                disabled={statusMut.isPending}
              >
                <XCircle className="h-4 w-4 me-2" />
                {isAr ? "رفض" : "Reject"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              {isAr
                ? "«قبول» يفتح نموذج إنشاء العقد. «رفض» يستلزم كتابة السبب."
                : "Approve opens the contract form. Reject requires a reason."}
            </p>
          </div>
        )}

        <Dialog open={noteOpen} onOpenChange={(o) => !o && !noteMut.isPending && setNoteOpen(false)}>
          <DialogContent dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>{isAr ? "إضافة ملاحظة" : "Add note"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>
                {isAr
                  ? "ستُرسل نسخة بالبريد للمقدم وإشعار داخل النظام للفريق"
                  : "Emailed to the applicant, in-app notification to reviewers"}
              </Label>
              <Textarea
                rows={4}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isAr
                    ? "مثال: يرجى إرسال نسخة أوضح من كشف الراتب"
                    : "e.g. Please upload a clearer payslip"
                }
                autoFocus
              />
              <div className="text-[11px] text-muted-foreground text-end">
                {note.trim().length}/2000
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNoteOpen(false)} disabled={noteMut.isPending}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                disabled={noteMut.isPending || note.trim().length < 1}
                onClick={() => noteMut.mutate(note.trim())}
              >
                {noteMut.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                {isAr ? "إرسال" : "Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rejectOpen} onOpenChange={(o) => !o && !statusMut.isPending && setRejectOpen(false)}>
          <DialogContent dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>{isAr ? "سبب الرفض" : "Rejection reason"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{isAr ? "اكتب سببًا واضحًا للمقدم" : "Write a clear reason for the applicant"}</Label>
              <Textarea
                rows={4}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  isAr
                    ? "مثال: الدخل الشهري لا يفي بالحد الأدنى للإيجار"
                    : "e.g. Monthly income does not meet the rent threshold"
                }
                autoFocus
              />
              <div className="text-[11px] text-muted-foreground text-end">
                {reason.trim().length}/2000
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={statusMut.isPending}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                variant="destructive"
                disabled={statusMut.isPending || reason.trim().length < 3}
                onClick={() =>
                  statusMut.mutate({ status: "rejected", notes: reason.trim() })
                }
              >
                {statusMut.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                {isAr ? "تأكيد الرفض" : "Confirm reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-end">{value}</span>
    </div>
  );
}

type ApplicationDocument = {
  name?: string;
  path: string;
  size?: number | null;
  type?: string | null;
  uploaded_at?: string | null;
};

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function isImage(d: ApplicationDocument) {
  const t = (d.type ?? "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const ext = d.path.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext);
}
function isPdf(d: ApplicationDocument) {
  const t = (d.type ?? "").toLowerCase();
  if (t === "application/pdf") return true;
  return d.path.split(".").pop()?.toLowerCase() === "pdf";
}

function DocumentsList({
  documents,
  isAr,
}: {
  documents: ApplicationDocument[];
  isAr: boolean;
}) {
  const paths = useMemo(() => documents.map((d) => d.path).filter(Boolean), [documents]);
  const signed = useQuery({
    queryKey: ["application-documents-signed", paths],
    queryFn: () => signApplicationDocuments({ data: { paths } }),
    enabled: paths.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const [openPath, setOpenPath] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        {isAr ? "لم يُرفق أي مستند" : "No documents uploaded"}
      </div>
    );
  }

  const urlFor = (p: string) => signed.data?.find((s) => s.path === p)?.url ?? null;

  return (
    <ul className="space-y-2">
      {documents.map((d) => {
        const url = urlFor(d.path);
        const img = isImage(d);
        const pdf = isPdf(d);
        const previewable = img || pdf;
        const isOpen = openPath === d.path;
        const Icon = img ? ImageIcon : pdf ? FileType : FileText;
        const uploaded = d.uploaded_at
          ? new Date(d.uploaded_at).toLocaleString(isAr ? "ar-SA" : "en-US")
          : null;
        return (
          <li key={d.path} className="rounded-lg border text-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-3">
              <button
                type="button"
                className="flex items-start gap-3 min-w-0 flex-1 text-start"
                onClick={() => previewable && url && setOpenPath(isOpen ? null : d.path)}
                disabled={!previewable || !url}
              >
                {img && url ? (
                  <img
                    src={url}
                    alt=""
                    className="h-10 w-10 rounded object-cover border shrink-0 bg-muted"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {d.name || d.path.split("/").pop()}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                    {d.type && <span>{d.type}</span>}
                    {d.size ? <span>{formatBytes(d.size)}</span> : null}
                    {uploaded && (
                      <span>
                        {isAr ? "رُفع: " : "Uploaded: "}
                        {uploaded}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {previewable && url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => setOpenPath(isOpen ? null : d.path)}
                    aria-label={isAr ? "معاينة" : "Preview"}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                {signed.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isAr ? "تحميل" : "Download"}
                  </a>
                ) : (
                  <span className="text-[11px] text-destructive">
                    {isAr ? "تعذّر التوقيع" : "Unavailable"}
                  </span>
                )}
              </div>
            </div>
            {isOpen && url && (
              <div className="border-t bg-muted/40">
                {img ? (
                  <img
                    src={url}
                    alt={d.name || ""}
                    className="max-h-[420px] w-full object-contain bg-background"
                  />
                ) : pdf ? (
                  <iframe
                    src={`${url}#toolbar=0`}
                    title={d.name || d.path}
                    className="w-full h-[520px] bg-background"
                  />
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type ChangeKind = "all" | "status" | "score" | "notes" | "documents" | "contract" | "created";

function diffKinds(diff: Record<string, unknown>, action: string): ChangeKind[] {
  const k: ChangeKind[] = [];
  if (action === "insert") k.push("created");
  if (diff.status) k.push("status");
  if (diff.score) k.push("score");
  if (diff.notes_changed) k.push("notes");
  if (diff.documents_count) k.push("documents");
  if (diff.converted_contract_id) k.push("contract");
  return k;
}

function AuditTimeline({ id, isAr }: { id: string; isAr: boolean }) {
  const audit = useQuery({
    queryKey: ["application-audit", id],
    queryFn: () => listApplicationAudit({ data: { id } }),
  });
  const [kind, setKind] = useState<ChangeKind>("all");
  const [actor, setActor] = useState<string>("all");
  const [search, setSearch] = useState("");

  if (audit.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const allRows = audit.data ?? [];
  if (allRows.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        {isAr ? "لا توجد تغييرات بعد" : "No changes yet"}
      </div>
    );
  }

  const actors = Array.from(
    new Map(
      allRows
        .filter((r) => !!r.actor)
        .map((r) => [r.actor as string, (r.actor_name as string | null) || (r.actor as string).slice(0, 8)]),
    ).entries(),
  );

  const q = search.trim().toLowerCase();
  const rows = allRows.filter((r) => {
    const diff = (r.diff ?? {}) as Record<string, unknown>;
    const kinds = diffKinds(diff, r.action ?? "");
    if (kind !== "all" && !kinds.includes(kind)) return false;
    if (actor !== "all" && r.actor !== actor) return false;
    if (q) {
      const hay = [
        r.actor_name ?? "",
        r.actor ?? "",
        r.action ?? "",
        JSON.stringify(diff),
        ...renderDiff(diff, isAr),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const kindOptions: { v: ChangeKind; ar: string; en: string }[] = [
    { v: "all", ar: "كل الأنواع", en: "All types" },
    { v: "status", ar: "الحالة", en: "Status" },
    { v: "score", ar: "التقييم", en: "Score" },
    { v: "notes", ar: "الملاحظات", en: "Notes" },
    { v: "documents", ar: "المستندات", en: "Documents" },
    { v: "contract", ar: "العقد", en: "Contract" },
    { v: "created", ar: "إنشاء", en: "Created" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isAr ? "بحث…" : "Search…"}
          className="h-8 w-40"
        />
        <Select value={kind} onValueChange={(v) => setKind(v as ChangeKind)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kindOptions.map((o) => (
              <SelectItem key={o.v} value={o.v}>
                {isAr ? o.ar : o.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder={isAr ? "كل المستخدمين" : "All users"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل المستخدمين" : "All users"}</SelectItem>
            {actors.map(([uid, name]) => (
              <SelectItem key={uid} value={uid}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-8">
          {isAr ? "لا توجد نتائج مطابقة" : "No matching entries"}
        </div>
      ) : (
        <ol className="relative border-s ps-4 space-y-4">
          {rows.map((r) => {
        const diff = (r.diff ?? {}) as Record<string, unknown>;
        return (
          <li key={r.id} className="relative">
            <span className="absolute -start-[7px] top-1.5 h-3 w-3 rounded-full bg-primary/70 ring-4 ring-background" />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{new Date(r.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>
              {(r.actor_name || r.actor) && (
                <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                  {r.actor_name || (r.actor as string).slice(0, 8)}
                </span>
              )}
            </div>
            <div className="text-sm font-medium mt-0.5">
              {r.action === "insert"
                ? isAr
                  ? "تم إنشاء الطلب"
                  : "Application created"
                : isAr
                  ? "تحديث"
                  : "Updated"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {renderDiff(diff, isAr).map((line, i) => (
                <div key={i}>• {line}</div>
              ))}
            </div>
          </li>
        );
          })}
        </ol>
      )}
    </div>
  );
}

function renderDiff(diff: Record<string, unknown>, isAr: boolean): string[] {
  const out: string[] = [];
  const s = diff.status as { from?: string; to?: string } | undefined;
  if (s?.to) out.push(isAr ? `الحالة: ${s.from ?? "—"} ← ${s.to}` : `Status: ${s.from ?? "—"} → ${s.to}`);
  const sc = diff.score as { from?: number | null; to?: number | null } | undefined;
  if (sc && sc.to !== undefined)
    out.push(isAr ? `التقييم: ${sc.from ?? "—"} ← ${sc.to ?? "—"}` : `Score: ${sc.from ?? "—"} → ${sc.to ?? "—"}`);
  const dc = diff.documents_count as { from?: number; to?: number } | undefined;
  if (dc && dc.to !== undefined)
    out.push(isAr ? `المستندات: ${dc.from ?? 0} ← ${dc.to ?? 0}` : `Documents: ${dc.from ?? 0} → ${dc.to ?? 0}`);
  if (diff.notes_changed) out.push(isAr ? "تم تعديل الملاحظات" : "Notes updated");
  if (diff.converted_contract_id) out.push(isAr ? "تم إنشاء العقد" : "Contract created");
  if (out.length === 0 && diff.status && typeof diff.status === "string")
    out.push(isAr ? `الحالة الأولية: ${diff.status}` : `Initial status: ${diff.status}`);
  return out;
}

function ApproveDialog({
  appId,
  orgId,
  onClose,
}: {
  appId: string;
  orgId: string;
  onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const router = useRouter();
  const qc = useQueryClient();
  const units = useQuery({
    queryKey: ["vacant-units", orgId],
    queryFn: () => listVacantUnits({ data: { orgId } }),
  });
  const [unitId, setUnitId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [rent, setRent] = useState<string>("");

  const mut = useMutation({
    mutationFn: () =>
      approveApplication({
        data: {
          id: appId,
          unitId,
          startDate,
          endDate,
          monthlyRent: Number(rent),
        },
      }),
    onSuccess: (r) => {
      toast.success(isAr ? "تم إنشاء العقد" : "Contract created");
      qc.invalidateQueries({ queryKey: ["rental-applications"] });
      qc.invalidateQueries({ queryKey: ["rental-application"] });
      onClose();
      router.navigate({ to: "/dashboard/contracts/$id", params: { id: r.contract_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = unitId && startDate && endDate && Number(rent) > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{isAr ? "قبول وإنشاء عقد" : "Approve & create contract"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{isAr ? "الوحدة الشاغرة" : "Vacant unit"}</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder={isAr ? "اختر وحدة" : "Select a unit"} />
              </SelectTrigger>
              <SelectContent>
                {(units.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code}
                    {u.rent_amount ? ` — ${Number(u.rent_amount).toLocaleString()}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {units.data && units.data.length === 0 && (
              <p className="text-xs text-warning mt-1">
                {isAr ? "لا توجد وحدات شاغرة" : "No vacant units"}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "تاريخ البداية" : "Start date"}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>{isAr ? "تاريخ النهاية" : "End date"}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{isAr ? "الإيجار الشهري (ر.س)" : "Monthly rent (SAR)"}</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              placeholder="2500"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {isAr ? "قبول وإنشاء" : "Approve & create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}