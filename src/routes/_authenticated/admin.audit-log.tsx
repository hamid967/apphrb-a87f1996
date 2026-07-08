import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RequireRole } from "@/components/auth/RequireRole";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { ADMIN_ROLES } from "@/lib/permissions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ScrollText,
  RotateCw,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { sectionHead } from "@/lib/section-og-head";
const ENTITIES = ["rbac_roles", "rbac_role_permissions", "rbac_user_roles"] as const;
type Entity = (typeof ENTITIES)[number];
type Scope = "all" | "global" | "company" | "branch" | "department";
type LoginStatus = "all" | "success" | "failed" | "blocked" | "rate_limited";

type Row = {
  id: string;
  entity: Entity;
  entity_id: string;
  actor: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  created_at: string;
  diff: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    org_id?: string | null;
  } | null;
};

export const Route = createFileRoute("/_authenticated/admin/audit-log")({
  head: () => sectionHead({ section: "admin", entityAr: "سجل التدقيق", entityEn: "Audit Log", path: "/admin/audit-log" }),
  component: () => (
    <RequireRole roles={ADMIN_ROLES}>
      <RequirePermission permission="api.keys.manage">
        <AuditLogPage />
      </RequirePermission>
    </RequireRole>
  ),
});

function actionColor(a: Row["action"]) {
  return a === "INSERT" ? "default" : a === "DELETE" ? "destructive" : "secondary";
}

function summarize(row: Row, isAr: boolean): string {
  const after = row.diff?.after ?? {};
  const before = row.diff?.before ?? {};
  const src = row.action === "DELETE" ? before : after;
  switch (row.entity) {
    case "rbac_roles":
      return isAr
        ? `دور "${String((src as any).name ?? row.entity_id.slice(0, 8))}"`
        : `Role "${String((src as any).name ?? row.entity_id.slice(0, 8))}"`;
    case "rbac_role_permissions":
      return isAr
        ? `صلاحية ${String((src as any).permission_id ?? "").slice(0, 8)}… ← دور ${String((src as any).role_id ?? "").slice(0, 8)}…`
        : `Permission ${String((src as any).permission_id ?? "").slice(0, 8)}… → role ${String((src as any).role_id ?? "").slice(0, 8)}…`;
    case "rbac_user_roles":
      return isAr
        ? `مستخدم ${String((src as any).user_id ?? "").slice(0, 8)}… (${String((src as any).scope_type ?? "-")})`
        : `User ${String((src as any).user_id ?? "").slice(0, 8)}… (${String((src as any).scope_type ?? "-")})`;
  }
}

function diffFields(row: Row): { key: string; before: unknown; after: unknown }[] {
  if (row.action !== "UPDATE") return [];
  const b = (row.diff?.before ?? {}) as Record<string, unknown>;
  const a = (row.diff?.after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: { key: string; before: unknown; after: unknown }[] = [];
  for (const k of keys) {
    if (k === "updated_at") continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k]))
      out.push({ key: k, before: b[k], after: a[k] });
  }
  return out;
}

