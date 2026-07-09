import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listValuations } from "@/lib/company-modules.functions";

export const Route = createFileRoute("/_authenticated/dashboard/valuations")({
  head: () => ({ meta: [{ title: "التقييمات العقارية — لوحة التحكم" }] }),
  component: ValuationsPage,
});

type V = { id: string; purpose: string | null; suggested_price: number | null; min_price: number | null; max_price: number | null; currency: string | null; confidence: number | string | null; ai_notes: string | null; created_at: string };

function ValuationsPage() {
  return (
    <CompanyListPage<V>
      titleAr="التقييمات العقارية"
      titleEn="Property Valuations"
      descAr="تقييمات مدعومة بالذكاء الاصطناعي مع مستوى الثقة"
      descEn="AI-assisted valuations with confidence level"
      queryKey="valuations"
      listFn={listValuations}
      searchFields={(r) => [r.purpose ?? "", r.ai_notes ?? ""]}
      columns={[
        { key: "purpose", labelAr: "الغرض", labelEn: "Purpose", render: (r) => r.purpose ?? "—" },
        { key: "suggested", labelAr: "السعر المقترح", labelEn: "Suggested", render: (r) => r.suggested_price != null ? <span className="font-semibold">{`${Number(r.suggested_price).toLocaleString()} ${r.currency ?? "SAR"}`}</span> : "—" },
        { key: "range", labelAr: "النطاق", labelEn: "Range", render: (r) => r.min_price != null && r.max_price != null ? `${Number(r.min_price).toLocaleString()}–${Number(r.max_price).toLocaleString()}` : "—" },
        { key: "confidence", labelAr: "الثقة", labelEn: "Confidence", render: (r) => r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—" },
        { key: "date", labelAr: "التاريخ", labelEn: "Date", render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]}
    />
  );
}
