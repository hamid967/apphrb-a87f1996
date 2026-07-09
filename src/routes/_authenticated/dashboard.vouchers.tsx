import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listVouchers } from "@/lib/company-modules.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/vouchers")({
  head: () => ({ meta: [{ title: "السندات — لوحة التحكم" }] }),
  component: VouchersPage,
});

type V = { id: string; reference: string | null; amount: number | null; currency_code: string | null; status: string | null; paid_at: string | null; notes: string | null; created_at: string };

function VouchersPage() {
  return (
    <CompanyListPage<V>
      titleAr="سندات القبض والصرف"
      titleEn="Receipt & Payment Vouchers"
      descAr="جميع السندات المسجّلة في النظام"
      descEn="All vouchers recorded in the system"
      queryKey="vouchers"
      listFn={listVouchers}
      searchFields={(r) => [r.reference ?? "", r.notes ?? ""]}
      columns={[
        { key: "ref", labelAr: "الرقم", labelEn: "Reference", render: (r) => <span className="font-mono text-xs">{r.reference ?? "—"}</span> },
        { key: "amount", labelAr: "المبلغ", labelEn: "Amount", render: (r) => <span className="font-medium">{r.amount != null ? `${Number(r.amount).toLocaleString()} ${r.currency_code ?? "SAR"}` : "—"}</span> },
        { key: "status", labelAr: "الحالة", labelEn: "Status", render: (r) => r.status ? <Badge variant="outline">{r.status}</Badge> : "—" },
        { key: "paid", labelAr: "تاريخ الدفع", labelEn: "Paid at", render: (r) => r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—" },
      ]}
    />
  );
}
