import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listTasks } from "@/lib/company-modules.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/tasks")({
  head: () => ({ meta: [{ title: "المهام — لوحة التحكم" }] }),
  component: TasksPage,
});

type T = { id: string; title: string | null; description: string | null; due_at: string | null; priority: string | null; status: string | null; assignee_id: string | null; created_at: string };

const prioColor: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 border-red-500/30",
  high: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-700 border-slate-500/30",
};

function TasksPage() {
  return (
    <CompanyListPage<T>
      titleAr="المهام"
      titleEn="Tasks"
      descAr="مهام الفريق المرتبطة بالعقارات والصفقات"
      descEn="Team tasks linked to properties and deals"
      queryKey="tasks"
      listFn={listTasks}
      searchFields={(r) => [r.title ?? "", r.description ?? ""]}
      columns={[
        { key: "title", labelAr: "العنوان", labelEn: "Title", render: (r) => <span className="font-medium">{r.title ?? "—"}</span> },
        { key: "priority", labelAr: "الأولوية", labelEn: "Priority", render: (r) => r.priority ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${prioColor[r.priority] ?? "bg-muted"}`}>{r.priority}</span> : "—" },
        { key: "status", labelAr: "الحالة", labelEn: "Status", render: (r) => r.status ? <Badge variant="outline">{r.status}</Badge> : "—" },
        { key: "due", labelAr: "الاستحقاق", labelEn: "Due", render: (r) => r.due_at ? new Date(r.due_at).toLocaleDateString() : "—" },
      ]}
    />
  );
}
