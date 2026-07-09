import { createFileRoute } from "@tanstack/react-router";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { listMeetings } from "@/lib/company-modules.functions";

export const Route = createFileRoute("/_authenticated/dashboard/crm/meetings")({
  head: () => ({ meta: [{ title: "الاجتماعات — CRM" }] }),
  component: MeetingsPage,
});

type M = { id: string; title: string | null; description: string | null; starts_at: string | null; ends_at: string | null; location: string | null; link: string | null; created_at: string };

function MeetingsPage() {
  return (
    <CompanyListPage<M>
      titleAr="الاجتماعات"
      titleEn="Meetings"
      descAr="جدول الاجتماعات المرتبطة بالعملاء والصفقات"
      descEn="Schedule of meetings linked to leads and deals"
      queryKey="meetings"
      listFn={listMeetings}
      searchFields={(r) => [r.title ?? "", r.description ?? "", r.location ?? ""]}
      columns={[
        { key: "title", labelAr: "العنوان", labelEn: "Title", render: (r) => <span className="font-medium">{r.title ?? "—"}</span> },
        { key: "when", labelAr: "الموعد", labelEn: "When", render: (r) => r.starts_at ? new Date(r.starts_at).toLocaleString() : "—" },
        { key: "location", labelAr: "المكان", labelEn: "Location", render: (r) => r.location ?? "—" },
        { key: "link", labelAr: "الرابط", labelEn: "Link", render: (r) => r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="text-primary underline">↗</a> : "—" },
      ]}
    />
  );
}
