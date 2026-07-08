import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog, type AuditLogRow } from "@/lib/audit-log.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/auctions/audit")({
  head: () => sectionHead({ section: "dashboard", entityAr: "سجل المزادات", entityEn: "Auctions Audit", path: "/dashboard/auctions/audit" }),
  component: AuctionsAuditPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{String(error?.message ?? error)}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">{i18n.t("auctions.common.notFound")}</div>,
});

const ACTIONS = [
  "create",
  "update",
  "publish",
  "activate",
  "cancel",
  "bid",
  "finalize",
  "win",
] as const;
type ActionName = (typeof ACTIONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION_LABEL: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  publish: "نشر",
  activate: "بدء",
  cancel: "إلغاء",
  bid: "مزايدة",
  finalize: "إنهاء",
  win: "فوز",
  status_change: "تغيير حالة",
};

function actionVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  if (a === "win" || a === "finalize") return "default";
  if (a === "cancel") return "destructive";
  if (a === "bid") return "secondary";
  return "outline";
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

function summarize(row: AuditLogRow): string {
  const d = (row.diff ?? {}) as Record<string, unknown>;
  switch (row.action) {
    case "bid":
      return `مزايدة بمبلغ ${fmt(d.amount)} على المزاد ${String(d.auction_id ?? "").slice(0, 8)}…`;
    case "win":
      return `فوز بمبلغ ${fmt(d.winning_amount)} — الفائز ${String(d.winner_user_id ?? "").slice(0, 8)}…`;
    case "finalize":
      return `إنهاء المزاد (${fmt(d.from)} → ${fmt(d.to)})`;
    case "publish":
    case "activate":
    case "cancel":
    case "status_change":
      return `${ACTION_LABEL[row.action] ?? row.action}: ${fmt(d.from)} → ${fmt(d.to)}`;
    case "create":
      return `إنشاء مزاد "${fmt(d.title_ar)}" بسعر ابتدائي ${fmt(d.starting_price)}`;
    case "update":
      return `تعديل قواعد المزاد`;
    default:
      return row.action;
  }
}

