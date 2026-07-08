import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, RefreshCw, Search, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAdminAlertEmails } from "@/lib/admin-telemetry-read.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/telemetry-emails")({
  head: () => sectionHead({ section: "admin", entityAr: "رسائل التليمتري", entityEn: "Telemetry Emails", path: "/admin/telemetry-emails" }),
  component: TelemetryEmailsPage,
});

const STATUS_OPTIONS = [
  { value: "__all", ar: "كل الحالات", en: "Any status" },
  { value: "pending", ar: "قيد الإرسال", en: "Pending" },
  { value: "sent", ar: "أُرسلت", en: "Sent" },
  { value: "dlq", ar: "فشلت (DLQ)", en: "Failed (DLQ)" },
  { value: "failed", ar: "فشلت", en: "Failed" },
  { value: "suppressed", ar: "مكبوتة", en: "Suppressed" },
  { value: "bounced", ar: "مرتدّة", en: "Bounced" },
  { value: "complained", ar: "شكوى", en: "Complaint" },
];

const RANGE_OPTIONS = [
  { value: "24", ar: "آخر 24 ساعة", en: "Last 24h" },
  { value: "72", ar: "آخر 3 أيام", en: "Last 3 days" },
  { value: "168", ar: "آخر أسبوع", en: "Last week" },
  { value: "720", ar: "آخر 30 يومًا", en: "Last 30 days" },
];

function statusTone(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "sent") return "default";
  if (s === "pending") return "secondary";
  if (s === "suppressed" || s === "bounced" || s === "complained") return "outline";
  return "destructive"; // dlq, failed
}

function TelemetryEmailsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const [template, setTemplate] = useState<string>("admin-alert");
  const [status, setStatus] = useState<string>("__all");
  const [range, setRange] = useState<string>("168");
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listAdminAlertEmails);
  const query = useQuery({
    queryKey: ["admin-alert-emails", template, status, range, search],
    queryFn: () =>
      listFn({
        data: {
          template: template === "__all" ? null : template,
          status: status === "__all" ? null : status,
          sinceHours: Number(range),
          search: search || null,
          limit: 200,
        },
      }),
    staleTime: 15_000,
  });

  const rows = query.data?.rows ?? [];
  const templates = query.data?.templates ?? [];
  const counts = query.data?.statusCounts ?? {};
  const total = rows.length;

  const templateOptions = useMemo(() => {
    const set = new Set<string>(["admin-alert", ...templates]);
    return Array.from(set).sort();
  }, [templates]);

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        icon={Mail}
        ar="سجل رسائل التليمتري"
        en="Telemetry email log"
        descriptionAr="كل رسالة إشعار إدارية أُرسلت عبر الطابور (dedup على message_id، آخر حالة لكل رسالة)"
        descriptionEn="Every admin alert email routed through the queue (deduped by message_id, latest status per email)"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={isAr ? "الإجمالي" : "Total"} value={total} />
        <StatCard label={isAr ? "أُرسلت" : "Sent"} value={counts.sent ?? 0} tone="ok" />
        <StatCard
          label={isAr ? "قيد الإرسال" : "Pending"}
          value={counts.pending ?? 0}
          tone="warn"
        />
        <StatCard
          label={isAr ? "فشلت / DLQ" : "Failed / DLQ"}
          value={(counts.dlq ?? 0) + (counts.failed ?? 0)}
          tone="bad"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isAr ? "المرشّحات" : "Filters"}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {isAr ? "النوع (القالب)" : "Type (template)"}
            </label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{isAr ? "كل الأنواع" : "All templates"}</SelectItem>
                {templateOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{isAr ? "الحالة" : "Status"}</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {isAr ? o.ar : o.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{isAr ? "الفترة" : "Range"}</label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {isAr ? o.ar : o.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">
              {isAr ? "بحث (بريد/خطأ/قالب)" : "Search (email / error / template)"}
            </label>
            <div className="relative">
              <Search className="absolute start-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "اكتب للبحث…" : "Type to search…"}
                className="ps-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={isAr ? "مسح البحث" : "Clear search"}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
          <div className="md:col-span-5 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              <RefreshCw className="size-4 me-2" />
              {isAr ? "تحديث" : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isAr ? `النتائج (${total})` : `Results (${total})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {isAr ? "جاري التحميل…" : "Loading…"}
            </div>
          ) : query.isError ? (
            <div className="py-10 text-center text-sm text-destructive">
              {(query.error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {isAr ? "لا رسائل مطابقة." : "No matching emails."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "الوقت" : "Time"}</TableHead>
                    <TableHead>{isAr ? "القالب" : "Template"}</TableHead>
                    <TableHead>{isAr ? "المستلم" : "Recipient"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                    <TableHead>{isAr ? "الخطأ" : "Error"}</TableHead>
                    <TableHead>message_id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.message_id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString(isAr ? "ar" : "en", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">{r.template_name}</TableCell>
                      <TableCell className="text-xs">{r.recipient_email}</TableCell>
                      <TableCell>
                        <Badge variant={statusTone(r.status)}>{r.status}</Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[280px] truncate text-xs text-muted-foreground"
                        title={r.error_message ?? ""}
                      >
                        {r.error_message ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {r.message_id.slice(0, 8)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {query.data?.hasMore && (
            <p className="mt-3 text-xs text-muted-foreground">
              {isAr
                ? "قد تكون هناك نتائج إضافية — ضيّق الفترة أو المرشّحات لرؤيتها."
                : "There may be more results — narrow the range or filters to see them."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
