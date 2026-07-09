import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listOwners } from "@/lib/company-modules.functions";

export const Route = createFileRoute("/_authenticated/dashboard/owners")({
  head: () => ({ meta: [{ title: "الملّاك — لوحة التحكم" }] }),
  component: OwnersPage,
});

type Owner = { id: string; full_name: string; email: string | null; phone: string | null; address: string | null; notes: string | null; created_at: string };

function OwnersPage() {
  return (
    <CompanyListPage<Owner>
      titleAr="الملّاك"
      titleEn="Owners"
      descAr="جميع ملّاك العقارات المسجّلين وكشوف حساباتهم"
      descEn="All registered property owners and their statements"
      queryKey="owners"
      listFn={listOwners}
      searchFields={(r) => [r.full_name, r.email ?? "", r.phone ?? ""]}
      columns={[
        { key: "name", labelAr: "الاسم", labelEn: "Name", render: (r) => <span className="font-medium">{r.full_name}</span> },
        { key: "email", labelAr: "البريد", labelEn: "Email", render: (r) => r.email ?? "—" },
        { key: "phone", labelAr: "الجوال", labelEn: "Phone", render: (r) => r.phone ?? "—" },
        { key: "address", labelAr: "العنوان", labelEn: "Address", render: (r) => r.address ?? "—" },
      ]}
    />
  );
}
