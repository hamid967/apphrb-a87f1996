import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listTenantPayments } from "@/lib/portal-payments.functions";
import { portalHead } from "@/lib/portal-og-head";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/portal/tenant/payments")({
  head: () =>
    portalHead({
      titleAr: "مدفوعاتي",
      titleEn: "My Payments",
      descAr: "سجل المدفوعات والإيصالات للمستأجر.",
      path: "/portal/tenant/payments",
    }),
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-lg p-6 text-center">
      <AlertCircle className="mx-auto mb-2 size-8 text-destructive" />
      <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={() => reset()}>
        {i18n.t("accessDenied.retry")}
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6">{i18n.t("accessDenied.notFound")}</div>
  ),
  component: TenantPaymentsPage,
});

type Payment = {
  id: string;
  amount: number;
  currency_code: string | null;
  paid_at: string;
  status: string;
  reference: string | null;
  notes: string | null;
  contracts: { contract_number: string } | null;
};

function TenantPaymentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listTenantPayments);
  const q = useQuery({
    queryKey: ["portal", "tenant", "payments"],
    queryFn: () => listFn() as Promise<Payment[]>,
  });

  const items = q.data ?? [];
  const paidTotal = items
    .filter((p) => p.status === "verified" || p.status === "paid")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingTotal = items
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const currency = items[0]?.currency_code ?? "SAR";

  const statusLabel = (status: string) => {
    const key = `tenantPortal.payments.status.${status}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("tenantPortal.payments.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("tenantPortal.payments.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {t("tenantPortal.payments.totalPaid")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {paidTotal.toLocaleString()} {currency}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {t("tenantPortal.payments.pendingReview")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {pendingTotal.toLocaleString()} {currency}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" />
            {t("tenantPortal.payments.history")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("tenantPortal.payments.empty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tenantPortal.payments.cols.date")}</TableHead>
                    <TableHead>{t("tenantPortal.payments.cols.contract")}</TableHead>
                    <TableHead>{t("tenantPortal.payments.cols.amount")}</TableHead>
                    <TableHead>{t("tenantPortal.payments.cols.reference")}</TableHead>
                    <TableHead>{t("tenantPortal.payments.cols.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {new Date(p.paid_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.contracts?.contract_number ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {Number(p.amount).toLocaleString()} {p.currency_code ?? "SAR"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === "verified" || p.status === "paid"
                              ? "default"
                              : p.status === "pending"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {statusLabel(p.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
