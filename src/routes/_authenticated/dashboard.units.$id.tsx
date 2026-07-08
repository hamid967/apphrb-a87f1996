import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FilePlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUnit } from "@/lib/units.functions";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard/units/$id")({
  head: ({ params }) => detailHead({ entityAr: 'وحدة', entityEn: 'Unit', id: String(params.id), path: `/dashboard/units/${params.id}`, kind: 'listing' }),
  component: UnitDetail,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-3 size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button
          className="mt-4"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {i18n.t("units.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
      {i18n.t("units.notFound")}
    </div>
  ),
});

function UnitDetail() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["unit", id], queryFn: () => getUnit({ data: { id } }) });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">
        {t("units.loading")}
      </div>
    );
  }
  if (!q.data) return null;

  const { unit, contracts } = q.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = (unit as any).buildings;
  const property = b?.properties;
  const propTitle = isAr ? property?.title_ar : property?.title_en;
  const isVacant = unit.status === "vacant";

  const handleCreateContract = () => {
    navigate({ to: "/dashboard/contracts/new", search: { unitId: unit.id } });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <Link
          to="/dashboard/units"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("units.back")}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("units.unitLabel", { code: unit.code })}
            </h1>
            <Badge variant="outline">{unit.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {b?.name ?? "—"} · {propTitle ?? "—"} {property?.city ? `· ${property.city}` : ""}
          </p>
        </div>
        <Button
          onClick={handleCreateContract}
          disabled={!isVacant}
          title={isVacant ? "" : t("units.notVacant")}
        >
          <FilePlus className="me-2 size-4" /> {t("units.createContract")}
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("units.colType")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">{unit.type ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("units.colArea")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium tabular-nums">
            {unit.area != null ? t("units.areaSqm", { n: unit.area }) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("units.annualRent")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium tabular-nums">
            {unit.rent_amount != null
              ? `${Number(unit.rent_amount).toLocaleString(isAr ? "ar" : "en")} ${unit.currency_code ?? "SAR"}`
              : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("units.bedrooms")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium tabular-nums">
            {unit.bedrooms ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("units.bathrooms")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium tabular-nums">
            {unit.bathrooms ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("units.salePrice")}</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium tabular-nums">
            {unit.sale_price != null
              ? `${Number(unit.sale_price).toLocaleString(isAr ? "ar" : "en")} ${unit.currency_code ?? "SAR"}`
              : "—"}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("units.contracts")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("units.contractNo")}</TableHead>
                <TableHead>{t("units.colStatus")}</TableHead>
                <TableHead>{t("units.start")}</TableHead>
                <TableHead>{t("units.end")}</TableHead>
                <TableHead className="text-end">{t("units.value")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {t("units.noContracts")}
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.contract_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.start_date}</TableCell>
                    <TableCell className="text-sm">{c.end_date}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {c.amount != null
                        ? `${Number(c.amount).toLocaleString(isAr ? "ar" : "en")} ${c.currency_code ?? "SAR"}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
