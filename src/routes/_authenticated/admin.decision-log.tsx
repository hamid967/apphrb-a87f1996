import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RequireRole } from "@/components/auth/RequireRole";
import { ADMIN_ROLES } from "@/lib/permissions";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
import { Loader2, Gavel, RotateCw, Filter } from "lucide-react";
import {
  listDecisionAuditEvents,
  listOrgsForDecisionFilter,
  listActorsForDecisionFilter,
} from "@/lib/decision-audit.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/decision-log")({
  head: () => sectionHead({ section: "admin", entityAr: "سجل القرارات", entityEn: "Decision Log", path: "/admin/decision-log" }),
  component: () => (
    <RequireRole roles={ADMIN_ROLES}>
      <DecisionLogPage />
    </RequireRole>
  ),
});

type Kind = "" | "subscription" | "receipt" | "user" | "invitation";
type Decision = "" | "approve" | "reject" | "revoke";
type SortOrder = "newest" | "oldest";

function formatRelative(iso: string, isAr: boolean): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const past = diffMs >= 0;
  const s = isAr
    ? mins < 1 ? "الآن" : mins < 60 ? `${mins} دقيقة` : hours < 24 ? `${hours} ساعة` : `${days} يوم`
    : mins < 1 ? "just now" : mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;
  if (mins < 1) return s;
  return isAr ? (past ? `قبل ${s}` : `بعد ${s}`) : (past ? `${s} ago` : `in ${s}`);
}

function DecisionLogPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const queryClient = useQueryClient();
  const [flashId, setFlashId] = useState<string | null>(null);
  const initialLoadRef = useRef(true);

  const [kind, setKind] = useState<Kind>("");
  const [decision, setDecision] = useState<Decision>("");
  const [orgId, setOrgId] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const orgsQ = useQuery({
    queryKey: ["admin", "decision-log", "orgs"],
    queryFn: () => listOrgsForDecisionFilter(),
  });
  const actorsQ = useQuery({
    queryKey: ["admin", "decision-log", "actors"],
    queryFn: () => listActorsForDecisionFilter(),
  });

  const payload = useMemo(
    () => ({
      kind: (kind || undefined) as any,
      decision: (decision || undefined) as any,
      org_id: orgId || undefined,
      actor: actor || undefined,
      from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined,
      search: search.trim() || undefined,
      sort,
      page,
      pageSize,
    }),
    [kind, decision, orgId, actor, fromDate, toDate, search, sort, page],
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin", "decision-log", payload],
    queryFn: () => listDecisionAuditEvents({ data: payload }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Realtime: toast + refresh when new decisions are recorded
  useEffect(() => {
    const channel = supabase
      .channel("admin-decision-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log" },
        (payload) => {
          const row: any = payload.new;
          const action: string = row?.action ?? "";
          const entity: string = row?.entity ?? "";
          const isDecision =
            action.startsWith("decision_center.") ||
            /^(approve|approved|reject|rejected|revoke|revoked|refund|refunded)$/i.test(action);
          if (!isDecision) return;

          const decision = /reject/i.test(action)
            ? "reject"
            : /revoke|refund/i.test(action)
              ? "revoke"
              : "approve";
          const label = isAr
            ? decision === "approve" ? "تم القبول" : decision === "reject" ? "تم الرفض" : "تم التراجع"
            : decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Revoked";
          const desc = isAr
            ? `تم تسجيل قرار جديد على ${entity || "سجل"}`
            : `New decision recorded on ${entity || "record"}`;
          const fn = decision === "approve" ? toast.success : decision === "reject" ? toast.error : toast;
          (fn as any)(label, { description: desc });

          setFlashId(row?.id ?? null);
          window.setTimeout(() => setFlashId(null), 2500);
          queryClient.invalidateQueries({ queryKey: ["admin", "decision-log"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, isAr]);

  useEffect(() => {
    if (!data) return;
    initialLoadRef.current = false;
  }, [data]);

  function resetFilters() {
    setKind(""); setDecision(""); setOrgId(""); setActor("");
    setFromDate(""); setToDate(""); setSearch(""); setSort("newest"); setPage(1);
  }

  const kindLabel = (k: string) => {
    if (!isAr) return k || "—";
    return { subscription: "اشتراك", receipt: "إيصال", user: "مستخدم", invitation: "دعوة" }[k] ?? k;
  };
  const decisionLabel = (d: string) => {
    if (!isAr) return d || "—";
    return { approve: "قبول", reject: "رفض", revoke: "إلغاء" }[d] ?? d;
  };
  const decisionVariant = (d: string) =>
    d === "approve" ? "default" : d === "reject" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Gavel}
        ar="سجل قرارات الإدارة"
        en="Admin Decision Log"
        descriptionAr="كل قرار من مركز القرارات مسجّل هنا مع المنشأة والمستخدم والوقت."
        descriptionEn="Every Decision Center action recorded with org, actor, and timestamp."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" />
            {isAr ? "التصفية" : "Filters"}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              {isAr ? "مسح" : "Reset"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
              {isAr ? "تحديث" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">{isAr ? "النوع" : "Kind"}</Label>
            <Select value={kind || "all"} onValueChange={(v) => { setKind(v === "all" ? "" : (v as Kind)); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                <SelectItem value="subscription">{isAr ? "اشتراك" : "Subscription"}</SelectItem>
                <SelectItem value="receipt">{isAr ? "إيصال" : "Receipt"}</SelectItem>
                <SelectItem value="user">{isAr ? "مستخدم" : "User"}</SelectItem>
                <SelectItem value="invitation">{isAr ? "دعوة" : "Invitation"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isAr ? "القرار" : "Decision"}</Label>
            <Select value={decision || "all"} onValueChange={(v) => { setDecision(v === "all" ? "" : (v as Decision)); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                <SelectItem value="approve">{isAr ? "قبول" : "Approve"}</SelectItem>
                <SelectItem value="reject">{isAr ? "رفض" : "Reject"}</SelectItem>
                <SelectItem value="revoke">{isAr ? "إلغاء" : "Revoke"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isAr ? "المنشأة" : "Organization"}</Label>
            <Select value={orgId || "all"} onValueChange={(v) => { setOrgId(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder={isAr ? "الكل" : "All"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                {(orgsQ.data?.items ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isAr ? "المشرف" : "Actor"}</Label>
            <Select value={actor || "all"} onValueChange={(v) => { setActor(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder={isAr ? "الكل" : "All"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                {(actorsQ.data?.items ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isAr ? "الترتيب" : "Sort"}</Label>
            <Select value={sort} onValueChange={(v) => { setSort(v as SortOrder); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{isAr ? "الأحدث أولًا" : "Newest first"}</SelectItem>
                <SelectItem value="oldest">{isAr ? "الأقدم أولًا" : "Oldest first"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isAr ? "من تاريخ" : "From"}</Label>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
          </div>
          <div>
            <Label className="text-xs">{isAr ? "إلى تاريخ" : "To"}</Label>
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">{isAr ? "بحث نصي" : "Search"}</Label>
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={isAr ? "اسم منشأة، بريد، سبب…" : "org, email, reason…"}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? `النتائج (${total})` : `Results (${total})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isFetching && rows.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد قرارات مطابقة." : "No matching decisions."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">{isAr ? "الوقت" : "When"}</th>
                    <th className="p-2 text-start">{isAr ? "النوع" : "Kind"}</th>
                    <th className="p-2 text-start">{isAr ? "القرار" : "Decision"}</th>
                    <th className="p-2 text-start">{isAr ? "المنشأة" : "Organization"}</th>
                    <th className="p-2 text-start">{isAr ? "المشرف" : "Actor"}</th>
                    <th className="p-2 text-start">{isAr ? "الكيان" : "Entity"}</th>
                    <th className="p-2 text-start">{isAr ? "التفاصيل" : "Details"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b align-top hover:bg-muted/30 transition-colors ${flashId === r.id ? "bg-primary/10" : ""}`}
                    >
                      <td className="p-2 whitespace-nowrap text-xs">
                        <div className="font-medium text-foreground">
                          {new Date(r.created_at).toLocaleString(isAr ? "ar-SA" : "en-US", {
                            year: "numeric", month: "short", day: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                        <div className="text-[10px] text-muted-foreground" title={r.created_at}>
                          {formatRelative(r.created_at, isAr)}
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline">{kindLabel(r.kind)}</Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant={decisionVariant(r.decision) as any}>{decisionLabel(r.decision)}</Badge>
                      </td>
                      <td className="p-2 text-xs">
                        {r.org_name ?? (r.org_id ? <span className="font-mono">{r.org_id.slice(0, 8)}</span> : "—")}
                      </td>
                      <td className="p-2 text-xs">
                        {r.actor_name ?? (r.actor ? <span className="font-mono">{r.actor.slice(0, 8)}</span> : "—")}
                      </td>
                      <td className="p-2 text-xs">
                        <div className="text-muted-foreground">{r.entity}</div>
                        <div className="font-mono text-[10px]">{r.entity_id.slice(0, 8)}…</div>
                      </td>
                      <td className="p-2 text-xs">
                        {r.reason && (
                          <div><span className="text-muted-foreground">{isAr ? "سبب:" : "Reason:"}</span> {r.reason}</div>
                        )}
                        {r.note && (
                          <div><span className="text-muted-foreground">{isAr ? "ملاحظة:" : "Note:"}</span> {r.note}</div>
                        )}
                        {r.target_email && (
                          <div><span className="text-muted-foreground">{isAr ? "الهدف:" : "Target:"}</span> {r.target_email}</div>
                        )}
                        {!r.reason && !r.note && !r.target_email && <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > pageSize && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {isAr ? `الصفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {isAr ? "السابق" : "Prev"}
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {isAr ? "التالي" : "Next"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}