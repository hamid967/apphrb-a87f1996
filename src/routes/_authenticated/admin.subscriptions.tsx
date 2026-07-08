import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSubscriptionRequests,
  reviewSubscriptionRequest,
} from "@/lib/billing.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => sectionHead({ section: "admin", entityAr: "الاشتراكات", entityEn: "Subscriptions", path: "/admin/subscriptions" }),
  component: AdminSubscriptions,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const TABS = [
  { key: "pending", ar: "بانتظار الموافقة", en: "Pending", icon: Clock },
  { key: "active", ar: "مُفعّل", en: "Active", icon: CheckCircle2 },
  { key: "rejected", ar: "مرفوض", en: "Rejected", icon: XCircle },
  { key: "all", ar: "الكل", en: "All", icon: ShieldCheck },
];

function AdminSubscriptions() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [approveFor, setApproveFor] = useState<any | null>(null);
  const [rejectFor, setRejectFor] = useState<any | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [months, setMonths] = useState("1");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriptions", tab],
    queryFn: () => listSubscriptionRequests({ data: { status: tab } }),
  });

  const mut = useMutation({
    mutationFn: (v: {
      id: string;
      decision: "approve" | "reject";
      billing_cycle?: "monthly" | "yearly";
      months?: number;
      reason?: string;
    }) => reviewSubscriptionRequest({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      setApproveFor(null);
      setRejectFor(null);
      setReason("");
      setMonths("1");
      setCycle("monthly");
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <header className="mb-5 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">
            {isAr ? "طلبات الاشتراك" : "Subscription Requests"}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isAr
              ? "مراجعة وتفعيل اشتراكات المنشآت الجديدة"
              : "Review and activate new organization subscriptions"}
          </p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-border/60 bg-card/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-3.5" />
            {isAr ? t.ar : t.en}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "المنشأة" : "Organization"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الباقة" : "Package"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الدورة" : "Cycle"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "تاريخ الطلب" : "Requested"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "ينتهي" : "Ends"}</th>
              <th className="px-4 py-2 text-end">{isAr ? "إجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {isAr ? "لا توجد طلبات" : "No requests"}
                </td>
              </tr>
            )}
            {items.map((r: any) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.organizations?.name ?? r.org_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{r.organizations?.slug}</div>
                </td>
                <td className="px-4 py-3">{r.packages?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} isAr={!!isAr} />
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="mt-1 text-xs text-destructive/80 max-w-[240px]">
                      {r.rejection_reason}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.billing_cycle === "yearly"
                    ? isAr
                      ? "سنوي"
                      : "Yearly"
                    : isAr
                      ? "شهري"
                      : "Monthly"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.end_date
                    ? new Date(r.end_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {r.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setApproveFor(r);
                            setCycle("monthly");
                            setMonths("1");
                          }}
                        >
                          <CheckCircle2 className="me-1 size-3.5" />
                          {isAr ? "قبول" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setRejectFor(r);
                            setReason("");
                          }}
                        >
                          <XCircle className="me-1 size-3.5" />
                          {isAr ? "رفض" : "Reject"}
                        </Button>
                      </>
                    )}
                    {r.status !== "pending" && (
                      <span className="text-xs text-muted-foreground">
                        {r.reviewed_at
                          ? new Date(r.reviewed_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")
                          : "—"}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Approve dialog */}
      <Dialog open={!!approveFor} onOpenChange={(o) => !o && setApproveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isAr ? "تفعيل الاشتراك" : "Approve subscription"}
            </DialogTitle>
            <DialogDescription>
              {approveFor?.organizations?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {isAr ? "الدورة" : "Cycle"}
              </label>
              <Select value={cycle} onValueChange={(v) => setCycle(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem>
                  <SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {isAr ? "عدد الأشهر" : "Number of months"}
              </label>
              <Input
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveFor(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={mut.isPending}
              onClick={() =>
                mut.mutate({
                  id: approveFor.id,
                  decision: "approve",
                  billing_cycle: cycle,
                  months: Number(months) || (cycle === "yearly" ? 12 : 1),
                })
              }
            >
              {mut.isPending && <Loader2 className="me-2 size-3.5 animate-spin" />}
              {isAr ? "تفعيل" : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "رفض الطلب" : "Reject request"}</DialogTitle>
            <DialogDescription>{rejectFor?.organizations?.name}</DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {isAr ? "سبب الرفض" : "Rejection reason"}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder={isAr ? "اكتب سبب الرفض..." : "Write the rejection reason..."}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              disabled={mut.isPending || !reason.trim()}
              onClick={() =>
                mut.mutate({
                  id: rejectFor.id,
                  decision: "reject",
                  reason: reason.trim(),
                })
              }
            >
              {mut.isPending && <Loader2 className="me-2 size-3.5 animate-spin" />}
              {isAr ? "رفض" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { label: [string, string]; cls: string }> = {
    pending: {
      label: ["Pending", "بانتظار الموافقة"],
      cls: "bg-warning/10 text-warning border-warning/30",
    },
    active: {
      label: ["Active", "مُفعّل"],
      cls: "bg-success/10 text-success border-success/30",
    },
    rejected: {
      label: ["Rejected", "مرفوض"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
    expired: {
      label: ["Expired", "منتهي"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
    cancelled: {
      label: ["Cancelled", "ملغي"],
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const v = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${v.cls}`}
    >
      {isAr ? v.label[1] : v.label[0]}
    </span>
  );
}