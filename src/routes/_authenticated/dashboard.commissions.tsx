import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listCommissions } from "@/lib/company-modules.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/commissions")({
  head: () => ({ meta: [{ title: "العمولات — لوحة التحكم" }] }),
  component: CommissionsPage,
});

type C = { id: string; percent: number | null; amount: number | null; currency: string | null; status: string | null; paid_at: string | null; notes: string | null; deal_id: string | null; agent_id: string | null; created_at: string };

function CommissionsPage() {
  return (
    <CompanyListPage<C>
      titleAr="العمولات"
      titleEn="Commissions"
      descAr="عمولات الوسطاء وحالة صرفها"
      descEn="Broker commissions and disbursement status"
      queryKey="commissions"
      listFn={listCommissions}
      columns={[
        { key: "percent", labelAr: "النسبة", labelEn: "Percent", render: (r) => r.percent != null ? `${r.percent}%` : "—" },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount", render: (r) => <span className="font-medium">{r.amount != null ? `${Number(r.amount).toLocaleString()} ${r.currency ?? "SAR"}` : "—"}</span> },
        { key: "status", labelAr: "الحالة", labelEn: "Status", render: (r) => r.status ? <Badge variant={r.status === "paid" ? "default" : "outline"}>{r.status}</Badge> : "—" },
        { key: "paid", labelAr: "تاريخ الصرف", labelEn: "Paid at", render: (r) => r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—" },
      ]}
    />
  );
}
