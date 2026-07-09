import { Home } from "lucide-react";
import { SmartBreadcrumbs, type SmartLabelMap } from "@/components/breadcrumbs/SmartBreadcrumbs";

const LABELS: SmartLabelMap = {
  units: { ar: "الوحدات", en: "Units" },
  contracts: { ar: "العقود", en: "Contracts" },
  payments: { ar: "المدفوعات", en: "Payments" },
  expenses: { ar: "المصروفات", en: "Expenses" },
  tenants: { ar: "المستأجرون", en: "Tenants" },
  settings: { ar: "الإعدادات", en: "Settings" },
  new: { ar: "جديد", en: "New" },
};

export function DashboardBreadcrumbs() {
  return (
    <SmartBreadcrumbs
      rootSegment="dashboard"
      layoutId="dashboard-breadcrumb"
      labels={LABELS}
      rootIcon={Home}
      rootLabel={{ ar: "الرئيسية", en: "Dashboard" }}
      ariaHome={{ ar: "الانتقال إلى الرئيسية", en: "Go to Dashboard home" }}
    />
  );
}
