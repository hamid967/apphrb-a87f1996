import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft, Send, Lock, MessageSquare, Clock, AlertTriangle,
  CheckCircle2, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getStaffTicket, updateStaffTicket, addStaffTicketComment,
  listAssignableUsers,
} from "@/lib/staff-tickets.functions";

const ticketQuery = (id: string) =>
  queryOptions({
    queryKey: ["staff-ticket", id],
    queryFn: () => getStaffTicket({ data: { id } }),
  });

const membersQuery = queryOptions({
  queryKey: ["assignable-users"],
  queryFn: () => listAssignableUsers(),
});

export const Route = createFileRoute("/_authenticated/dashboard/tickets/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل تذكرة — Aqari" },
      { name: "description", content: "متابعة تذكرة دعم مع المحادثة والتحكم بالحالة والأولوية." },
    ],
  }),
  component: TicketDetailPage,
});

const STATUS_LABEL_AR: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", pending: "قيد الانتظار",
  resolved: "تم الحل", closed: "مغلقة",
};
const PRIORITY_LABEL_AR: Record<string, string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة",
};

function TicketDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const q = useQuery(ticketQuery(id));
  const membersQ = useQuery(membersQuery);

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  type PatchInput = {
    id: string;
    status?: "open" | "pending" | "in_progress" | "resolved" | "closed";
    priority?: "low" | "normal" | "high" | "urgent";
    category?: string | null;
    assigneeId?: string | null;
    tags?: string[];
  };
  const patchMut = useMutation({
    mutationFn: (patch: PatchInput) =>
      updateStaffTicket({ data: patch }),
    onSuccess: () => {
      toast.success(isAr ? "تم التحديث" : "Updated");
      qc.invalidateQueries({ queryKey: ["staff-ticket", id] });
      qc.invalidateQueries({ queryKey: ["staff-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commentMut = useMutation({
    mutationFn: () =>
      addStaffTicketComment({
        data: { ticketId: id, body: reply, isInternal },
      }),
    onSuccess: () => {
      setReply("");
      toast.success(isAr ? "تم إرسال الرد" : "Reply sent");
      qc.invalidateQueries({ queryKey: ["staff-ticket", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <div className="p-6 text-muted-foreground">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>;
  }
  if (q.error || !q.data) {
    return <div className="p-6 text-destructive">{(q.error as Error)?.message ?? "Error"}</div>;
  }

  const { ticket, comments } = q.data;
  const now = Date.now();
  const overdue = !ticket.resolved_at && ticket.sla_due_at && new Date(ticket.sla_due_at).getTime() < now;
  const members = membersQ.data ?? [];
  const memberName = (uid: string | null) => {
    if (!uid) return "—";
    const m = members.find((x) => x.id === uid);
    return m?.full_name || m?.email || uid.slice(0, 8);
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <Button variant="ghost" size="sm" onClick={() => nav({ to: "/dashboard/tickets" })}>
        <ArrowLeft className="h-4 w-4 me-1 rtl:rotate-180" />
        {isAr ? "قائمة التذاكر" : "All tickets"}
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 md:p-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground font-mono">
                  {ticket.ticket_number}
                </div>
                <h1 className="text-xl font-bold">{ticket.subject}</h1>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline">
                  {isAr ? STATUS_LABEL_AR[ticket.status] ?? ticket.status : ticket.status}
                </Badge>
                {overdue && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {isAr ? "متأخرة عن SLA" : "SLA overdue"}
                  </Badge>
                )}
              </div>
            </div>
            {ticket.description && (
              <div className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
                {ticket.description}
              </div>
            )}
            {ticket.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ticket.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    <Tag className="h-3 w-3" />{t}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          {/* Conversation */}
          <Card className="p-4 md:p-6 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {isAr ? "المحادثة" : "Conversation"} ({comments.length})
            </h2>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {comments.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  {isAr ? "لا توجد ردود بعد." : "No comments yet."}
                </div>
              )}
              {comments.map((c) => (
                <div
                  key={c.id}
                  className={`border rounded-md p-3 ${
                    c.is_internal ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="font-medium">
                      {memberName(c.author_id)}
                      {c.is_internal && (
                        <Badge variant="outline" className="ms-2 text-[10px] border-amber-500/50 text-amber-600">
                          <Lock className="h-2.5 w-2.5 me-1" />
                          {isAr ? "داخلي" : "Internal"}
                        </Badge>
                      )}
                    </span>
                    <span>{new Date(c.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{c.body}</div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 space-y-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder={isAr ? "اكتب ردك…" : "Write a reply…"}
                maxLength={4000}
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="internal"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                  />
                  <Label htmlFor="internal" className="text-sm">
                    {isAr ? "ملاحظة داخلية (لا تظهر للعميل)" : "Internal note"}
                  </Label>
                </div>
                <Button
                  onClick={() => commentMut.mutate()}
                  disabled={commentMut.isPending || reply.trim().length === 0}
                >
                  <Send className="h-4 w-4 me-1" />
                  {isAr ? "إرسال" : "Send"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">{isAr ? "التفاصيل" : "Properties"}</h2>

            <div className="space-y-2">
              <Label className="text-xs">{isAr ? "الحالة" : "Status"}</Label>
              <Select
                value={ticket.status}
                onValueChange={(v) => patchMut.mutate({ id, status: v as never })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(STATUS_LABEL_AR).map((s) => (
                    <SelectItem key={s} value={s}>
                      {isAr ? STATUS_LABEL_AR[s] : s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{isAr ? "الأولوية" : "Priority"}</Label>
              <Select
                value={ticket.priority}
                onValueChange={(v) => patchMut.mutate({ id, priority: v as never })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(PRIORITY_LABEL_AR).map((p) => (
                    <SelectItem key={p} value={p}>
                      {isAr ? PRIORITY_LABEL_AR[p] : p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{isAr ? "المُسنَد إليه" : "Assignee"}</Label>
              <Select
                value={ticket.assignee_id ?? "__none__"}
                onValueChange={(v) =>
                  patchMut.mutate({ id, assigneeId: v === "__none__" ? null : v })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{isAr ? "غير مُسنَدة" : "Unassigned"}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || m.email || m.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Row label={isAr ? "التصنيف" : "Category"} value={ticket.category ?? "—"} />
            <Row label={isAr ? "القناة" : "Channel"} value={ticket.channel} />
            <Row
              label={isAr ? "طالب الخدمة" : "Requester"}
              value={memberName(ticket.requester_id)}
            />
          </Card>

          <Card className="p-4 space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" /> SLA
            </h2>
            <Row
              label={isAr ? "موعد الاستحقاق" : "Due at"}
              value={ticket.sla_due_at
                ? new Date(ticket.sla_due_at).toLocaleString(isAr ? "ar-SA" : "en-US")
                : "—"}
            />
            <Row
              label={isAr ? "أول استجابة" : "First response"}
              value={ticket.first_response_at
                ? new Date(ticket.first_response_at).toLocaleString(isAr ? "ar-SA" : "en-US")
                : (isAr ? "لم يُرَد بعد" : "Pending")}
            />
            <Row
              label={isAr ? "الحل" : "Resolved"}
              value={ticket.resolved_at
                ? new Date(ticket.resolved_at).toLocaleString(isAr ? "ar-SA" : "en-US")
                : "—"}
            />
            {ticket.resolved_at ? (
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 gap-1 w-fit">
                <CheckCircle2 className="h-3 w-3" />
                {isAr ? "منجزة" : "Done"}
              </Badge>
            ) : overdue ? (
              <Badge variant="destructive" className="gap-1 w-fit">
                <AlertTriangle className="h-3 w-3" />
                {isAr ? "متأخرة" : "Overdue"}
              </Badge>
            ) : null}
          </Card>

          <Card className="p-4 text-xs text-muted-foreground">
            {isAr ? "تم الإنشاء " : "Created "}
            {new Date(ticket.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
            {" · "}
            <Link to="/portal/support" className="hover:underline">
              {isAr ? "بوابة العميل" : "Client portal"}
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate max-w-[60%]" title={value}>{value}</span>
    </div>
  );
}
