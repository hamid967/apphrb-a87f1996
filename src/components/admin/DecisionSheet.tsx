import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Building2,
  Mail,
  Clock,
  Receipt,
  User as UserIcon,
  Bell,
  CreditCard,
  FileText,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  listPendingSubscriptionPayments,
  reviewSubscriptionPayment,
  signReceiptUrl,
} from "@/lib/billing.functions";
import {
  listUsersForApproval,
  approveUserTrial,
  rejectUserAccount,
} from "@/lib/admin-users.functions";
import {
  listAllPendingPortalInvitations,
  superAdminRevokePortalInvitation,
} from "@/lib/portal-invitations.functions";

export type DecisionKind = "subs" | "receipts" | "users" | "invites";

export function DecisionSheet({
  kind,
  open,
  onOpenChange,
  isAr,
}: {
  kind: DecisionKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAr: boolean;
}) {
  const titles: Record<DecisionKind, { ar: string; en: string; descAr: string; descEn: string; href: string }> = {
    subs: {
      ar: "طلبات الاشتراك المعلّقة",
      en: "Pending subscription requests",
      descAr: "راجع بيانات كل طلب قبل الموافقة على التفعيل أو الرفض.",
      descEn: "Review each request's details before approving or rejecting activation.",
      href: "/admin/subscriptions",
    },
    receipts: {
      ar: "إيصالات التحويل بانتظار الاعتماد",
      en: "Bank receipts pending approval",
      descAr: "افتح الإيصال وراجع بياناته قبل الاعتماد أو الرفض.",
      descEn: "Open the receipt and verify details before approving or rejecting.",
      href: "/admin/subscription-payments",
    },
    users: {
      ar: "مستخدمون بانتظار الاعتماد",
      en: "Users awaiting approval",
      descAr: "راجع بيانات كل حساب جديد قبل تفعيل الفترة التجريبية أو الرفض.",
      descEn: "Review each new account before approving trial or rejecting.",
      href: "/admin/users",
    },
    invites: {
      ar: "دعوات البوابة النشطة",
      en: "Active portal invitations",
      descAr: "راجع الدعوات غير المقبولة وقم بإلغائها إذا لزم الأمر.",
      descEn: "Review unaccepted invitations and revoke them if needed.",
      href: "/admin/portal-invitations",
    },
  };
  const t = titles[kind];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isAr ? "left" : "right"} className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isAr ? t.ar : t.en}</SheetTitle>
          <SheetDescription>{isAr ? t.descAr : t.descEn}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {kind === "subs" && <SubsList isAr={isAr} />}
          {kind === "receipts" && <ReceiptsList isAr={isAr} />}
          {kind === "users" && <UsersList isAr={isAr} />}
          {kind === "invites" && <InvitesList isAr={isAr} />}
        </div>
        <div className="mt-6 border-t pt-4">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={t.href}>
              <ExternalLink className="size-4" />
              {isAr ? "فتح الصفحة الكاملة" : "Open full page"}
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({ isAr, kind }: { isAr: boolean; kind: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
      <CheckCircle2 className="mx-auto mb-2 size-6 text-emerald-500" />
      {isAr ? `لا توجد ${kind}` : `No ${kind}`}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// ============ Subscription requests ============
function SubsList({ isAr }: { isAr: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["decision", "subs"],
    queryFn: () => listSubscriptionRequests({ data: { status: "pending" } }),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [months, setMonths] = useState("1");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  const mut = useMutation({
    mutationFn: (v: any) => reviewSubscriptionRequest({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["decision", "subs"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setOpenId(null);
      setMode(null);
      setReason("");
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const items = data?.items ?? [];
  if (isLoading) return <Loading />;
  if (items.length === 0) return <EmptyState isAr={isAr} kind={isAr ? "طلبات معلّقة" : "pending requests"} />;

  return (
    <ul className="space-y-3">
      {items.map((it: any) => {
        const isOpen = openId === it.id;
        return (
          <li key={it.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="truncate text-sm font-semibold">
                    {it.organizations?.name ?? it.org_id.slice(0, 8)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {isAr ? "الباقة" : "Plan"}: {it.packages?.name ?? it.packages?.code ?? "—"} ·{" "}
                  {new Date(it.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                </div>
              </div>
              {!isOpen && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => { setOpenId(it.id); setMode("approve"); }}>
                    <CheckCircle2 className="size-3" /> {isAr ? "قبول" : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOpenId(it.id); setMode("reject"); }}>
                    <XCircle className="size-3" /> {isAr ? "رفض" : "Reject"}
                  </Button>
                </div>
              )}
            </div>

            {isOpen && mode === "approve" && (
              <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground">{isAr ? "الدورة" : "Cycle"}</label>
                    <Select value={cycle} onValueChange={(v) => setCycle(v as any)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem>
                        <SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">{isAr ? "المدة (شهر)" : "Duration (months)"}</label>
                    <Input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpenId(null); setMode(null); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" className="h-7 text-xs" disabled={mut.isPending} onClick={() => mut.mutate({ id: it.id, decision: "approve", billing_cycle: cycle, months: Number(months) })}>
                    {mut.isPending && <Loader2 className="size-3 animate-spin" />}
                    {isAr ? "تفعيل" : "Activate"}
                  </Button>
                </div>
              </div>
            )}

            {isOpen && mode === "reject" && (
              <div className="mt-3 space-y-2 rounded-lg bg-destructive/5 p-3">
                <label className="text-[11px] text-muted-foreground">{isAr ? "سبب الرفض" : "Rejection reason"}</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="text-xs" placeholder={isAr ? "اكتب السبب الذي سيظهر للعميل" : "Reason shown to the customer"} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpenId(null); setMode(null); setReason(""); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={mut.isPending || !reason.trim()} onClick={() => mut.mutate({ id: it.id, decision: "reject", reason })}>
                    {mut.isPending && <Loader2 className="size-3 animate-spin" />}
                    {isAr ? "تأكيد الرفض" : "Confirm reject"}
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ============ Receipts ============
function ReceiptsList({ isAr }: { isAr: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["decision", "receipts"],
    queryFn: () => listPendingSubscriptionPayments({ data: { status: "pending" } }),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  const mut = useMutation({
    mutationFn: (v: any) => reviewSubscriptionPayment({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["decision", "receipts"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setOpenId(null); setMode(null); setReason(""); setNote("");
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  async function viewReceipt(path: string) {
    try {
      const { url } = await signReceiptUrl({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    }
  }

  const items = data?.items ?? [];
  if (isLoading) return <Loading />;
  if (items.length === 0) return <EmptyState isAr={isAr} kind={isAr ? "إيصالات معلّقة" : "pending receipts"} />;

  return (
    <ul className="space-y-3">
      {items.map((it: any) => {
        const isOpen = openId === it.id;
        return (
          <li key={it.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-amber-500" />
                  <span className="truncate text-sm font-semibold">
                    {it.organizations?.name ?? it.org_id?.slice(0, 8)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <div><span className="text-foreground/70">{isAr ? "المبلغ" : "Amount"}:</span> {Number(it.amount).toLocaleString()} {it.currency}</div>
                  <div><span className="text-foreground/70">{isAr ? "البنك" : "Bank"}:</span> {it.bank_name ?? "—"}</div>
                  <div><span className="text-foreground/70">{isAr ? "المرجع" : "Ref"}:</span> {it.bank_reference ?? "—"}</div>
                  <div><span className="text-foreground/70">{isAr ? "التاريخ" : "Date"}:</span> {it.transferred_at ? new Date(it.transferred_at).toLocaleDateString(isAr ? "ar-SA" : "en-US") : "—"}</div>
                  <div className="col-span-2"><span className="text-foreground/70">{isAr ? "الباقة" : "Plan"}:</span> {it.packages?.name ?? "—"}</div>
                </div>
                {it.receipt_url && (
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => viewReceipt(it.receipt_url)}>
                    <FileText className="size-3" /> {isAr ? "عرض الإيصال" : "View receipt"}
                  </Button>
                )}
              </div>
              {!isOpen && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => { setOpenId(it.id); setMode("approve"); }}>
                    <CheckCircle2 className="size-3" /> {isAr ? "اعتماد" : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOpenId(it.id); setMode("reject"); }}>
                    <XCircle className="size-3" /> {isAr ? "رفض" : "Reject"}
                  </Button>
                </div>
              )}
            </div>

            {isOpen && mode === "approve" && (
              <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
                <label className="text-[11px] text-muted-foreground">{isAr ? "ملاحظة داخلية (اختياري)" : "Internal note (optional)"}</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs" maxLength={500} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpenId(null); setMode(null); setNote(""); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" className="h-7 text-xs" disabled={mut.isPending} onClick={() => mut.mutate({ id: it.id, decision: "approve", note })}>
                    {mut.isPending && <Loader2 className="size-3 animate-spin" />}
                    {isAr ? "اعتماد" : "Approve"}
                  </Button>
                </div>
              </div>
            )}

            {isOpen && mode === "reject" && (
              <div className="mt-3 space-y-2 rounded-lg bg-destructive/5 p-3">
                <label className="text-[11px] text-muted-foreground">{isAr ? "سبب الرفض" : "Rejection reason"}</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="text-xs" placeholder={isAr ? "سبب سيظهر للعميل" : "Reason shown to the customer"} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpenId(null); setMode(null); setReason(""); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={mut.isPending || !reason.trim()} onClick={() => mut.mutate({ id: it.id, decision: "reject", reason })}>
                    {mut.isPending && <Loader2 className="size-3 animate-spin" />}
                    {isAr ? "تأكيد الرفض" : "Confirm reject"}
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ============ Users ============
function UsersList({ isAr }: { isAr: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["decision", "users"],
    queryFn: () => listUsersForApproval(),
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [days, setDays] = useState("7");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  const approveM = useMutation({
    mutationFn: (v: any) => approveUserTrial({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم تفعيل الحساب" : "Account approved");
      qc.invalidateQueries({ queryKey: ["decision", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setOpenId(null); setMode(null);
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });
  const rejectM = useMutation({
    mutationFn: (v: any) => rejectUserAccount({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم رفض الحساب" : "Account rejected");
      qc.invalidateQueries({ queryKey: ["decision", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      setOpenId(null); setMode(null);
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const pending = (data ?? []).filter((u: any) => u.approval_status === "pending");
  if (isLoading) return <Loading />;
  if (pending.length === 0) return <EmptyState isAr={isAr} kind={isAr ? "حسابات معلّقة" : "pending accounts"} />;

  return (
    <ul className="space-y-3">
      {pending.map((u: any) => {
        const isOpen = openId === u.id;
        return (
          <li key={u.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <UserIcon className="size-4 text-sky-500" />
                  <span className="truncate text-sm font-semibold">{u.full_name || (isAr ? "بدون اسم" : "No name")}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Mail className="size-3" />{u.email || "—"}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="size-3" />{new Date(u.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                </div>
              </div>
              {!isOpen && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => { setOpenId(u.id); setMode("approve"); }}>
                    <CheckCircle2 className="size-3" /> {isAr ? "اعتماد" : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOpenId(u.id); setMode("reject"); }}>
                    <XCircle className="size-3" /> {isAr ? "رفض" : "Reject"}
                  </Button>
                </div>
              )}
            </div>

            {isOpen && mode === "approve" && (
              <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
                <label className="text-[11px] text-muted-foreground">{isAr ? "مدة التجربة (يوم)" : "Trial days"}</label>
                <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="h-8 text-xs" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpenId(null); setMode(null); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" className="h-7 text-xs" disabled={approveM.isPending} onClick={() => approveM.mutate({ userId: u.id, days: Number(days) })}>
                    {approveM.isPending && <Loader2 className="size-3 animate-spin" />}
                    {isAr ? "تفعيل التجربة" : "Approve trial"}
                  </Button>
                </div>
              </div>
            )}

            {isOpen && mode === "reject" && (
              <div className="mt-3 space-y-2 rounded-lg bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">{isAr ? "سيتم رفض الحساب ومنعه من الدخول." : "The account will be rejected and blocked from signing in."}</p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpenId(null); setMode(null); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={rejectM.isPending} onClick={() => rejectM.mutate({ userId: u.id })}>
                    {rejectM.isPending && <Loader2 className="size-3 animate-spin" />}
                    {isAr ? "تأكيد الرفض" : "Confirm reject"}
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ============ Invitations ============
function InvitesList({ isAr }: { isAr: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["decision", "invites"],
    queryFn: () => listAllPendingPortalInvitations(),
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => superAdminRevokePortalInvitation({ data: { id } }),
    onSuccess: () => {
      toast.success(isAr ? "تم إلغاء الدعوة" : "Invitation revoked");
      qc.invalidateQueries({ queryKey: ["decision", "invites"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const items = data?.items ?? [];
  if (isLoading) return <Loading />;
  if (items.length === 0) return <EmptyState isAr={isAr} kind={isAr ? "دعوات نشطة" : "active invitations"} />;

  return (
    <ul className="space-y-3">
      {items.map((it: any) => (
        <li key={it.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-emerald-500" />
              <span className="truncate text-sm font-semibold">{it.email}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <div><span className="text-foreground/70">{isAr ? "النوع" : "Kind"}:</span> {it.kind === "tenant" ? (isAr ? "مستأجر" : "Tenant") : (isAr ? "مالك" : "Owner")}</div>
              <div><span className="text-foreground/70">{isAr ? "المنشأة" : "Org"}:</span> {it.organizations?.name ?? it.org_id?.slice(0, 8)}</div>
              <div><span className="text-foreground/70">{isAr ? "أُنشئت" : "Created"}:</span> {new Date(it.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</div>
              <div><span className="text-foreground/70">{isAr ? "تنتهي" : "Expires"}:</span> {new Date(it.expires_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</div>
            </div>
          </div>
          <Button size="sm" variant="destructive" className="h-7 shrink-0 text-xs" disabled={revokeM.isPending} onClick={() => revokeM.mutate(it.id)}>
            {revokeM.isPending ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
            {isAr ? "إلغاء" : "Revoke"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

// Silence lint for unused imports if needed
export const __icons = { CreditCard, Receipt, UserIcon, Bell };