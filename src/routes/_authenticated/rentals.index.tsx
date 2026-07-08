import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listRentalContracts, rentalsStats, generateMonthlyInvoice } from "@/lib/rentals.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock,
  FileText,
  Loader2,
  Wallet,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { STAFF_ROLES } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/rentals/")({
  component: () => (
    <RequireRole
      roles={STAFF_ROLES}
      title="Rentals restricted"
      description="Contracts, tenants and billing are limited to organization staff."
    >
      <RentalsDashboard />
    </RequireRole>
  ),
});

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  draft: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function daysUntil(dateStr: string) {
  const d = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(d / (1000 * 60 * 60 * 24));
}

function fmtMoney(n: number, cur = "SAR") {
  return `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`;
}

function RentalsDashboard() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id as string | undefined;

  const contractsQ = useQuery({
    queryKey: ["rentals", "contracts", orgId],
    queryFn: () => listRentalContracts({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const statsQ = useQuery({
    queryKey: ["rentals", "stats", orgId],
    queryFn: () => rentalsStats({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expiring" | "expired">("all");

  const rows = useMemo(() => {
    const list = contractsQ.data ?? [];
    return list.filter((c: any) => {
      const days = daysUntil(c.end_date);
      if (filter === "active" && c.status !== "active") return false;
      if (filter === "expiring" && !(c.status === "active" && days >= 0 && days <= 30))
        return false;
      if (filter === "expired" && days >= 0) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return String(c.contract_number || "")
        .toLowerCase()
        .includes(s);
    });
  }, [contractsQ.data, q, filter]);

  const genMut = useMutation({
    mutationFn: (contractId: string) =>
      generateMonthlyInvoice({ data: { contractId, orgId: orgId! } }),
    onSuccess: (inv: any) => {
      toast.success(`Invoice ${inv.number} created`);
      qc.invalidateQueries({ queryKey: ["rentals", "stats", orgId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to generate invoice"),
  });

  const s = statsQ.data;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Rentals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track contracts, generate invoices, monitor payment status.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<CalendarClock className="size-4" />}
          label="Active contracts"
          value={s?.contracts.active ?? 0}
          hint={`${s?.contracts.total ?? 0} total`}
        />
        <Kpi
          icon={<AlertTriangle className="size-4 text-amber-500" />}
          label="Expiring ≤30d"
          value={s?.contracts.expiring ?? 0}
          tone="amber"
        />
        <Kpi
          icon={<Wallet className="size-4 text-emerald-500" />}
          label="Collected (invoices)"
          value={fmtMoney(s?.invoices.collected ?? 0)}
          tone="emerald"
        />
        <Kpi
          icon={<FileText className="size-4 text-red-500" />}
          label="Outstanding"
          value={fmtMoney(s?.invoices.outstanding ?? 0)}
          tone="red"
        />
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base">Payment status</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["draft", "sent", "paid", "overdue", "cancelled"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-border/50 p-3">
              <div className="text-xs uppercase text-muted-foreground">{k}</div>
              <div className="text-xl font-semibold">{s?.invoices.byStatus?.[k] ?? 0}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search contract #…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1 rounded-xl border border-border/50 p-1">
          {(["all", "active", "expiring", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-md px-3 py-1.5 text-sm transition " +
                (filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
        <CardContent className="p-0">
          {contractsQ.isLoading ? (
            <div className="flex items-center justify-center p-10 text-muted-foreground">
              <Loader2 className="me-2 size-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No rental contracts.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="p-3">Contract #</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Start</th>
                    <th className="p-3">End</th>
                    <th className="p-3">Frequency</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => {
                    const days = daysUntil(c.end_date);
                    const flag =
                      days < 0 ? (
                        <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">
                          Expired
                        </Badge>
                      ) : days <= 30 ? (
                        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          {days}d left
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="me-1 size-3 inline" />
                          OK
                        </Badge>
                      );
                    return (
                      <tr key={c.id} className="border-b border-border/30 last:border-0">
                        <td className="p-3 font-medium">{c.contract_number ?? c.id.slice(0, 8)}</td>
                        <td className="p-3">
                          <Badge
                            className={STATUS_STYLES[c.status] ?? "bg-muted text-muted-foreground"}
                          >
                            {c.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{c.start_date}</td>
                        <td className="p-3">
                          {c.end_date} <span className="ms-2">{flag}</span>
                        </td>
                        <td className="p-3 text-muted-foreground">{c.payment_frequency ?? "—"}</td>
                        <td className="p-3">{fmtMoney(c.amount, c.currency_code ?? "SAR")}</td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={genMut.isPending}
                            onClick={() => genMut.mutate(c.id)}
                          >
                            {genMut.isPending && genMut.variables === c.id ? (
                              <Loader2 className="me-2 size-3 animate-spin" />
                            ) : (
                              <FileText className="me-2 size-3" />
                            )}
                            Generate invoice
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
