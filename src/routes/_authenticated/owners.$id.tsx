import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getOwnerStatement } from "@/lib/owners.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Printer,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Receipt,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/owners/$id")({
  head: ({ params }) => detailHead({ entityAr: 'مالك', entityEn: 'Owner', id: String(params.id), path: `/owners/${params.id}`, kind: 'dashboard' }),
  component: OwnerStatementPage,
});

function fmt(n: number, cur = "SAR") {
  return `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`;
}

function firstOfMonthISO() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 5, 1)).toISOString().slice(0, 10);
}
function endOfMonthISO() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function OwnerStatementPage() {
  const { id } = Route.useParams();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id as string | undefined;

  const [from, setFrom] = useState<string>(firstOfMonthISO());
  const [to, setTo] = useState<string>(endOfMonthISO());
  const [feePct, setFeePct] = useState<number>(5);

  const stmtQ = useQuery({
    queryKey: ["owner-statement", orgId, id, from, to, feePct],
    queryFn: () =>
      getOwnerStatement({
        data: { orgId: orgId!, ownerId: id, from, to, managementFeePct: feePct },
      }),
    enabled: !!orgId,
  });

  const data = stmtQ.data;

  const csv = useMemo(() => {
    if (!data) return "";
    const head = [
      "Contract",
      "Unit",
      "Tenant",
      "Status",
      "Start",
      "End",
      "Months",
      "Per month",
      "Expected",
      "Collected",
      "Outstanding",
    ].join(",");
    const lines = data.rows.map((r: any) =>
      [
        r.contract_number,
        r.unit?.code ?? "",
        r.tenant?.full_name ?? "",
        r.status,
        r.start_date,
        r.end_date,
        r.months_in_range,
        r.per_month,
        r.expected,
        r.collected,
        r.outstanding,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    return [head, ...lines].join("\n");
  }, [data]);

  const download = () => {
    if (!data) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${data.owner.full_name.replace(/\s+/g, "_")}-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/owners"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to owners
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="me-1 size-4" /> Print
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/owners/$id/ledger" params={{ id }}>
              <Receipt className="me-1 size-4" /> Ledger
            </Link>
          </Button>
          <Button size="sm" onClick={download} disabled={!data}>
            <Download className="me-1 size-4" /> CSV
          </Button>
        </div>
      </div>

      {stmtQ.isLoading ? (
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-muted-foreground">No data.</div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">{data.owner.full_name}</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">
                  {data.owner.email ?? "—"} · {data.owner.phone ?? "—"}
                  {null}
                </div>
              </div>
              <Badge variant="outline">
                <FileText className="me-1 size-3.5" /> Owner Statement
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4 print:hidden">
                <div>
                  <Label>From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div>
                  <Label>Management fee %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={feePct}
                    onChange={(e) => setFeePct(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-end text-xs text-muted-foreground">
                  Period:{" "}
                  <span className="ms-1 font-medium text-foreground">
                    {from} → {to}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Kpi
              label="Expected"
              value={fmt(data.totals.expected, data.currency)}
              icon={<TrendingUp className="size-4" />}
            />
            <Kpi
              label="Collected"
              value={fmt(data.totals.collected, data.currency)}
              icon={<Wallet className="size-4" />}
              tone="pos"
            />
            <Kpi
              label="Outstanding"
              value={fmt(data.totals.outstanding, data.currency)}
              icon={<AlertTriangle className="size-4" />}
              tone="warn"
            />
            <Kpi
              label={`Net payout (fee ${data.totals.managementFeePct}%)`}
              value={fmt(data.totals.netPayout, data.currency)}
              tone="pos"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Contracts in period</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start">Contract</th>
                      <th className="p-3 text-start">Unit</th>
                      <th className="p-3 text-start">Tenant</th>
                      <th className="p-3 text-start">Status</th>
                      <th className="p-3 text-end">Months</th>
                      <th className="p-3 text-end">Per month</th>
                      <th className="p-3 text-end">Expected</th>
                      <th className="p-3 text-end">Collected</th>
                      <th className="p-3 text-end">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.rows.map((r: any) => (
                      <tr key={r.contract_id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.contract_number}</td>
                        <td className="p-3">{r.unit?.code ?? "—"}</td>
                        <td className="p-3">{r.tenant?.full_name ?? "—"}</td>
                        <td className="p-3">
                          <Badge variant={r.status === "active" ? "default" : "secondary"}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-end tabular-nums">{r.months_in_range}</td>
                        <td className="p-3 text-end tabular-nums">
                          {fmt(r.per_month, r.currency)}
                        </td>
                        <td className="p-3 text-end tabular-nums">{fmt(r.expected, r.currency)}</td>
                        <td className="p-3 text-end tabular-nums text-success">
                          {fmt(r.collected, r.currency)}
                        </td>
                        <td className="p-3 text-end tabular-nums text-warning">
                          {fmt(r.outstanding, r.currency)}
                        </td>
                      </tr>
                    ))}
                    {!data.rows.length && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">
                          No contracts for this owner.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {data.rows.length > 0 && (
                    <tfoot className="border-t bg-muted/20 font-medium">
                      <tr>
                        <td className="p-3" colSpan={6}>
                          Totals
                        </td>
                        <td className="p-3 text-end tabular-nums">
                          {fmt(data.totals.expected, data.currency)}
                        </td>
                        <td className="p-3 text-end tabular-nums text-success">
                          {fmt(data.totals.collected, data.currency)}
                        </td>
                        <td className="p-3 text-end tabular-nums text-warning">
                          {fmt(data.totals.outstanding, data.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payouts summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-4">
                <dt className="text-muted-foreground">Collected</dt>
                <dd className="tabular-nums">{fmt(data.totals.collected, data.currency)}</dd>
                <dt className="text-muted-foreground">
                  Management fee ({data.totals.managementFeePct}%)
                </dt>
                <dd className="tabular-nums text-destructive">
                  − {fmt(data.totals.managementFee, data.currency)}
                </dd>
                <dt className="text-muted-foreground font-semibold">Net payout to owner</dt>
                <dd className="tabular-nums font-semibold text-success">
                  {fmt(data.totals.netPayout, data.currency)}
                </dd>
                <dt className="text-muted-foreground">Payments recorded</dt>
                <dd className="tabular-nums">{data.payments.length}</dd>
              </dl>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "pos" | "warn";
}) {
  const cls =
    tone === "pos" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
