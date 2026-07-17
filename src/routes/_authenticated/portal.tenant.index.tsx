import { t } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getTenantPortal } from "@/lib/portal-tenant.functions";
import {
  submitTenantPayment,
  listTenantPayments,
} from "@/lib/portal-payments.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, FileText, Receipt, Wallet, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/portal/tenant/")({
  head: () => portalHead({ titleAr: 'محطة المستأجر', titleEn: 'Tenant Home', descAr: 'نظرة عامة على عقدك ومدفوعاتك.', path: '/portal/tenant' }),
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-lg p-6 text-center">
      <AlertCircle className="mx-auto mb-2 size-8 text-destructive" />
      <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={() => reset()}>{t("common.retry")}</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
  component: TenantPortalPage,
});

function TenantPortalPage() {
  const fetchTenant = useServerFn(getTenantPortal);
  const fetchTenantPayments = useServerFn(listTenantPayments);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "tenant"],
    queryFn: () => fetchTenant(),
  });
  const { data: myPayments } = useQuery({
    queryKey: ["portal", "tenant", "payments"],
    queryFn: () => fetchTenantPayments(),
  });
  if (isLoading || !data)
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  const currency = (data.charges[0]?.currency as string) ?? "SAR";
  const pending = data.charges.filter((c) => c.status !== "paid");
  const totalDue = pending.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const invalidatePortal = () => {
    qc.invalidateQueries({ queryKey: ["portal", "tenant"] });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          مرحبًا {data.tenant?.full_name ?? data.profile?.full_name ?? ""}
        </h1>
        <p className="text-sm text-muted-foreground">هذه بوابتك كمستأجر — عقودك ودفعاتك.</p>
      </header>

      {!data.tenant && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            لم يتم ربط حسابك بمستأجر بعد. تواصل مع الشركة لإتمام الربط.
          </CardContent>
        </Card>
      )}

      {data.tenant && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">العقود النشطة</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.contracts.filter((c) => c.status === "active").length}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">دفعات مستحقة</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{pending.length}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">إجمالي المستحق</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalDue.toLocaleString("ar")} {currency}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> عقودي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.contracts.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد عقود.</p>
              )}
              {data.contracts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">{c.contract_number ?? c.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.start_date} → {c.end_date}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">
                      {Number(c.amount).toLocaleString("ar")} {c.currency_code}
                    </span>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="size-4" /> الدفعات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.charges.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد دفعات.</p>
              )}
              {data.charges.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {r.period_start} — {r.period_end}
                    </div>
                    <div className="text-xs text-muted-foreground">استحقاق: {r.due_date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">
                      {Number(r.amount).toLocaleString("ar")} {r.currency}
                    </span>
                    <Badge
                      variant={
                        r.status === "paid"
                          ? "default"
                          : r.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                    {r.status !== "paid" && (
                      <PayDialog
                        chargeId={r.id as string}
                        amount={Number(r.amount)}
                        currency={(r.currency as string) ?? "SAR"}
                        onDone={invalidatePortal}
                      />
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-4" /> إبلاغاتي عن السداد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!myPayments || myPayments.length === 0) && (
                <p className="text-sm text-muted-foreground">لم تُبلّغ عن أي دفعة بعد.</p>
              )}
              {(myPayments ?? []).map((p) => {
                const contract = p.contracts as { contract_number: string | null } | null;
                return (
                  <div
                    key={String(p.id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {contract?.contract_number ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {String(p.paid_at).slice(0, 10)}
                        {p.reference ? ` · مرجع: ${p.reference}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {Number(p.amount).toLocaleString("ar")} {p.currency_code}
                      </span>
                      <Badge
                        variant={
                          p.status === "completed"
                            ? "default"
                            : p.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {p.status === "completed"
                          ? "معتمد"
                          : p.status === "failed"
                            ? "مرفوض"
                            : "قيد المراجعة"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="text-center">
            <Button asChild variant="link">
              <Link to="/dashboard">العودة للرئيسية</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PayDialog({
  chargeId,
  amount,
  currency,
  onDone,
}: {
  chargeId: string;
  amount: number;
  currency: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<string>(String(amount));
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "cheque" | "card" | "other">(
    "bank_transfer",
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const submit = useServerFn(submitTenantPayment);
  const m = useMutation({
    mutationFn: () =>
      submit({
        data: {
          charge_id: chargeId,
          amount: Number(payAmount),
          paid_at: new Date(paidAt).toISOString(),
          reference: reference || null,
          method,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال إبلاغ السداد. سيتم التحقق من الشركة.");
      qc.invalidateQueries({ queryKey: ["portal", "tenant", "payments"] });
      onDone();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="me-1 size-4" /> إبلاغ عن السداد
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إبلاغ عن سداد دفعة</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>المبلغ ({currency})</Label>
            <Input
              type="number"
              min={1}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                <SelectItem value="cash">نقدًا</SelectItem>
                <SelectItem value="cheque">شيك</SelectItem>
                <SelectItem value="card">بطاقة</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>تاريخ السداد</Label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>مرجع الحوالة / الشيك</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? "جارٍ الإرسال…" : "إرسال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
