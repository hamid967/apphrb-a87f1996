import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Archive, RotateCw, FileDown } from "lucide-react";

import { sectionHead } from "@/lib/section-og-head";
const ENTITIES = ["contracts", "payments", "tenants", "units", "owners"] as const;
type Entity = (typeof ENTITIES)[number];
type Action = "archive" | "restore";

type Row = {
  id: string;
  entity: string;
  entity_id: string;
  actor: string | null;
  action: string;
  created_at: string;
  diff: { soft_delete?: Action; reason?: string | null; at?: string } | null;
};

export const Route = createFileRoute("/_authenticated/dashboard/archive-log")({
  head: () => sectionHead({ section: "dashboard", entityAr: "سجل الأرشيف", entityEn: "Archive Log", path: "/dashboard/archive-log" }),
  component: ArchiveLogPage,
});

function ArchiveLogPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [entity, setEntity] = useState<Entity | "all">("all");
  const [action, setAction] = useState<Action | "all">("all");
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useQuery({
    queryKey: ["archive_log", entity, action, actor, reason, from, to],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .in("action", action === "all" ? ["archive", "restore"] : [action])
        .order("created_at", { ascending: false })
        .limit(500);
      if (entity !== "all") q = q.eq("entity", entity);
      else q = q.in("entity", ENTITIES as unknown as string[]);
      const a = actor.trim();
      if (a) q = q.eq("actor", a);
      const r = reason.trim();
      if (r) q = q.ilike("diff->>reason", `%${r}%`);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const actorIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of query.data ?? []) if (r.actor) s.add(r.actor);
    return Array.from(s);
  }, [query.data]);

  const profilesQuery = useQuery({
    queryKey: ["archive_log_actors", actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name])) as Record<
        string,
        string | null
      >;
    },
  });

  const counts = useMemo(() => {
    const c = { archive: 0, restore: 0 };
    for (const r of query.data ?? []) {
      if (r.action === "archive") c.archive++;
      else if (r.action === "restore") c.restore++;
    }
    return c;
  }, [query.data]);

  function actorName(id: string | null) {
    if (!id) return "—";
    return profilesQuery.data?.[id] || id.slice(0, 8) + "…";
  }

  function exportCSV() {
    const rows = (query.data ?? []).map((r) => ({
      created_at: r.created_at,
      action: r.action,
      entity: r.entity,
      entity_id: r.entity_id,
      actor: r.actor ?? "",
      actor_name: actorName(r.actor) ?? "",
      reason: r.diff?.reason ?? "",
    }));
    const cols = ["created_at", "action", "entity", "entity_id", "actor", "actor_name", "reason"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Archive className="h-7 w-7 text-primary" />{" "}
            {isAr ? "سجل الأرشفة والاسترجاع" : "Archive & restore log"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAr
              ? "مراجعة كل عمليات الأرشفة والاسترجاع مع المستخدم والتاريخ والسبب."
              : "Review every archive and restore action with user, date, and reason."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="destructive">
            {isAr ? "أرشفة" : "Archive"}: {counts.archive}
          </Badge>
          <Badge variant="default">
            {isAr ? "استرجاع" : "Restore"}: {counts.restore}
          </Badge>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <FileDown className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} className="gap-2">
            <RotateCw className="h-4 w-4" /> {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? "الفلاتر" : "Filters"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{isAr ? "نوع السجل" : "Entity type"}</Label>
            <Select value={entity} onValueChange={(v) => setEntity(v as Entity | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                <SelectItem value="contracts">{isAr ? "العقود" : "Contracts"}</SelectItem>
                <SelectItem value="payments">{isAr ? "المدفوعات" : "Payments"}</SelectItem>
                <SelectItem value="tenants">{isAr ? "المستأجرون" : "Tenants"}</SelectItem>
                <SelectItem value="units">{isAr ? "الوحدات" : "Units"}</SelectItem>
                <SelectItem value="owners">{isAr ? "الملاك" : "Owners"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "العملية" : "Action"}</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                <SelectItem value="archive">{isAr ? "أرشفة" : "Archive"}</SelectItem>
                <SelectItem value="restore">{isAr ? "استرجاع" : "Restore"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "معرّف المستخدم (UUID)" : "User ID (UUID)"}</Label>
            <Input
              placeholder="00000000-…"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Label>{isAr ? "السبب يحتوي على" : "Reason contains"}</Label>
            <Input
              placeholder={isAr ? "بحث نصي في السبب" : "Text search in reason"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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
          <CardTitle className="text-lg">{isAr ? "النتائج" : "Results"}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {isAr ? "جارٍ التحميل…" : "Loading…"}
            </div>
          ) : query.error ? (
            <p className="text-sm text-destructive p-4">
              {isAr ? "تعذّر تحميل السجل:" : "Failed to load log:"} {(query.error as Error).message}
            </p>
          ) : (query.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              {isAr ? "لا توجد نتائج مطابقة." : "No matching results."}
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "التاريخ" : "Date"}</th>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "العملية" : "Action"}</th>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "النوع" : "Entity"}</th>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "المعرّف" : "ID"}</th>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "المستخدم" : "User"}</th>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "السبب" : "Reason"}</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString(isAr ? "ar" : "en")}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={r.action === "archive" ? "destructive" : "default"}>
                          {r.action === "archive"
                            ? isAr
                              ? "أرشفة"
                              : "Archive"
                            : isAr
                              ? "استرجاع"
                              : "Restore"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{r.entity}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.entity_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2 text-xs">{actorName(r.actor)}</td>
                      <td className="px-3 py-2 text-xs">{r.diff?.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
