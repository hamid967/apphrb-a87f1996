import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { listAssistantAudit } from "@/lib/assistant-audit.functions";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  Terminal,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/assistant/audit")({
  head: () => sectionHead({ section: "assistant", entityAr: "سجل المساعد", entityEn: "Assistant Audit", path: "/assistant/audit" }),
  component: AuditPage,
});

const ACTION_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "err" }> = {
  ASSISTANT_TOOL_CALL: { label: "استدعاء أداة (محادثة)", tone: "ok" },
  ASSISTANT_ACTION: { label: "إجراء منفَّذ", tone: "ok" },
  ASSISTANT_ACTION_ERROR: { label: "خطأ في إجراء", tone: "err" },
  ASSISTANT_TOOL_DENIED: { label: "منع صلاحية", tone: "warn" },
  DASHBOARD_TOOL_CALL: { label: "تشغيل يدوي (سكربت)", tone: "ok" },
  DASHBOARD_TOOL_DENIED: { label: "منع صلاحية (يدوي)", tone: "warn" },
};

function AuditPage() {
  const fn = useServerFn(listAssistantAudit);
  const [action, setAction] = useState<string>("");
  const [limit, setLimit] = useState<number>(100);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["assistant-audit", action, limit],
    queryFn: () => fn({ data: { action: action || undefined, limit } }),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-4" dir="rtl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">سجل تدقيق سكربتات حامد</h1>
          <p className="text-sm text-muted-foreground">
            جميع محاولات تشغيل سكربتات المساعد داخل مؤسستك، مع المستخدم والنتيجة والوقت.
          </p>
        </div>
        <Link
          to="/assistant/scripts"
          className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent"
        >
          → صفحة السكربتات
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">كل الأحداث</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {[50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} سجل
            </option>
          ))}
        </select>
        <button
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className={`size-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> تحديث
        </button>
        <span className="text-xs text-muted-foreground">
          {q.data ? `${q.data.rows.length} سجل` : ""}
        </span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 grid place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : q.isError ? (
          <div className="p-6 text-sm text-destructive">
            {(q.error as any)?.message ?? "تعذر تحميل السجل"}
          </div>
        ) : !q.data?.rows.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد أحداث بعد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-right p-2 w-10"></th>
                <th className="text-right p-2">الوقت</th>
                <th className="text-right p-2">المستخدم</th>
                <th className="text-right p-2">الحدث</th>
                <th className="text-right p-2">الأداة</th>
              </tr>
            </thead>
            <tbody>
              {q.data.rows.map((r) => {
                const meta = ACTION_LABEL[r.action] ?? { label: r.action, tone: "ok" as const };
                const Icon =
                  meta.tone === "err" ? XCircle : meta.tone === "warn" ? ShieldAlert : CheckCircle2;
                const iconCls =
                  meta.tone === "err"
                    ? "text-destructive"
                    : meta.tone === "warn"
                      ? "text-amber-500"
                      : "text-emerald-500";
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t hover:bg-muted/20">
                      <td className="p-2">
                        <button
                          onClick={() => setOpenId(open ? null : r.id)}
                          aria-label="تفاصيل"
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown
                            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                      </td>
                      <td className="p-2 whitespace-nowrap text-muted-foreground" dir="ltr">
                        {new Date(r.created_at).toLocaleString("ar-SA", { hour12: false })}
                      </td>
                      <td className="p-2">
                        {r.actor_email || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 ${iconCls}`}>
                          <Icon className="size-3.5" /> {meta.label}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {r.tool ? (
                          <span className="inline-flex items-center gap-1">
                            <Terminal className="size-3" /> {r.tool}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={5} className="p-3">
                          <pre
                            className="text-xs overflow-x-auto max-h-72 bg-background rounded-md border p-3"
                            dir="ltr"
                          >
                            {JSON.stringify(r.diff, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