function AuditLogPage() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { orgId, ready } = useCurrentOrg();
  const [entity, setEntity] = useState<Entity | "all">("all");
  const [action, setAction] = useState<"all" | Row["action"]>("all");
  const [scope, setScope] = useState<Scope>("all");
  const [userQuery, setUserQuery] = useState("");
  const [ip, setIp] = useState("");
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["rbac_audit_log", orgId, entity, action, scope, userQuery, from, to],
    enabled: !!orgId && ready,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .in("entity", entity === "all" ? (ENTITIES as unknown as string[]) : [entity])
        .eq("diff->>org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (action !== "all") q = q.eq("action", action);
      if (scope !== "all") {
        // scope lives inside the after/before rbac_user_roles snapshot
        q = q.or(`diff->after->>scope_type.eq.${scope},diff->before->>scope_type.eq.${scope}`);
      }
      const uid = userQuery.trim();
      if (uid) {
        // match actor OR the affected user_id inside snapshot
        q = q.or(
          `actor.eq.${uid},diff->after->>user_id.eq.${uid},diff->before->>user_id.eq.${uid}`,
        );
      }
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const loginsQuery = useQuery({
    queryKey: ["login_events", ip, loginStatus, userQuery, from, to],
    enabled: ready,
    queryFn: async () => {
      let q = supabase
        .from("login_events")
        .select("id, email, user_id, ip_address, user_agent, status, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (loginStatus !== "all") q = q.eq("status", loginStatus);
      if (ip.trim()) q = q.ilike("ip_address", `%${ip.trim()}%`);
      const uid = userQuery.trim();
      if (uid) q = q.or(`user_id.eq.${uid},email.ilike.%${uid}%`);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = useMemo(() => {
    const c = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    for (const r of query.data ?? []) c[r.action]++;
    return c;
  }, [query.data]);

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function exportCSV() {
    const audit = (query.data ?? []).map((r) => ({
      kind: "audit",
      created_at: r.created_at,
      action: r.action,
      entity: r.entity,
      entity_id: r.entity_id,
      actor: r.actor ?? "",
      ip: "",
      status: "",
      summary: summarize(r, isAr),
    }));
    const logins = (loginsQuery.data ?? []).map((r: any) => ({
      kind: "login",
      created_at: r.created_at,
      action: "LOGIN",
      entity: "login_events",
      entity_id: r.id,
      actor: r.user_id ?? r.email ?? "",
      ip: r.ip_address ?? "",
      status: r.status,
      summary: `${r.email ?? "-"} · ${r.reason ?? ""}`,
    }));
    const rows = [...audit, ...logins];
    const cols = [
      "kind",
      "created_at",
      "action",
      "entity",
      "entity_id",
      "actor",
      "ip",
      "status",
      "summary",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Audit & Login Events", 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 20);

    autoTable(doc, {
      startY: 26,
      head: [
        isAr
          ? ["الوقت", "الإجراء", "الكيان", "المنفّذ", "الملخّص"]
          : ["When", "Action", "Entity", "Actor", "Summary"],
      ],
      body: (query.data ?? []).map((r) => [
        new Date(r.created_at).toLocaleString(),
        r.action,
        r.entity.replace("rbac_", ""),
        r.actor ? r.actor.slice(0, 8) + "…" : isAr ? "النظام" : "system",
        summarize(r, isAr),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    const afterAudit = (doc as any).lastAutoTable?.finalY ?? 30;
    autoTable(doc, {
      startY: afterAudit + 8,
      head: [
        isAr
          ? ["الوقت", "البريد", "IP", "الحالة", "السبب"]
          : ["When", "Email", "IP", "Status", "Reason"],
      ],
      body: (loginsQuery.data ?? []).map((r: any) => [
        new Date(r.created_at).toLocaleString(),
        r.email ?? "-",
        r.ip_address ?? "-",
        r.status,
        r.reason ?? "-",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`audit-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  if (!ready) {
    return (
      <AdminPageLoading
        ar="سجل التدقيق"
        en="Audit & Login Log"
        icon={ScrollText}
        descriptionAr="تغييرات الأدوار وأحداث تسجيل الدخول — مع فلترة وتصدير."
        descriptionEn="RBAC changes plus login events — filter and export."
      />
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <AdminPageHeader
        ar="سجل التدقيق"
        en="Audit & Login Log"
        icon={ScrollText}
        descriptionAr="تغييرات الأدوار وأحداث تسجيل الدخول — مع فلترة وتصدير."
        descriptionEn="RBAC changes plus login events — filter by type, user, IP, result and date, then export."
        actions={
          <>
            <Badge variant="default">+{counts.INSERT}</Badge>
            <Badge variant="secondary">~{counts.UPDATE}</Badge>
            <Badge variant="destructive">−{counts.DELETE}</Badge>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <FileDown className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} className="gap-2">
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} className="gap-2">
              <RotateCw className="h-4 w-4" /> {isAr ? "تحديث" : "Refresh"}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? "الفلاتر" : "Filters"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>{isAr ? "الكيان" : "Entity"}</Label>
            <Select value={entity} onValueChange={(v: Entity | "all") => setEntity(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "كل كيانات RBAC" : "All RBAC entities"}</SelectItem>
                <SelectItem value="rbac_roles">{isAr ? "الأدوار" : "Roles"}</SelectItem>
                <SelectItem value="rbac_role_permissions">{isAr ? "صلاحيات الأدوار" : "Role permissions"}</SelectItem>
                <SelectItem value="rbac_user_roles">{isAr ? "إسنادات المستخدمين" : "User assignments"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "الإجراء" : "Action"}</Label>
            <Select value={action} onValueChange={(v: "all" | Row["action"]) => setAction(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "كل الإجراءات" : "All actions"}</SelectItem>
                <SelectItem value="INSERT">{isAr ? "إنشاء" : "Created"}</SelectItem>
                <SelectItem value="UPDATE">{isAr ? "تحديث" : "Updated"}</SelectItem>
                <SelectItem value="DELETE">{isAr ? "حذف" : "Deleted"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "النطاق (الإسنادات)" : "Scope (assignments)"}</Label>
            <Select value={scope} onValueChange={(v: Scope) => setScope(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "أي نطاق" : "Any scope"}</SelectItem>
                <SelectItem value="global">{isAr ? "عام" : "Global"}</SelectItem>
                <SelectItem value="company">{isAr ? "شركة" : "Company"}</SelectItem>
                <SelectItem value="branch">{isAr ? "فرع" : "Branch"}</SelectItem>
                <SelectItem value="department">{isAr ? "قسم" : "Department"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "المستخدم (UUID أو بريد)" : "User (UUID or email)"}</Label>
            <Input
              placeholder={isAr ? "00000000-… أو name@…" : "00000000-… or name@…"}
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          </div>
          <div>
            <Label>{isAr ? "عنوان IP" : "IP address"}</Label>
            <Input placeholder={isAr ? "مثلاً 192.168." : "e.g. 192.168."} value={ip} onChange={(e) => setIp(e.target.value)} />
          </div>
          <div>
            <Label>{isAr ? "نتيجة الدخول" : "Login result"}</Label>
            <Select value={loginStatus} onValueChange={(v: LoginStatus) => setLoginStatus(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "أي نتيجة" : "Any result"}</SelectItem>
                <SelectItem value="success">{isAr ? "ناجح" : "Success"}</SelectItem>
                <SelectItem value="failed">{isAr ? "فاشل" : "Failed"}</SelectItem>
                <SelectItem value="blocked">{isAr ? "محظور" : "Blocked"}</SelectItem>
                <SelectItem value="rate_limited">{isAr ? "محدود المعدّل" : "Rate limited"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "من تاريخ" : "From date"}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>{isAr ? "إلى تاريخ" : "To date"}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? "أحداث RBAC" : "RBAC events"}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {isAr ? "جارٍ تحميل الأحداث…" : "Loading events…"}
            </div>
          ) : (query.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{isAr ? "لا توجد أحداث مطابقة." : "No matching events."}</p>
          ) : (
            <div className="border rounded-md divide-y">
              {(query.data ?? []).map((r) => {
                const isOpen = expanded.has(r.id);
                const fields = diffFields(r);
                return (
                  <div key={r.id} className="text-sm">
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 text-left"
                      onClick={() => toggle(r.id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <Badge variant={actionColor(r.action)}>{r.action}</Badge>
                      <span className="font-medium truncate">{summarize(r, isAr)}</span>
                      <Badge variant="outline" className="ml-2">
                        {r.entity.replace("rbac_", "")}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                      <code className="text-xs text-muted-foreground hidden md:inline">
                        {isAr ? "بواسطة" : "by"} {r.actor ? r.actor.slice(0, 8) + "…" : isAr ? "النظام" : "system"}
                      </code>
                    </button>
                    {isOpen && (
                      <div className="px-8 pb-3 space-y-2 bg-muted/20">
                        {r.action === "UPDATE" && fields.length > 0 && (
                          <div className="rounded border bg-background">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/40">
                                <tr>
                                  <th className="text-left px-2 py-1 font-medium">{isAr ? "الحقل" : "Field"}</th>
                                  <th className="text-left px-2 py-1 font-medium">{isAr ? "قبل" : "Before"}</th>
                                  <th className="text-left px-2 py-1 font-medium">{isAr ? "بعد" : "After"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fields.map((f) => (
                                  <tr key={f.key} className="border-t">
                                    <td className="px-2 py-1 font-mono">{f.key}</td>
                                    <td className="px-2 py-1 font-mono text-destructive/80">
                                      {JSON.stringify(f.before) ?? "—"}
                                    </td>
                                    <td className="px-2 py-1 font-mono text-emerald-600 dark:text-emerald-400">
                                      {JSON.stringify(f.after) ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {isAr ? "الحمولة الخام" : "Raw payload"}
                          </summary>
                          <pre className="mt-1 text-[11px] overflow-auto rounded border bg-background p-2 max-h-64">
                            {JSON.stringify(r.diff, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? "أحداث تسجيل الدخول" : "Login events"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loginsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {isAr ? "جارٍ تحميل أحداث الدخول…" : "Loading login events…"}
            </div>
          ) : (loginsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{isAr ? "لا توجد أحداث دخول مطابقة." : "No matching login events."}</p>
          ) : (
            <div className="border rounded-md divide-y overflow-x-auto">
              <div className="grid grid-cols-[auto_1fr_1fr_auto_1fr] gap-3 px-3 py-2 text-xs font-medium bg-muted/40">
                <span>{isAr ? "الحالة" : "Status"}</span>
                <span>{isAr ? "البريد" : "Email"}</span>
                <span>{isAr ? "IP" : "IP"}</span>
                <span>{isAr ? "الوقت" : "When"}</span>
                <span>{isAr ? "السبب" : "Reason"}</span>
              </div>
              {(loginsQuery.data ?? []).map((r: any) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[auto_1fr_1fr_auto_1fr] gap-3 px-3 py-2 text-sm items-center"
                >
                  <Badge variant={r.status === "success" ? "default" : "destructive"}>
                    {r.status}
                  </Badge>
                  <span className="truncate">{r.email ?? "—"}</span>
                  <code className="text-xs">{r.ip_address ?? "—"}</code>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{r.reason ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
