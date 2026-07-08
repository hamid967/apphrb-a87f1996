import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Users2, Mail, Phone } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { listPortalEmployees } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/employees")({
  head: () => portalHead({ titleAr: 'الموظفون', titleEn: 'Employees', descAr: 'إدارة موظفي المحطة والصلاحيات.', path: '/portal/employees' }),
  component: EmployeesPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

function EmployeesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "employees"],
    queryFn: () => listPortalEmployees(),
  });
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<Users2 className="size-5" />}
        title={isAr ? "الموظفون" : "Employees"}
        subtitle={isAr ? "قائمة الموظفين وحالة العقود" : "Staff list & contract status"}
      />
      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isAr ? "لا يوجد موظفون" : "No employees yet"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الاسم" : "Name"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "المسمى" : "Title"}</th>
                  <th className="px-4 py-3 text-start font-medium">
                    {isAr ? "التواصل" : "Contact"}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e: any) => (
                  <tr key={e.id} className="border-t border-border/60 transition hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{e.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.job_title ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {e.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="size-3" />
                            {e.email}
                          </span>
                        )}
                        {e.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" />
                            {e.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                        {e.status ?? "active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
