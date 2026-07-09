import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listBackups } from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/backups")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "النسخ الاحتياطي",
      entityEn: "Backups",
      path: "/admin/backups",
    }),
  component: AdminBackupsPage,
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

type Backup = {
  id: string;
  file_path: string;
  size_bytes: number | null;
  status: string;
  notes: string | null;
  org_name: string | null;
  created_at: string;
};

function fmtSize(n: number | null) {
  if (!n) return "—";
  if (n > 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n > 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
}

function AdminBackupsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listBackups);
  return (
    <AdminListShell<Backup>
      titleAr="النسخ الاحتياطية"
      titleEn="Backups"
      descAr="سجلات النسخ الاحتياطي للمنشآت ومساراتها في التخزين."
      descEn="Backup records for tenants with storage paths and status."
      queryKey="admin-backups"
      listFn={() => listFn() as Promise<Backup[]>}
      searchFields={(b) => [b.file_path, b.org_name, b.notes]}
      columns={[
        {
          key: "org",
          labelAr: "المنشأة",
          labelEn: "Company",
          render: (b) => <span className="font-medium">{b.org_name ?? "—"}</span>,
        },
        {
          key: "path",
          labelAr: "المسار",
          labelEn: "Path",
          render: (b) => <span className="font-mono text-xs">{b.file_path}</span>,
        },
        {
          key: "size",
          labelAr: "الحجم",
          labelEn: "Size",
          render: (b) => <span className="text-sm">{fmtSize(b.size_bytes)}</span>,
        },
        {
          key: "status",
          labelAr: "الحالة",
          labelEn: "Status",
          render: (b) => (
            <Badge variant={b.status === "completed" ? "default" : "secondary"}>{b.status}</Badge>
          ),
        },
        {
          key: "date",
          labelAr: "التاريخ",
          labelEn: "Created",
          render: (b) => (
            <span className="text-xs text-muted-foreground">
              {new Date(b.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
            </span>
          ),
        },
      ]}
    />
  );
}
