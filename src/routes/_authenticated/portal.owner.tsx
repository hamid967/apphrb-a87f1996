import { t } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOwnerPortal } from "@/lib/portal-owner.functions";
import { listOwnerPayments } from "@/lib/portal-payments.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileBarChart2, FileText, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/portal/owner")({
  head: () => portalHead({ titleAr: 'محطة المالك', titleEn: 'Owner Portal', descAr: 'كشوفات، إيرادات، ووحداتك العقارية.', path: '/portal/owner' }),
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-lg p-6 text-center">
      <AlertCircle className="mx-auto mb-2 size-8 text-destructive" />
      <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={() => reset()}>{t("common.retry")}</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
  component: OwnerPortalPage,
});

function OwnerPortalPage() {
  const fetchOwner = useServerFn(getOwnerPortal);
  const fetchPayments = useServerFn(listOwnerPayments);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "owner"],
    queryFn: () => fetchOwner(),
  });
  const { data: payments } = useQuery({
    queryKey: ["portal", "owner", "payments"],
    queryFn: () => fetchPayments(),
  });
  if (isLoading || !data)
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  const totalNet = data.statements.reduce((s, x) => s + Number(x.net_payout ?? 0), 0);
  const currency = (data.statements[0]?.currency as string) ?? "SAR";
  const activeCount = data.contracts.filter((c) => c.status === "active").length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          مرحبًا {data.owner?.full_name ?? data.profile?.full_name ?? ""}
        </h1>
        <p className="text-sm text-muted-foreground">بوابة المالك — عقاراتك وكشوف الحسابات.</p>
      </header>

      {!data.owner && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            لم يتم ربط حسابك بمالك بعد. تواصل مع الشركة لإتمام الربط.
          </CardContent>
        </Card>
      )}

      {data.owner && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">عقود نشطة</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{activeCount}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">كشوف الحسابات</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{data.statements.length}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">إجمالي الصافي</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {totalNet.toLocaleString("ar")} {currency}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileBarChart2 className="size-4" /> كشوف الحسابات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.statements.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد كشوف بعد.</p>
              )}
              {data.statements.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {s.period_start} — {s.period_end}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      دخل: {Number(s.gross_income ?? 0).toLocaleString("ar")} · مصروفات:{" "}
                      {Number(s.expenses_total ?? 0).toLocaleString("ar")} · رسوم:{" "}
                      {Number(s.management_fee ?? 0).toLocaleString("ar")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium">
                      {Number(s.net_payout ?? 0).toLocaleString("ar")} {s.currency}
                    </span>
                    <Badge variant={s.status === "issued" ? "default" : "secondary"}>
                      {s.status}
                    </Badge>
                    {s.pdf_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={s.pdf_url} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="size-4" /> دفعات مستلمة على عقاراتي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!payments || payments.length === 0) && (
                <p className="text-sm text-muted-foreground">لا توجد دفعات مسجلة.</p>
              )}
              {(payments ?? []).map((p) => {
                const contract = p.contracts as { contract_number: string | null } | null;
                const tenant = p.tenants as { full_name: string | null } | null;
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
                        {tenant?.full_name ?? ""} · {String(p.paid_at).slice(0, 10)}
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
