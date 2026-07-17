import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listOwnerContracts } from "@/lib/owners.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/owners/contracts")({
  component: OwnerContractsPage,
});

function fmt(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "active":
      return "default";
    case "ended":
    case "cancelled":
    case "terminated":
      return "destructive";
    case "draft":
    case "pending":
      return "outline";
    default:
      return "secondary";
  }
}

function OwnerContractsPage() {
  const { t } = useTranslation();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id as string | undefined;
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const contractsQ = useQuery({
    queryKey: ["owner-contracts", orgId, status],
    queryFn: () => listOwnerContracts({ data: { orgId: orgId!, status } }),
    enabled: !!orgId,
  });

  const filtered = useMemo(() => {
    const list = (contractsQ.data ?? []) as any[];
    if (!q) return list;
    const n = q.toLowerCase();
    return list.filter((c) =>
      `${c.contract_number ?? ""} ${c.owner?.full_name ?? ""} ${c.tenant?.full_name ?? ""} ${c.unit?.code ?? ""} ${c.building?.name ?? ""}`
        .toLowerCase()
        .includes(n),
    );
  }, [contractsQ.data, q]);

  const activeCount = ((contractsQ.data ?? []) as any[]).filter(
    (c) => c.status === "active",
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="size-6" /> {t("contracts.ownerTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("contracts.ownerSub")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("contracts.filterStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("contracts.filterAllStatuses")}</SelectItem>
              <SelectItem value="active">{t("contracts.statusActive")}</SelectItem>
              <SelectItem value="draft">{t("contracts.statusDraft")}</SelectItem>
              <SelectItem value="pending">{t("contracts.statusPending")}</SelectItem>
              <SelectItem value="ended">{t("contracts.statusEnded")}</SelectItem>
              <SelectItem value="cancelled">{t("contracts.statusCancelled")}</SelectItem>
              <SelectItem value="terminated">{t("contracts.statusTerminated")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("contracts.searchShort")}
            className="max-w-xs"
          />
        </div>
      </div>

      {contractsQ.isLoading ? (
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("contracts.countSummary", { total: filtered.length })} ·{" "}
              <span className="text-primary">
                {t("contracts.countActive", { n: activeCount })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">{t("contracts.colNo")}</th>
                    <th className="p-3 text-start">{t("contracts.colStatus")}</th>
                    <th className="p-3 text-start">{t("contracts.colOwner")}</th>
                    <th className="p-3 text-start">{t("contracts.colTenant")}</th>
                    <th className="p-3 text-start">{t("contracts.colUnit")}</th>
                    <th className="p-3 text-start">{t("contracts.colPeriod")}</th>
                    <th className="p-3 text-start">{t("contracts.colAmount")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c: any) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link
                          to="/dashboard/contracts/$id"
                          params={{ id: c.id }}
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          {c.contract_number ?? c.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="p-3">
                        {c.owner ? (
                          <Link
                            to="/owners/$id"
                            params={{ id: c.owner.id }}
                            className="text-primary hover:underline"
                          >
                            {c.owner.full_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">{c.tenant?.full_name ?? "—"}</td>
                      <td className="p-3">
                        {c.unit ? (
                          <div>
                            <div className="font-medium">{c.unit.code}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.building?.name ?? ""}
                              {c.unit.type ? ` · ${c.unit.type}` : ""}
                              {c.unit.bedrooms ? ` · ${c.unit.bedrooms}BR` : ""}
                              {c.unit.area ? ` · ${c.unit.area}m²` : ""}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        <div>{c.start_date ?? "—"}</div>
                        <div className="text-muted-foreground">→ {c.end_date ?? "—"}</div>
                      </td>
                      <td className="p-3">
                        {fmt(c.amount)}{" "}
                        <span className="text-xs text-muted-foreground">
                          {c.currency_code ?? "SAR"} /{" "}
                          {c.payment_frequency ?? t("contracts.freqMonthly")}
                        </span>
                      </td>
                      <td className="p-3 text-end">
                        {c.owner && (
                          <Link
                            to="/owners/$id"
                            params={{ id: c.owner.id }}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {t("contracts.statement")} <ExternalLink className="size-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {t("contracts.noMatch")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
