import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listDeals } from "@/lib/company-modules.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/crm/deals")({
  head: () => ({ meta: [{ title: "الصفقات — CRM" }] }),
  component: DealsPage,
});

type D = { id: string; status: string | null; offer_amount: number | null; agreed_amount: number | null; currency: string | null; offer_date: string | null; close_date: string | null; notes: string | null; created_at: string };

function DealsPage() {
  return (
    <CompanyListPage<D>
      titleAr="الصفقات"
      titleEn="Deals"
      descAr="متابعة الصفقات من العرض حتى الإغلاق"
      descEn="Track deals from offer to close"
      queryKey="deals"
      listFn={listDeals}
      columns={[
        { key: "status", labelAr: "الحالة", labelEn: "Status", render: (r) => r.status ? <Badge variant="outline">{r.status}</Badge> : "—" },
        { key: "offer", labelAr: "قيمة العرض", labelEn: "Offer", render: (r) => r.offer_amount != null ? `${Number(r.offer_amount).toLocaleString()} ${r.currency ?? "SAR"}` : "—" },
        { key: "agreed", labelAr: "المتّفق عليه", labelEn: "Agreed", render: (r) => r.agreed_amount != null ? <span className="font-semibold">{`${Number(r.agreed_amount).toLocaleString()} ${r.currency ?? "SAR"}`}</span> : "—" },
        { key: "offer_date", labelAr: "تاريخ العرض", labelEn: "Offer date", render: (r) => r.offer_date ? new Date(r.offer_date).toLocaleDateString() : "—" },
        { key: "close", labelAr: "تاريخ الإغلاق", labelEn: "Close date", render: (r) => r.close_date ? new Date(r.close_date).toLocaleDateString() : "—" },
      ]}
    />
  );
}
