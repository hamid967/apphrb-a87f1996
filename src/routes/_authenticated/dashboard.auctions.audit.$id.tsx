import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogById, type AuditLogRow, type JsonValue } from "@/lib/audit-log.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard/auctions/audit/$id")({
  head: ({ params }) => detailHead({ entityAr: 'سجل مزاد', entityEn: 'Auction Audit', id: String(params.id), path: `/dashboard/auctions/audit/${params.id}`, kind: 'docs' }),
  component: AuditDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{String(error?.message ?? error)}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">{i18n.t("auctions.common.notFound")}</div>,
});

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

const FIELD_LABEL: Record<string, string> = {
  reserve_price: "السعر الاحتياطي",
  starting_price: "السعر الابتدائي",
  min_increment: "الحد الأدنى للمزايدة",
  start_at: "بدء المزاد",
  end_at: "نهاية المزاد",
  title_ar: "العنوان (عربي)",
  title_en: "العنوان (إنجليزي)",
  status: "الحالة",
  amount: "المبلغ",
  winner_user_id: "الفائز",
  winning_amount: "مبلغ الفوز",
  auction_id: "معرّف المزاد",
  bidder_id: "المزايد",
};

function actionVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  if (a === "win" || a === "finalize") return "default";
  if (a === "cancel") return "destructive";
  if (a === "bid") return "secondary";
  return "outline";
}

function fmtValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string") {
    // date?
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString("ar");
    }
    return v;
  }
  return JSON.stringify(v);
}

function fmtLabel(k: string): string {
  return FIELD_LABEL[k] ?? k;
}

function summarize(row: AuditLogRow): string {
  const d = (row.diff ?? {}) as Record<string, unknown>;
  switch (row.action) {
    case "bid":
      return `مزايدة بمبلغ ${fmtValue(d.amount)} على المزاد ${String(d.auction_id ?? "").slice(0, 8)}…`;
    case "win":
      return `فوز بمبلغ ${fmtValue(d.winning_amount)} — الفائز ${String(d.winner_user_id ?? "").slice(0, 8)}…`;
    case "finalize":
      return `إنهاء المزاد (${fmtValue(d.from)} → ${fmtValue(d.to)})`;
    case "publish":
    case "activate":
    case "cancel":
    case "status_change":
      return `${ACTION_LABEL[row.action] ?? row.action}: ${fmtValue(d.from)} → ${fmtValue(d.to)}`;
    case "create":
      return `إنشاء مزاد "${fmtValue(d.title_ar)}" بسعر ابتدائي ${fmtValue(d.starting_price)}`;
    case "update":
      return `تعديل قواعد المزاد — قارن قيم قبل/بعد أدناه`;
    default:
      return row.action;
  }
}

type Change = { field: string; before: unknown; after: unknown; changed: boolean };

function buildDiff(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.map((k) => {
    const b = before[k];
    const a = after[k];
    const changed = JSON.stringify(b) !== JSON.stringify(a);
    return { field: k, before: b, after: a, changed };
  });
}

function AuditDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const get = useServerFn(getAuditLogById);
  const q = useQuery({
    queryKey: ["audit-log-entry", id],
    queryFn: () => get({ data: { id } }),
  });

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <ScrollText className="size-6 text-primary" /> {t("auctions.audit.detailTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auctions.audit.detailSubtitle")}
          </p>
        </div>
        <Button asChild variant="ghost" className="gap-2">
          <Link to="/dashboard/auctions/audit">
            <ArrowLeft className="size-4" /> {t("auctions.audit.backToLog")}
          </Link>
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : q.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {String((q.error as Error)?.message ?? q.error)}
        </div>
      ) : !q.data ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("auctions.audit.notFound")}
        </div>
      ) : (
        <AuditDetail row={q.data} />
      )}
    </div>
  );
}

function AuditDetail({ row }: { row: AuditLogRow }) {
  const { t } = useTranslation();
  const d = (row.diff ?? {}) as Record<string, unknown>;
  const rawAid = String(d.auction_id ?? (row.entity === "auctions" ? row.entity_id : ""));
  const auctionId = UUID_RE.test(rawAid) ? rawAid : undefined;

  const isUpdate =
    row.action === "update" &&
    d.before &&
    typeof d.before === "object" &&
    d.after &&
    typeof d.after === "object";

  const changes: Change[] = isUpdate
    ? buildDiff(d.before as Record<string, unknown>, d.after as Record<string, unknown>)
    : [];
  const changedOnly = changes.filter((c) => c.changed);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={actionVariant(row.action)}>
              {ACTION_LABEL[row.action] ?? row.action}
            </Badge>
            <span className="text-xs text-muted-foreground">{row.entity}</span>
            {auctionId && (
              <Button asChild variant="link" size="sm" className="h-auto gap-1 p-0 text-xs">
                <Link to="/auctions/$id" params={{ id: auctionId }}>
                  <ExternalLink className="size-3" /> {t("auctions.audit.viewLinkedAuction")}
                </Link>
              </Button>
            )}
          </div>
          <CardTitle className="mt-2 text-lg">{summarize(row)}</CardTitle>
          <CardDescription>
            {new Date(row.created_at).toLocaleString("ar")} · {t("auctions.audit.actorPrefix")}{" "}
            <span dir="ltr" className="font-mono">
              {row.actor ? row.actor.slice(0, 8) + "…" : t("auctions.audit.system")}
            </span>
            {" · "}{t("auctions.audit.entityIdPrefix")}{" "}
            <span dir="ltr" className="font-mono">
              {row.entity_id.slice(0, 8)}…
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {isUpdate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("auctions.audit.diffTitle")}</CardTitle>
            <CardDescription>
              {changedOnly.length > 0
                ? t("auctions.audit.diffChanged", { count: changedOnly.length, total: changes.length })
                : t("auctions.audit.diffNone")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-xs text-muted-foreground">
                    <th className="py-2 pl-3 font-medium">{t("auctions.audit.field")}</th>
                    <th className="py-2 pl-3 font-medium">{t("auctions.audit.before")}</th>
                    <th className="py-2 font-medium">{t("auctions.audit.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(changedOnly.length ? changedOnly : changes).map((c) => (
                    <tr
                      key={c.field}
                      className={`border-b last:border-0 ${c.changed ? "bg-primary/5" : ""}`}
                    >
                      <td className="py-2 pl-3 align-top font-medium">{fmtLabel(c.field)}</td>
                      <td className="py-2 pl-3 align-top">
                        <span
                          className={
                            c.changed
                              ? "rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through decoration-destructive/60"
                              : "text-muted-foreground"
                          }
                        >
                          {fmtValue(c.before)}
                        </span>
                      </td>
                      <td className="py-2 align-top">
                        <span
                          className={
                            c.changed
                              ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {fmtValue(c.after)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("auctions.audit.actionDetails")}</CardTitle>
            <CardDescription>{t("auctions.audit.actionDetailsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(d)
                .filter(([k]) => k !== "org_id")
                .map(([k, v]) => (
                  <div key={k} className="rounded-md border bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground">{fmtLabel(k)}</dt>
                    <dd className="mt-1 break-words text-sm">{fmtValue(v)}</dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("auctions.audit.rawJson")}</CardTitle>
          <CardDescription>{t("auctions.audit.rawJsonHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <pre dir="ltr" className="max-h-96 overflow-auto rounded bg-muted p-3 text-[11px]">
            {JSON.stringify(row.diff as JsonValue, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}
