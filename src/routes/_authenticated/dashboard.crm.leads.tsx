import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listLeads } from "@/lib/company-modules.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/crm/leads")({
  head: () => ({ meta: [{ title: "العملاء المحتملون — CRM" }] }),
  component: LeadsPage,
});

type L = { id: string; stage: string | null; source: string | null; budget_min: number | null; budget_max: number | null; currency: string | null; notes: string | null; assigned_to: string | null; created_at: string };

function LeadsPage() {
  return (
    <CompanyListPage<L>
      titleAr="العملاء المحتملون"
      titleEn="Leads"
      descAr="خط العملاء المحتملين حسب المصدر والمرحلة"
      descEn="Lead pipeline by source and stage"
      queryKey="leads"
      listFn={listLeads}
      searchFields={(r) => [r.source ?? "", r.notes ?? ""]}
      columns={[
        { key: "stage", labelAr: "المرحلة", labelEn: "Stage", render: (r) => r.stage ? <Badge variant="outline">{r.stage}</Badge> : "—" },
        { key: "source", labelAr: "المصدر", labelEn: "Source", render: (r) => r.source ?? "—" },
        { key: "budget", labelAr: "الميزانية", labelEn: "Budget", render: (r) => {
          const cur = r.currency ?? "SAR";
          if (r.budget_min != null && r.budget_max != null) return `${Number(r.budget_min).toLocaleString()}–${Number(r.budget_max).toLocaleString()} ${cur}`;
          if (r.budget_max != null) return `≤ ${Number(r.budget_max).toLocaleString()} ${cur}`;
          if (r.budget_min != null) return `≥ ${Number(r.budget_min).toLocaleString()} ${cur}`;
          return "—";
        }},
        { key: "created", labelAr: "التاريخ", labelEn: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]}
    />
  );
}
