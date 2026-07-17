import {
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  Gavel,
  Megaphone,
  Users,
  Wallet,
  Wrench,
  Archive,
  Sigma,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type ServiceKey =
  | "properties"
  | "contracts"
  | "payments"
  | "accounting"
  | "maintenance"
  | "reports"
  | "assistant"
  | "listings"
  | "auctions"
  | "portals"
  | "valuation"
  | "viewings"
  | "archive"
  | "analytics-builder";

export type ServiceCategory = "core" | "finance" | "ops" | "growth" | "admin" | "ai";

export type ServiceDefinition = {
  key: ServiceKey;
  to: string;
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  category: ServiceCategory;
  defaultEnabled: boolean;
  premium: boolean;
};

export const SERVICE_CATALOG: ServiceDefinition[] = [
  { key: "properties", to: "/dashboard/properties", icon: Building2, titleAr: "العقارات والوحدات", titleEn: "Properties & Units", descAr: "إدارة العقارات والوحدات والحالات والصور.", descEn: "Manage properties, units, statuses, and media.", category: "core", defaultEnabled: true, premium: false },
  { key: "contracts", to: "/dashboard/contracts", icon: FileText, titleAr: "العقود والإيجارات", titleEn: "Contracts & Leasing", descAr: "إنشاء العقود، التجديد، والتنبيهات.", descEn: "Create contracts, renewals, and alerts.", category: "core", defaultEnabled: true, premium: false },
  { key: "payments", to: "/dashboard/payments", icon: CreditCard, titleAr: "المدفوعات والسندات", titleEn: "Payments & Vouchers", descAr: "الفواتير، سندات القبض، ومراجعة التحصيل.", descEn: "Invoices, receipts, and collection review.", category: "finance", defaultEnabled: true, premium: false },
  { key: "accounting", to: "/accounting", icon: Wallet, titleAr: "المحاسبة", titleEn: "Accounting", descAr: "مصروفات، أرباح وخسائر، وضريبة القيمة المضافة.", descEn: "Expenses, P&L, and VAT workflows.", category: "finance", defaultEnabled: true, premium: true },
  { key: "maintenance", to: "/dashboard/maintenance", icon: Wrench, titleAr: "الصيانة", titleEn: "Maintenance", descAr: "بلاغات، فنيون، وسجل متابعة.", descEn: "Tickets, technicians, and maintenance tracking.", category: "ops", defaultEnabled: true, premium: false },
  { key: "reports", to: "/dashboard/reports", icon: BarChart3, titleAr: "التقارير", titleEn: "Reports", descAr: "تقارير تنفيذية ومؤشرات أداء.", descEn: "Executive reports and KPI views.", category: "core", defaultEnabled: true, premium: false },
  { key: "assistant", to: "/assistant", icon: Bot, titleAr: "حامد AI", titleEn: "Hamid AI", descAr: "مساعد ذكي للمحادثة والتنفيذ داخل اللوحة.", descEn: "AI assistant for chat and guided actions.", category: "ai", defaultEnabled: true, premium: true },
  { key: "listings", to: "/listings", icon: Megaphone, titleAr: "الإعلانات والعملاء", titleEn: "Listings & Leads", descAr: "إعلانات عامة وطلبات عملاء محتملين.", descEn: "Public listings and lead intake.", category: "growth", defaultEnabled: false, premium: true },
  { key: "auctions", to: "/dashboard/auctions", icon: Gavel, titleAr: "المزادات", titleEn: "Auctions", descAr: "إدارة مزادات عقارية وطلبات مزايدة.", descEn: "Manage property auctions and bids.", category: "growth", defaultEnabled: false, premium: true },
  { key: "portals", to: "/dashboard", icon: Users, titleAr: "بوابات العملاء", titleEn: "Client Portals", descAr: "بوابات المستأجر والمالك والموظف.", descEn: "Tenant, owner, and employee portals.", category: "growth", defaultEnabled: true, premium: true },
  { key: "valuation", to: "/dashboard/valuation", icon: Sparkles, titleAr: "التقييم الذكي", titleEn: "AI Valuation", descAr: "تقييم عقاري ذكي ومقارنات محلية.", descEn: "AI valuation with local comparables.", category: "ai", defaultEnabled: false, premium: true },
  { key: "viewings", to: "/dashboard/viewings", icon: CalendarClock, titleAr: "مواعيد الزيارات", titleEn: "Viewing Appointments", descAr: "جدولة زيارات ومعاينات العقارات.", descEn: "Schedule property tours and viewings.", category: "ops", defaultEnabled: false, premium: true },
  { key: "archive", to: "/dashboard/archive", icon: Archive, titleAr: "الأرشيف الإلكتروني", titleEn: "Electronic Archive", descAr: "أرشفة مستندات وربطها بالعقارات والعملاء.", descEn: "Archive documents and link them to records.", category: "ops", defaultEnabled: false, premium: true },
  { key: "analytics-builder", to: "/reports/builder", icon: Sigma, titleAr: "باني التحليلات", titleEn: "Analytics Builder", descAr: "بناء تقارير مخصصة وحفظ قوالب.", descEn: "Build custom reports and saved templates.", category: "ai", defaultEnabled: false, premium: true },
];

export const DEFAULT_SERVICE_KEYS = SERVICE_CATALOG.filter((service) => service.defaultEnabled).map((service) => service.key);

export function normalizeServiceKeys(keys: unknown): ServiceKey[] {
  if (!Array.isArray(keys)) return DEFAULT_SERVICE_KEYS;
  const allowed = new Set(SERVICE_CATALOG.map((service) => service.key));
  const normalized = keys.filter((key): key is ServiceKey => typeof key === "string" && allowed.has(key as ServiceKey));
  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_SERVICE_KEYS;
}

export function serviceIsEnabled(enabled: ServiceKey[] | undefined, key: ServiceKey) {
  return (enabled ?? DEFAULT_SERVICE_KEYS).includes(key);
}

export function categoryLabel(category: ServiceCategory, isAr: boolean) {
  const labels: Record<ServiceCategory, [string, string]> = {
    core: ["أساسية", "Core"],
    finance: ["مالية", "Finance"],
    ops: ["تشغيل", "Operations"],
    growth: ["نمو", "Growth"],
    admin: ["إدارة", "Admin"],
    ai: ["ذكاء اصطناعي", "AI"],
  };
  const [ar, en] = labels[category];
  return isAr ? ar : en;
}
