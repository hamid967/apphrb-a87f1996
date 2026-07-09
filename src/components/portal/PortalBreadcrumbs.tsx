import { Home } from "lucide-react";
import { SmartBreadcrumbs, type SmartLabelMap } from "@/components/breadcrumbs/SmartBreadcrumbs";

const PORTAL_LABELS: SmartLabelMap = {
  appointments: { ar: "المواعيد", en: "Appointments" },
  assistant: { ar: "المساعد", en: "Assistant" },
  billing: { ar: "الفواتير", en: "Billing" },
  documents: { ar: "المستندات", en: "Documents" },
  employees: { ar: "الموظفون", en: "Employees" },
  invoices: { ar: "الفواتير", en: "Invoices" },
  notifications: { ar: "الإشعارات", en: "Notifications" },
  owner: { ar: "المالك", en: "Owner" },
  statements: { ar: "الكشوف", en: "Statements" },
  requests: { ar: "الطلبات", en: "Requests" },
  settings: { ar: "الإعدادات", en: "Settings" },
  security: { ar: "الأمان", en: "Security" },
  support: { ar: "الدعم", en: "Support" },
  tenant: { ar: "المستأجر", en: "Tenant" },
  maintenance: { ar: "الصيانة", en: "Maintenance" },
  payments: { ar: "المدفوعات", en: "Payments" },
  new: { ar: "جديد", en: "New" },
};

export function PortalBreadcrumbs() {
  return (
    <SmartBreadcrumbs
      rootSegment="portal"
      layoutId="portal-breadcrumb"
      labels={PORTAL_LABELS}
      rootIcon={Home}
      rootLabel={{ ar: "المحطة", en: "Portal" }}
      ariaHome={{ ar: "الانتقال إلى المحطة", en: "Go to Portal home" }}
    />
  );
}
