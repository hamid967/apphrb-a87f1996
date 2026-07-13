import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { getZatcaChainAudit, type ZatcaChainRow } from "@/lib/invoices-zatca.functions";

const auditQuery = queryOptions({
  queryKey: ["zatca-chain-audit"],
  queryFn: () => getZatcaChainAudit(),
});

export const Route = createFileRoute("/_authenticated/admin/zatca-log")({
  head: () => ({
    meta: [
      { title: "سجل تسلسل ZATCA — HBSpro" },
      { name: "description", content: "تدقيق سلاسل هاش فواتير ZATCA وعدّاداتها لكل منظمة، مع رصد أي فجوات أو انقطاعات." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(auditQuery),
  component: ZatcaLogPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      {(error as Error)?.message ?? "Error"}
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function ZatcaLogPage() {
  const { data } = useSuspenseQuery(auditQuery);
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const rowsByOrg = new Map<string, ZatcaChainRow[]>();
  for (const r of data) {
    const list = rowsByOrg.get(r.org_id) ?? [];
    list.push(r);
    rowsByOrg.set(r.org_id, list);
  }

  const total = data.length;
  const gaps = data.filter((r) => r.counter_gap).length;
  const breaks = data.filter((r) => r.hash_break).length;
  const healthy = total - gaps - breaks;

  return (
    <div className="p-4 md:p-6 space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <header className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? "سجل تسلسل ZATCA" : "ZATCA Chain Log"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "تدقيق سلاسل الهاش وعدّادات الفواتير الممهورة لكل منظمة."
              : "Audit hash chains and per-org counters for sealed invoices."}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={isAr ? "إجمالي الممهورة" : "Total sealed"} value={total} />
        <StatCard label={isAr ? "سليمة" : "Healthy"} value={healthy} tone="ok" />
        <StatCard label={isAr ? "فجوات عدّاد" : "Counter gaps"} value={gaps} tone={gaps ? "warn" : "muted"} />
        <StatCard label={isAr ? "انقطاع هاش" : "Hash breaks"} value={breaks} tone={breaks ? "err" : "muted"} />
      </div>

      {rowsByOrg.size === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد فواتير مختومة بعد." : "No sealed invoices yet."}
        </Card>
      ) : (
        Array.from(rowsByOrg.entries()).map(([orgId, rows]) => (
          <Card key={orgId} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs text-muted-foreground truncate">
                {isAr ? "المنظمة" : "Org"}: {orgId}
              </div>
              <Badge variant="outline">{rows.length}</Badge>
            </div>
            <DataTable<ZatcaChainRow>
              data={rows}
              columns={zatcaColumns(isAr)}
              rowKey={(r) => r.invoice_id}
              isAr={isAr}
              exportFileName={`zatca-${orgId}`}
              maxHeight="60vh"
              initialPageSize={25}
            />

          </Card>
        ))
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "muted" }: { label: string; value: number; tone?: "ok" | "warn" | "err" | "muted" }) {
  const toneCls =
    tone === "ok" ? "text-success" :
    tone === "warn" ? "text-warning" :
    tone === "err" ? "text-destructive" :
    "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
    </Card>
  );
}

function ChainBadge({ row, isAr }: { row: ZatcaChainRow; isAr: boolean }) {
  if (row.hash_break) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        {isAr ? "انقطاع هاش" : "Hash break"}
      </Badge>
    );
  }
  if (row.counter_gap) {
    return (
      <Badge className="gap-1 bg-warning/20 text-warning border border-warning/40">
        <AlertTriangle className="h-3 w-3" />
        {isAr ? "فجوة عدّاد" : "Counter gap"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-success border-success/40">
      <CheckCircle2 className="h-3 w-3" />
      {isAr ? "سليم" : "OK"}
    </Badge>
  );
}

function zatcaColumns(isAr: boolean): DataTableColumn<ZatcaChainRow>[] {
  return [
    {
      id: "counter",
      header: "#",
      width: 80,
      accessor: (r) => r.zatca_counter,
      cell: (r) => <span className="font-mono">{r.zatca_counter}</span>,
    },
    {
      id: "number",
      header: isAr ? "الرقم" : "Number",
      width: 160,
      accessor: (r) => r.number ?? "",
    },
    {
      id: "sealed_at",
      header: isAr ? "الختم" : "Sealed at",
      width: 200,
      accessor: (r) => r.zatca_sealed_at ?? "",
      cell: (r) => (
        <span className="text-xs">
          {r.zatca_sealed_at
            ? new Date(r.zatca_sealed_at).toLocaleString(isAr ? "ar-SA" : "en-US")
            : "—"}
        </span>
      ),
    },
    {
      id: "hash",
      header: isAr ? "الهاش" : "Hash",
      width: 200,
      accessor: (r) => r.zatca_hash ?? "",
      cell: (r) => (
        <span className="font-mono text-xs" title={r.zatca_hash ?? ""}>
          {r.zatca_hash?.slice(0, 14) ?? "—"}…
        </span>
      ),
    },
    {
      id: "status",
      header: isAr ? "الحالة" : "Status",
      width: 160,
      accessor: (r) => (r.hash_break ? "hash_break" : r.counter_gap ? "counter_gap" : "ok"),
      cell: (r) => <ChainBadge row={r} isAr={isAr} />,
    },
  ];
}

