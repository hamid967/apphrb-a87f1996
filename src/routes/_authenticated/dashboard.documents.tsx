import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listDocuments } from "@/lib/company-modules.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard/documents")({
  head: () => ({ meta: [{ title: "المستندات — لوحة التحكم" }] }),
  component: DocumentsPage,
});

type D = { id: string; title: string | null; category: string | null; status: string | null; signature_status: string | null; signed_at: string | null; tags: string[] | null; created_at: string };

function DocumentsPage() {
  return (
    <CompanyListPage<D>
      titleAr="المستندات"
      titleEn="Documents"
      descAr="جميع المستندات مع حالة التوقيع والإصدارات"
      descEn="All documents with signature status and versions"
      queryKey="documents"
      listFn={listDocuments}
      searchFields={(r) => [r.title ?? "", ...(r.tags ?? [])]}
      columns={[
        { key: "title", labelAr: "العنوان", labelEn: "Title", render: (r) => <span className="font-medium">{r.title ?? "—"}</span> },
        { key: "cat", labelAr: "التصنيف", labelEn: "Category", render: (r) => r.category ? <Badge variant="outline">{r.category}</Badge> : "—" },
        { key: "sig", labelAr: "التوقيع", labelEn: "Signature", render: (r) => r.signature_status ? <Badge variant={r.signature_status === "signed" ? "default" : "outline"}>{r.signature_status}</Badge> : "—" },
        { key: "signed_at", labelAr: "تاريخ التوقيع", labelEn: "Signed at", render: (r) => r.signed_at ? new Date(r.signed_at).toLocaleDateString() : "—" },
      ]}
    />
  );
}
