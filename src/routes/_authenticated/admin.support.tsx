import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAllTickets, updateTicketStatus } from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "الدعم الفني",
      entityEn: "Support",
      path: "/admin/support",
    }),
  component: AdminSupportPage,
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

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  org_name: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["open", "in_progress", "waiting_customer", "resolved", "closed"];

function AdminSupportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listAllTickets);
  const updFn = useServerFn(updateTicketStatus);
  const qc = useQueryClient();

  const updMut = useMutation({
    mutationFn: (v: { id: string; status: string }) => updFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast.success(isAr ? "تم تحديث الحالة" : "Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminListShell<Ticket>
      titleAr="تذاكر الدعم الفني"
      titleEn="Support Tickets"
      descAr="جميع طلبات الدعم من العملاء عبر المنصة."
      descEn="All support requests from customers across the platform."
      queryKey="admin-tickets"
      listFn={() => listFn() as Promise<Ticket[]>}
      searchFields={(t) => [t.subject, t.ticket_number, t.org_name]}
      columns={[
        {
          key: "num",
          labelAr: "الرقم",
          labelEn: "#",
          render: (t) => <span className="font-mono text-xs">{t.ticket_number}</span>,
        },
        {
          key: "subject",
          labelAr: "الموضوع",
          labelEn: "Subject",
          render: (t) => <span className="font-medium">{t.subject}</span>,
        },
        {
          key: "org",
          labelAr: "الشركة",
          labelEn: "Company",
          render: (t) => <span className="text-sm">{t.org_name ?? "—"}</span>,
        },
        {
          key: "priority",
          labelAr: "الأولوية",
          labelEn: "Priority",
          render: (t) => (
            <Badge
              variant={
                t.priority === "high" || t.priority === "urgent" ? "destructive" : "secondary"
              }
            >
              {t.priority}
            </Badge>
          ),
        },
        {
          key: "status",
          labelAr: "الحالة",
          labelEn: "Status",
          render: (t) => (
            <Select
              value={t.status}
              onValueChange={(v) => updMut.mutate({ id: t.id, status: v })}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
        },
        {
          key: "date",
          labelAr: "التاريخ",
          labelEn: "Created",
          render: (t) => (
            <span className="text-xs text-muted-foreground">
              {new Date(t.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
            </span>
          ),
        },
      ]}
    />
  );
}
