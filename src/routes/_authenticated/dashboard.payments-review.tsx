import { t } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  listPendingPayments,
  reviewSubmittedPayment,
} from "@/lib/portal-payments.functions";
import { CheckCircle2, XCircle, ReceiptText } from "lucide-react";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/payments-review")({
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm text-destructive">
      {error.message}{" "}
      <Button size="sm" variant="outline" onClick={() => reset()}>{t("common.retry")}</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
  head: () => sectionHead({ section: "dashboard", entityAr: "مراجعة المدفوعات", entityEn: "Payments Review", path: "/dashboard/payments-review" }),
  component: PaymentsReviewPage,
});

function PaymentsReviewPage() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const fetchPending = useServerFn(listPendingPayments);
  const review = useServerFn(reviewSubmittedPayment);
  const [reason, setReason] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["payments-pending", org?.id],
    queryFn: () => fetchPending({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const m = useMutation({
    mutationFn: (v: { payment_id: string; decision: "approve" | "reject"; reason?: string }) =>
      review({ data: { payment_id: v.payment_id, decision: v.decision, reason: v.reason ?? null } }),
    onSuccess: (r) => {
      toast.success(r.status === "completed" ? "تم اعتماد الدفعة" : "تم رفض الدفعة");
      qc.invalidateQueries({ queryKey: ["payments-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ReceiptText className="size-6" /> مراجعة إبلاغات السداد
        </h1>
        <p className="text-sm text-muted-foreground">
          الدفعات التي أرسلها المستأجرون بانتظار التحقق قبل اعتمادها في السجل.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قيد المراجعة ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!q.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد دفعات قيد المراجعة.</p>
          )}
          {rows.map((p) => {
            const contract = p.contracts as { contract_number: string | null } | null;
            const tenant = p.tenants as { full_name: string | null } | null;
            const id = String(p.id);
            return (
              <div key={id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {contract?.contract_number ?? "—"} — {tenant?.full_name ?? ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      تاريخ السداد: {String(p.paid_at).slice(0, 10)}
                      {p.reference ? ` · مرجع: ${p.reference}` : ""}
                    </div>
                    {p.notes && (
                      <div className="text-xs text-muted-foreground">ملاحظات: {String(p.notes)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium">
                      {Number(p.amount).toLocaleString("ar")} {p.currency_code}
                    </span>
                    <Badge variant="secondary">قيد المراجعة</Badge>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                  <Textarea
                    placeholder="سبب الرفض (اختياري)"
                    value={reason[id] ?? ""}
                    onChange={(e) => setReason((s) => ({ ...s, [id]: e.target.value }))}
                    rows={2}
                  />
                  <Button
                    size="sm"
                    onClick={() => m.mutate({ payment_id: id, decision: "approve" })}
                    disabled={m.isPending}
                  >
                    <CheckCircle2 className="me-1 size-4" /> اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      m.mutate({ payment_id: id, decision: "reject", reason: reason[id] })
                    }
                    disabled={m.isPending}
                  >
                    <XCircle className="me-1 size-4" /> رفض
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}