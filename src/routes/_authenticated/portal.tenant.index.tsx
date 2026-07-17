import { t } from "@/lib/i18n";
import { useTranslation } from "react-i18next";
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
  head: () =>
    portalHead({
      titleAr: "محطة المستأجر",
      titleEn: "Tenant Home",
      descAr: "نظرة عامة على عقدك ومدفوعاتك.",
      path: "/portal/tenant",
    }),
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

// Translate an arbitrary enum-like status string via the shared status map.
// Unknown values are returned verbatim so we never surface a missing-key marker.
function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const key = `tenantHome.statuses.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function TenantPortalPage() {
  const { i18n } = useTranslation();
  const localeTag = (i18n.language || "ar").startsWith("ar") ? "ar" : "en";
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
          {t("tenantHome.greeting", {
            name: data.tenant?.full_name ?? data.profile?.full_name ?? "",
          })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("tenantHome.subtitle")}</p>
      </header>

      {!data.tenant && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("tenantHome.notLinked")}
          </CardContent>
        </Card>
      )}

      {data.tenant && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("tenantHome.stats.activeContracts")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.contracts.filter((c) => c.status === "active").length}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("tenantHome.stats.duePayments")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{pending.length}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("tenantHome.stats.totalDue")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalDue.toLocaleString(localeTag)} {currency}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> {t("tenantHome.contracts.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.contracts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("tenantHome.contracts.empty")}</p>
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
                      {Number(c.amount).toLocaleString(localeTag)} {c.currency_code}
                    </span>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {statusLabel(c.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="size-4" /> {t("tenantHome.charges.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.charges.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("tenantHome.charges.empty")}</p>
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
                    <div className="text-xs text-muted-foreground">
                      {t("tenantHome.charges.dueLabel", { date: r.due_date })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">
                      {Number(r.amount).toLocaleString(localeTag)} {r.currency}
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
                      {statusLabel(r.status)}
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
                <Wallet className="size-4" /> {t("tenantHome.reports.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!myPayments || myPayments.length === 0) && (
                <p className="text-sm text-muted-foreground">{t("tenantHome.reports.empty")}</p>
              )}
              {(myPayments ?? []).map((p) => {
                const contract = p.contracts as { contract_number: string | null } | null;
                return (
                  <div
                    key={String(p.id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium">{contract?.contract_number ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(p.paid_at).slice(0, 10)}
                        {p.reference
                          ? t("tenantHome.reports.referenceInline", { ref: p.reference })
                          : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {Number(p.amount).toLocaleString(localeTag)} {p.currency_code}
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
                          ? t("tenantHome.reports.statuses.completed")
                          : p.status === "failed"
                            ? t("tenantHome.reports.statuses.failed")
                            : t("tenantHome.reports.statuses.pending")}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="text-center">
            <Button asChild variant="link">
              <Link to="/dashboard">{t("tenantHome.backHome")}</Link>
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
  useTranslation(); // subscribe to language changes
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
      toast.success(t("tenantHome.pay.success"));
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
          <CheckCircle2 className="me-1 size-4" /> {t("tenantHome.pay.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tenantHome.pay.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t("tenantHome.pay.amount", { currency })}</Label>
            <Input
              type="number"
              min={1}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("tenantHome.pay.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">
                  {t("tenantHome.pay.methods.bank_transfer")}
                </SelectItem>
                <SelectItem value="cash">{t("tenantHome.pay.methods.cash")}</SelectItem>
                <SelectItem value="cheque">{t("tenantHome.pay.methods.cheque")}</SelectItem>
                <SelectItem value="card">{t("tenantHome.pay.methods.card")}</SelectItem>
                <SelectItem value="other">{t("tenantHome.pay.methods.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("tenantHome.pay.paidAt")}</Label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("tenantHome.pay.reference")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("tenantHome.pay.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("tenantHome.pay.cancel")}
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? t("tenantHome.pay.submitting") : t("tenantHome.pay.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
