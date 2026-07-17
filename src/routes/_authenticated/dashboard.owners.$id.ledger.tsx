import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getOwnerLedger } from "@/lib/owners.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, FileJson, FileText, Loader2, Printer, Receipt } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ADMIN_ROLES } from "@/lib/permissions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/dashboard/owners/$id/ledger")({
  head: ({ params }) => detailHead({ entityAr: 'دفتر أستاذ مالك', entityEn: 'Owner Ledger', id: String(params.id), path: `/owners/${params.id}/ledger`, kind: 'dashboard' }),
  component: OwnerLedgerGate,
});

function OwnerLedgerGate() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <RequireRole
      roles={ADMIN_ROLES}
      title={isAr ? "كشف حساب المالك محظور" : "Owner ledger restricted"}
      description={
        isAr
          ? "تحتوي كشوف حسابات الملاك على بيانات شخصية ومالية — مقصورة على الملاك والمشرفين."
          : "Owner financial ledgers contain PII and payment data — limited to owners and administrators."
      }
    >
      <OwnerLedgerPage />
    </RequireRole>
  );
}

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

const TYPE_LABEL: Record<string, string> = {
  payment: "Payment",
  management_fee: "Mgmt fee",
  expense: "Expense",
};
const TYPE_LABEL_AR: Record<string, string> = {
  payment: "دفعة",
  management_fee: "رسوم إدارة",
  expense: "مصروف",
};

