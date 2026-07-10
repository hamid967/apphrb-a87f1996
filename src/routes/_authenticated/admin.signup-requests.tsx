import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSignupRequests, updateSignupRequestStatus } from "@/lib/signup-requests.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/signup-requests")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "طلبات التسجيل الصوتية",
      entityEn: "Voice Signup Requests",
      path: "/admin/signup-requests",
    }),
  component: AdminSignupRequestsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

type Row = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  company_name: string | null;
  city: string | null;
  activity_type: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  source: string;
  reviewed_at: string | null;
  created_at: string;
};

function statusBadge(s: Row["status"]) {
  if (s === "approved") return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">مقبول</Badge>;
  if (s === "rejected") return <Badge variant="destructive">مرفوض</Badge>;
  return <Badge variant="outline">قيد المراجعة</Badge>;
}

function AdminSignupRequestsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listSignupRequests);
  const updateFn = useServerFn(updateSignupRequestStatus);
  const qc = useQueryClient();

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      await updateFn({ data: { id, status } });
      toast.success(status === "approved" ? "تمت الموافقة" : "تم الرفض");
      await qc.invalidateQueries({ queryKey: ["admin-signup-requests"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AdminListShell<Row>
      titleAr="طلبات التسجيل الصوتية"
      titleEn="Voice Signup Requests"
      descAr="الطلبات الواردة من المساعد حامد. راجع الطلب ووافق أو ارفض."
      descEn="Signup requests captured via Hamid voice assistant."
      queryKey="admin-signup-requests"
      listFn={() => listFn() as Promise<Row[]>}
      searchFields={(r) => [r.full_name, r.email, r.phone, r.company_name, r.city]}
      columns={[
        { key: "name", labelAr: "الاسم", labelEn: "Name", render: (r) => <span className="font-medium">{r.full_name}</span> },
        { key: "phone", labelAr: "الجوال", labelEn: "Phone", render: (r) => <span dir="ltr" className="text-sm">{r.phone}</span> },
        { key: "email", labelAr: "الإيميل", labelEn: "Email", render: (r) => <a href={`mailto:${r.email}`} className="text-primary hover:underline text-sm">{r.email}</a> },
        { key: "company", labelAr: "الشركة", labelEn: "Company", render: (r) => <span className="text-sm">{r.company_name ?? "—"}</span> },
        { key: "city", labelAr: "المدينة", labelEn: "City", render: (r) => <span className="text-sm">{r.city ?? "—"}</span> },
        { key: "activity", labelAr: "النشاط", labelEn: "Activity", render: (r) => <span className="text-sm">{r.activity_type ?? "—"}</span> },
        { key: "notes", labelAr: "ملاحظات", labelEn: "Notes", render: (r) => <span className="text-xs text-muted-foreground line-clamp-2 max-w-[240px]">{r.notes ?? "—"}</span> },
        { key: "status", labelAr: "الحالة", labelEn: "Status", render: (r) => statusBadge(r.status) },
        {
          key: "date",
          labelAr: "التاريخ",
          labelEn: "Date",
          render: (r) => (
            <span className="text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
            </span>
          ),
        },
        {
          key: "actions",
          labelAr: "إجراءات",
          labelEn: "Actions",
          render: (r) =>
            r.status === "pending" ? (
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => void setStatus(r.id, "approved")}>موافقة</Button>
                <Button size="sm" variant="outline" onClick={() => void setStatus(r.id, "rejected")}>رفض</Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        },
      ]}
    />
  );
}
