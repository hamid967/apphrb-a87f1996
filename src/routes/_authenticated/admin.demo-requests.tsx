import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDemoRequests } from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/demo-requests")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "طلبات العرض التجريبي",
      entityEn: "Demo Requests",
      path: "/admin/demo-requests",
    }),
  component: AdminDemoRequestsPage,
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
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

type DemoReq = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  units: string | null;
  message: string | null;
  source: string | null;
  created_at: string;
};

function AdminDemoRequestsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listDemoRequests);
  return (
    <AdminListShell<DemoReq>
      titleAr="طلبات العرض التجريبي"
      titleEn="Demo Requests"
      descAr="طلبات التواصل والعروض التجريبية الواردة من نموذج التواصل."
      descEn="Incoming demo and contact requests from the contact form."
      queryKey="admin-demo-requests"
      listFn={() => listFn() as Promise<DemoReq[]>}
      searchFields={(r) => [r.name, r.email, r.company]}
      columns={[
        {
          key: "name",
          labelAr: "الاسم",
          labelEn: "Name",
          render: (r) => <span className="font-medium">{r.name}</span>,
        },
        {
          key: "email",
          labelAr: "البريد",
          labelEn: "Email",
          render: (r) => (
            <a href={`mailto:${r.email}`} className="text-primary hover:underline text-sm">
              {r.email}
            </a>
          ),
        },
        {
          key: "phone",
          labelAr: "الجوال",
          labelEn: "Phone",
          render: (r) => <span className="text-sm">{r.phone ?? "—"}</span>,
        },
        {
          key: "company",
          labelAr: "الشركة",
          labelEn: "Company",
          render: (r) => <span className="text-sm">{r.company ?? "—"}</span>,
        },
        {
          key: "units",
          labelAr: "الوحدات",
          labelEn: "Units",
          render: (r) => <span className="text-sm">{r.units ?? "—"}</span>,
        },
        {
          key: "source",
          labelAr: "المصدر",
          labelEn: "Source",
          render: (r) => (r.source ? <Badge variant="outline">{r.source}</Badge> : <span>—</span>),
        },
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
      ]}
    />
  );
}
