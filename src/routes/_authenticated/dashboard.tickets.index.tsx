import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Ticket, Filter, Search, Plus, Clock, AlertTriangle, CheckCircle2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listStaffTickets } from "@/lib/staff-tickets.functions";

const listQuery = (filters: {
  status?: string; priority?: string; assignedToMe?: boolean;
  overdueOnly?: boolean; search?: string;
}) =>
  queryOptions({
    queryKey: ["staff-tickets", filters],
    queryFn: () => listStaffTickets({ data: filters as never }),
  });

export const Route = createFileRoute("/_authenticated/dashboard/tickets/")({
  head: () => ({
    meta: [
      { title: "تذاكر الدعم — HBSpro" },
      { name: "description", content: "إدارة تذاكر الدعم الفني والاستفسارات مع تتبع الأولوية وSLA." },
    ],
  }),
  component: TicketsListPage,
});

const STATUS_TONE: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-500 border-blue-500/40",
  in_progress: "bg-amber-500/20 text-amber-500 border-amber-500/40",
  pending: "bg-purple-500/20 text-purple-500 border-purple-500/40",
  resolved: "bg-emerald-500/20 text-emerald-500 border-emerald-500/40",
  closed: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_TONE: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  normal: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  urgent: "bg-red-500/20 text-red-400 border-red-500/40",
};

const STATUS_LABEL_AR: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", pending: "قيد الانتظار",
  resolved: "تم الحل", closed: "مغلقة",
};
const PRIORITY_LABEL_AR: Record<string, string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة",
};

function TicketsListPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const q = useQuery(listQuery({
    status: status === "all" ? undefined : status,
    priority: priority === "all" ? undefined : priority,
    assignedToMe: assignedToMe || undefined,
    overdueOnly: overdueOnly || undefined,
    search: search || undefined,
  }));

  const rows = q.data ?? [];
  const now = Date.now();

  return (
    <div className="p-4 md:p-6 space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">
              {isAr ? "تذاكر الدعم" : "Support Tickets"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr ? `${rows.length} تذكرة` : `${rows.length} tickets`}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link to="/dashboard/tickets/new">
            <Plus className="h-4 w-4 me-1" />
            {isAr ? "تذكرة جديدة" : "New ticket"}
          </Link>
        </Button>
      </header>

      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" /> {isAr ? "فلاتر" : "Filters"}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute h-4 w-4 top-2.5 start-2.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث برقم أو موضوع…" : "Search number or subject…"}
              className="ps-8"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={isAr ? "الحالة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
              {Object.keys(STATUS_LABEL_AR).map((s) => (
                <SelectItem key={s} value={s}>{isAr ? STATUS_LABEL_AR[s] : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={isAr ? "الأولوية" : "Priority"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الأولويات" : "All priorities"}</SelectItem>
              {Object.keys(PRIORITY_LABEL_AR).map((p) => (
                <SelectItem key={p} value={p}>{isAr ? PRIORITY_LABEL_AR[p] : p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={assignedToMe ? "default" : "outline"}
            size="sm"
            onClick={() => setAssignedToMe((v) => !v)}
          >
            <User className="h-4 w-4 me-1" />
            {isAr ? "المُسندة لي" : "Assigned to me"}
          </Button>
          <Button
            variant={overdueOnly ? "destructive" : "outline"}
            size="sm"
            onClick={() => setOverdueOnly((v) => !v)}
          >
            <AlertTriangle className="h-4 w-4 me-1" />
            {isAr ? "متأخرة" : "Overdue"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{isAr ? "الموضوع" : "Subject"}</TableHead>
                <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isAr ? "الأولوية" : "Priority"}</TableHead>
                <TableHead>{isAr ? "التصنيف" : "Category"}</TableHead>
                <TableHead>{isAr ? "القناة" : "Channel"}</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>{isAr ? "الإنشاء" : "Created"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {isAr ? "جارٍ التحميل…" : "Loading…"}
                </TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {isAr ? "لا توجد تذاكر." : "No tickets."}
                </TableCell></TableRow>
              ) : rows.map((r) => {
                const overdue = !r.resolved_at && r.sla_due_at && new Date(r.sla_due_at).getTime() < now;
                const dueDelta = r.sla_due_at
                  ? Math.round((new Date(r.sla_due_at).getTime() - now) / 60000)
                  : null;
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">
                      <Link to="/dashboard/tickets/$id" params={{ id: r.id }} className="hover:underline">
                        {r.ticket_number ?? r.id.slice(0, 6)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[24rem] truncate">
                      <Link to="/dashboard/tickets/$id" params={{ id: r.id }} className="hover:underline">
                        {r.subject}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
                        {isAr ? STATUS_LABEL_AR[r.status] ?? r.status : r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PRIORITY_TONE[r.priority] ?? ""}>
                        {isAr ? PRIORITY_LABEL_AR[r.priority] ?? r.priority : r.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.channel}</TableCell>
                    <TableCell className="text-xs">
                      {r.resolved_at ? (
                        <span className="text-emerald-500 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {isAr ? "منجزة" : "Done"}
                        </span>
                      ) : dueDelta === null ? "—" : overdue ? (
                        <span className="text-destructive inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {isAr
                            ? `متأخرة ${Math.abs(dueDelta)}د`
                            : `${Math.abs(dueDelta)}m overdue`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {dueDelta > 1440
                            ? `${Math.round(dueDelta / 1440)}${isAr ? "ي" : "d"}`
                            : `${dueDelta}${isAr ? "د" : "m"}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