function OwnerLedgerPage() {
  const { id } = Route.useParams();
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id as string | undefined;

  const [from, setFrom] = useState<string>(firstOfMonthISO());
  const [to, setTo] = useState<string>(endOfMonthISO());
  const [feePct, setFeePct] = useState<number>(5);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["owner-ledger", orgId, id, from, to, feePct],
    queryFn: () =>
      getOwnerLedger({ data: { orgId: orgId!, ownerId: id, from, to, managementFeePct: feePct } }),
    enabled: !!orgId,
  });
  const data = q.data;

  const filtered = useMemo(
    () => (data?.rows ?? []).filter((r: any) => typeFilter === "all" || r.type === typeFilter),
    [data, typeFilter],
  );

  const csv = useMemo(() => {
    const head = [
      "Date",
      "Type",
      "Contract",
      "Unit",
      "Tenant",
      "Description",
      "Reference",
      "Status",
      "Debit",
      "Credit",
      "Balance",
      "Currency",
    ].join(",");
    const lines = filtered.map((r: any) =>
      [
        r.date,
        r.type,
        r.contract_number,
        r.unit_code,
        r.tenant_name,
        r.description,
        r.reference,
        r.status,
        r.debit,
        r.credit,
        r.balance,
        r.currency,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    return [head, ...lines].join("\n");
  }, [filtered]);

  const downloadCsv = () => {
    if (!data) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${data.owner.full_name.replace(/\s+/g, "_")}-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ ...data, rows: filtered }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${data.owner.full_name.replace(/\s+/g, "_")}-${from}_${to}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!data) return;
    const esc = (s: any) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
      );
    const rowsHtml = filtered
      .map(
        (r: any) => `
        <tr>
          <td class="num">${esc(r.date)}</td>
          <td>${esc(TYPE_LABEL[r.type] ?? r.type)} <span class="ar">${esc(TYPE_LABEL_AR[r.type] ?? "")}</span></td>
          <td>${esc(r.contract_number ?? "—")}</td>
          <td>${esc(r.unit_code ?? "—")}</td>
          <td>${esc(r.description ?? "")}</td>
          <td>${esc(r.status ?? "—")}</td>
          <td class="num warn">${r.debit ? esc(fmt(r.debit, r.currency)) : "—"}</td>
          <td class="num pos">${r.credit ? esc(fmt(r.credit, r.currency)) : "—"}</td>
          <td class="num">${esc(fmt(r.balance, r.currency))}</td>
        </tr>`,
      )
      .join("");
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Owner Ledger — كشف حساب المالك — ${esc(data.owner.full_name)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Arabic", "Tahoma", Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 0 0 12px; color: #555; font-weight: 500; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .ar { font-family: "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif; direction: rtl; unicode-bidi: embed; color: #444; }
  .meta { font-size: 11px; color: #555; line-height: 1.6; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0 14px; }
  .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  .kpi .l { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .kpi .v { font-size: 16px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  thead th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  thead th .ar { display: block; font-size: 10px; font-weight: 500; }
  tfoot td { font-weight: 600; border-top: 2px solid #111; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pos { color: #047857; } .warn { color: #b45309; }
  .footer { margin-top: 16px; font-size: 10px; color: #666; display: flex; justify-content: space-between; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 10px; right: 10px; }
  .noprint button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF · طباعة</button></div>
  <div class="head">
    <div>
      <h1>Owner Statement of Account <span class="ar">— كشف حساب المالك</span></h1>
      <h2>${esc(data.owner.full_name)}</h2>
      <div class="meta">
        Period / الفترة: <b>${esc(from)}</b> → <b>${esc(to)}</b><br/>
        Currency / العملة: <b>${esc(data.currency)}</b> · Management fee / نسبة الإدارة: <b>${esc(feePct)}%</b><br/>
        Entries / عدد الحركات: <b>${filtered.length}</b> of ${data.rows.length}
      </div>
    </div>
    <div class="meta" style="text-align:right">
      Generated / تاريخ الإصدار<br/><b>${esc(new Date().toISOString().slice(0, 19).replace("T", " "))}</b>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="l">Total Credit · إجمالي الوارد</div><div class="v pos">${esc(fmt(data.totals.credit, data.currency))}</div></div>
    <div class="kpi"><div class="l">Total Debit · إجمالي الصادر</div><div class="v warn">${esc(fmt(data.totals.debit, data.currency))}</div></div>
    <div class="kpi"><div class="l">Net · الصافي</div><div class="v">${esc(fmt(data.totals.net, data.currency))}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date<span class="ar">التاريخ</span></th>
        <th>Type<span class="ar">النوع</span></th>
        <th>Contract<span class="ar">العقد</span></th>
        <th>Unit<span class="ar">الوحدة</span></th>
        <th>Description<span class="ar">الوصف</span></th>
        <th>Status<span class="ar">الحالة</span></th>
        <th class="num">Debit<span class="ar">مدين</span></th>
        <th class="num">Credit<span class="ar">دائن</span></th>
        <th class="num">Balance<span class="ar">الرصيد</span></th>
      </tr>
    </thead>
    <tbody>${rowsHtml || `<tr><td colspan="9" style="text-align:center;padding:24px;color:#888">No transactions · لا توجد حركات</td></tr>`}</tbody>
    ${
      filtered.length
        ? `<tfoot><tr>
            <td colspan="6">Totals · الإجماليات</td>
            <td class="num warn">${esc(fmt(data.totals.debit, data.currency))}</td>
            <td class="num pos">${esc(fmt(data.totals.credit, data.currency))}</td>
            <td class="num">${esc(fmt(data.totals.net, data.currency))}</td>
          </tr></tfoot>`
        : ""
    }
  </table>

  <div class="footer">
    <div>HBSpro · عقاري</div>
    <div>${esc(data.owner.full_name)} · ${esc(from)} → ${esc(to)}</div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/owners/$id"
          params={{ id }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {isAr ? "العودة إلى الكشف" : "Back to statement"}
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="me-1 size-4" /> {isAr ? "طباعة" : "Print"}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson} disabled={!data}>
            <FileJson className="me-1 size-4" /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!data}>
            <Download className="me-1 size-4" /> CSV
          </Button>
          <Button size="sm" onClick={downloadPdf} disabled={!data}>
            <FileText className="me-1 size-4" /> PDF
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : !data ? (
        <div className="text-muted-foreground">{isAr ? "لا توجد بيانات." : "No data."}</div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">{data.owner.full_name}</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">
                  {isAr ? "كشف حركات تفصيلي" : "Detailed transactions ledger"} · {from} → {to}
                </div>
              </div>
              <Badge variant="outline">
                <Receipt className="me-1 size-3.5" /> {isAr ? "كشف" : "Ledger"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5 print:hidden">
                <div>
                  <Label>{isAr ? "من" : "From"}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label>{isAr ? "إلى" : "To"}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div>
                  <Label>{isAr ? "نسبة الإدارة %" : "Management fee %"}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={feePct}
                    onChange={(e) => setFeePct(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>{isAr ? "النوع" : "Type"}</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                      <SelectItem value="payment">{isAr ? "الدفعات" : "Payments"}</SelectItem>
                      <SelectItem value="management_fee">{isAr ? "رسوم الإدارة" : "Mgmt fees"}</SelectItem>
                      <SelectItem value="expense">{isAr ? "المصاريف" : "Expenses"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end text-xs text-muted-foreground">
                  {filtered.length} {isAr ? "من" : "of"} {data.rows.length} {isAr ? "حركة" : "entries"}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Kpi
              label={isAr ? "إجمالي الوارد" : "Total credit (in)"}
              value={fmt(data.totals.credit, data.currency)}
              tone="pos"
            />
            <Kpi
              label={isAr ? "إجمالي الصادر" : "Total debit (out)"}
              value={fmt(data.totals.debit, data.currency)}
              tone="warn"
            />
            <Kpi
              label={isAr ? "الصافي" : "Net"}
              value={fmt(data.totals.net, data.currency)}
              tone={data.totals.net >= 0 ? "pos" : "warn"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{isAr ? "الحركات" : "Transactions"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start">{isAr ? "التاريخ" : "Date"}</th>
                      <th className="p-3 text-start">{isAr ? "النوع" : "Type"}</th>
                      <th className="p-3 text-start">{isAr ? "العقد" : "Contract"}</th>
                      <th className="p-3 text-start">{isAr ? "الوحدة" : "Unit"}</th>
                      <th className="p-3 text-start">{isAr ? "الوصف" : "Description"}</th>
                      <th className="p-3 text-start">{isAr ? "الحالة" : "Status"}</th>
                      <th className="p-3 text-end">{isAr ? "مدين" : "Debit"}</th>
                      <th className="p-3 text-end">{isAr ? "دائن" : "Credit"}</th>
                      <th className="p-3 text-end">{isAr ? "الرصيد" : "Balance"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="p-3 tabular-nums">{r.date}</td>
                        <td className="p-3">
                          <Badge variant={r.type === "payment" ? "default" : "secondary"}>
                            {(isAr ? TYPE_LABEL_AR[r.type] : TYPE_LABEL[r.type]) ?? r.type}
                          </Badge>
                        </td>
                        <td className="p-3">{r.contract_number ?? "—"}</td>
                        <td className="p-3">{r.unit_code ?? "—"}</td>
                        <td className="p-3">{r.description}</td>
                        <td className="p-3 text-muted-foreground">{r.status ?? "—"}</td>
                        <td className="p-3 text-end tabular-nums text-warning">
                          {r.debit ? fmt(r.debit, r.currency) : "—"}
                        </td>
                        <td className="p-3 text-end tabular-nums text-success">
                          {r.credit ? fmt(r.credit, r.currency) : "—"}
                        </td>
                        <td className="p-3 text-end tabular-nums">{fmt(r.balance, r.currency)}</td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">
                          {isAr ? "لا توجد حركات في الفترة." : "No transactions in period."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filtered.length > 0 && (
                    <tfoot className="border-t bg-muted/20 font-medium">
                      <tr>
                        <td className="p-3" colSpan={6}>
                          {isAr ? "الإجماليات" : "Totals"}
                        </td>
                        <td className="p-3 text-end tabular-nums text-warning">
                          {fmt(data.totals.debit, data.currency)}
                        </td>
                        <td className="p-3 text-end tabular-nums text-success">
                          {fmt(data.totals.credit, data.currency)}
                        </td>
                        <td className="p-3 text-end tabular-nums">
                          {fmt(data.totals.net, data.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "warn" }) {
  const cls =
    tone === "pos" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