function AuctionsAuditPage() {
  const { t } = useTranslation();
  const list = useServerFn(listAuditLog);
  const [actions, setActions] = useState<ActionName[]>([]);
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [exporting, setExporting] = useState<null | "csv" | "pdf">(null);

  const actorTrim = actor.trim();
  const actorIsUuid = UUID_RE.test(actorTrim);
  // If the actor field holds a partial id/text, fall back to fuzzy JSON search.
  const effectiveSearch = [search.trim(), !actorIsUuid && actorTrim ? actorTrim : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  const filters = () => ({
    entities: ["auctions", "auction_bids"] as string[],
    actions: actions.length ? actions : undefined,
    actor: actorIsUuid ? actorTrim : undefined,
    search: effectiveSearch || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
  });

  const q = useQuery({
    queryKey: ["auctions-audit", actions, actor, search, from, to, page],
    queryFn: () => list({ data: { ...filters(), page, pageSize } }),
  });

  function toggleAction(a: ActionName) {
    setPage(1);
    setActions((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }
  function resetFilters() {
    setPage(1);
    setActions([]);
    setActor("");
    setSearch("");
    setFrom("");
    setTo("");
  }

  async function fetchAll(): Promise<AuditLogRow[]> {
    const out: AuditLogRow[] = [];
    const size = 200;
    for (let p = 1; p <= 50; p++) {
      const res = await list({ data: { ...filters(), page: p, pageSize: size } });
      out.push(...res.rows);
      if (!res.hasMore) break;
    }
    return out;
  }

  function csvEscape(v: unknown): string {
    const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function exportCsv() {
    try {
      setExporting("csv");
      const rows = await fetchAll();
      const header = [
        "created_at",
        "action",
        "entity",
        "entity_id",
        "actor",
        "summary",
        "diff_json",
      ];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.created_at,
            r.action,
            r.entity,
            r.entity_id,
            r.actor ?? "",
            summarize(r),
            JSON.stringify(r.diff ?? {}),
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auctions-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("auctions.audit.exportSuccess", { count: rows.length }));
    } catch (e) {
      toast.error((e as Error)?.message ?? t("auctions.audit.exportFailed"));
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    try {
      setExporting("pdf");
      const rows = await fetchAll();
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("Auctions Audit Log", 40, 40);
      doc.setFontSize(9);
      const meta = [
        `Generated: ${new Date().toLocaleString()}`,
        `Rows: ${rows.length}`,
        `Actions: ${actions.length ? actions.join(",") : "all"}`,
        actor ? `Actor: ${actor}` : "",
        from || to ? `Range: ${from || "…"} → ${to || "…"}` : "",
        search ? `Search: ${search}` : "",
      ]
        .filter(Boolean)
        .join("   |   ");
      doc.text(meta, 40, 58);
      autoTable(doc, {
        startY: 74,
        head: [["Time", "Action", "Entity", "Entity ID", "Actor", "Summary"]],
        body: rows.map((r) => [
          new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19),
          ACTION_LABEL[r.action] ?? r.action,
          r.entity,
          r.entity_id.slice(0, 8) + "…",
          r.actor ? r.actor.slice(0, 8) + "…" : "system",
          summarize(r),
        ]),
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [212, 175, 55] },
        columnStyles: { 5: { cellWidth: 320 } },
      });
      doc.save(`auctions-audit-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(t("auctions.audit.exportSuccess", { count: rows.length }));
    } catch (e) {
      toast.error((e as Error)?.message ?? t("auctions.audit.exportFailed"));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <ScrollText className="size-6 text-primary" /> {t("auctions.audit.listTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auctions.audit.listSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={!!exporting}>
            {exporting === "csv" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}{" "}
            CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportPdf} disabled={!!exporting}>
            {exporting === "pdf" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}{" "}
            PDF
          </Button>
          <Button asChild variant="ghost" className="gap-2">
            <Link to="/dashboard/auctions">
              <ArrowLeft className="size-4" /> {t("auctions.common.backToList")}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("auctions.audit.filtersTitle")}</CardTitle>
          <CardDescription>{t("auctions.audit.filtersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label>{t("auctions.audit.searchJson")}</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setPage(1);
                    setSearch(e.target.value);
                  }}
                  placeholder={t("auctions.audit.searchPlaceholder")}
                  className="pr-8"
                />
              </div>
            </div>
            <div className="lg:col-span-2">
              <Label>{t("auctions.audit.actor")}</Label>
              <Input
                value={actor}
                onChange={(e) => {
                  setPage(1);
                  setActor(e.target.value);
                }}
                placeholder={t("auctions.audit.actorPlaceholder")}
                dir="ltr"
                className={actor && !actorIsUuid ? "border-amber-500/60" : ""}
              />
              {actor && !actorIsUuid && (
                <p className="mt-1 text-[11px] text-amber-600">
                  {t("auctions.audit.actorFuzzyWarn")}
                </p>
              )}
            </div>
            <div>
              <Label>{t("auctions.audit.from")}</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setPage(1);
                  setFrom(e.target.value);
                }}
              />
            </div>
            <div>
              <Label>{t("auctions.audit.to")}</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setPage(1);
                  setTo(e.target.value);
                }}
              />
            </div>
          </div>
          <div>
            <Label className="mb-2 block">{t("auctions.audit.actionType")}</Label>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => {
                const on = actions.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAction(a)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                    aria-pressed={on}
                  >
                    {ACTION_LABEL[a] ?? a}
                  </button>
                );
              })}
              {(actions.length > 0 || actor || search || from || to) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3" /> {t("auctions.audit.clearFilters")}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("auctions.audit.results")}</CardTitle>
            <CardDescription>
              {q.data
                ? t("auctions.audit.totalPage", { total: q.data.total.toLocaleString(), page: q.data.page })
                : t("auctions.common.loading")}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {t("auctions.common.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : q.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {String((q.error as Error)?.message ?? q.error)}
            </div>
          ) : (q.data?.rows.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("auctions.audit.noneMatching")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {q.data!.rows.map((r) => {
                const d = (r.diff ?? {}) as Record<string, unknown>;
                const rawAid = String(d.auction_id ?? (r.entity === "auctions" ? r.entity_id : ""));
                const auctionId = UUID_RE.test(rawAid) ? rawAid : undefined;
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link
                        to="/dashboard/auctions/audit/$id"
                        params={{ id: r.id }}
                        className="float-left ml-2 text-xs text-primary hover:underline"
                      >
                        {t("auctions.audit.viewDetails")}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={actionVariant(r.action)}>
                          {ACTION_LABEL[r.action] ?? r.action}
                        </Badge>
                        {r.entity === "auction_bids" && auctionId ? (
                          <Link
                            to="/auctions/$id"
                            params={{ id: auctionId }}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            <span>auction_bids · {r.entity_id.slice(0, 8)}…</span>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">{r.entity}</span>
                        )}
                        {auctionId && r.entity !== "auction_bids" && (
                          <Link
                            to="/auctions/$id"
                            params={{ id: auctionId }}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            <span>{t("auctions.audit.viewAuction")}</span>
                          </Link>
                        )}
                      </div>
                      <div className="text-sm">{summarize(r)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ar")} · {t("auctions.audit.actorPrefix")}{" "}
                        {r.actor ? r.actor.slice(0, 8) + "…" : t("auctions.audit.system")}
                      </div>
                    </div>
                    <details className="w-full max-w-md">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        JSON
                      </summary>
                      <pre
                        dir="ltr"
                        className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]"
                      >
                        {JSON.stringify(r.diff, null, 2)}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}

          {q.data && q.data.total > pageSize && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || q.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("auctions.audit.previous")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("auctions.audit.pageOf", { page: q.data.page, pages: Math.max(1, Math.ceil(q.data.total / pageSize)) })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!q.data.hasMore || q.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("auctions.audit.next")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
