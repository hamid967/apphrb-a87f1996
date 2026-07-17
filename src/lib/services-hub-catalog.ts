import {
  Building2,
  FileText,
  Wallet,
  Wrench,
  BarChart3,
  Bot,
  Megaphone,
  Gavel,
  Users,
  CreditCard,
  ShieldCheck,
  Settings,
  LayoutDashboard,
  Sparkles,
  CalendarClock,
  Archive,
  Wrench as WrenchIcon,
  Sigma,
  type LucideIcon,
} from "lucide-react";

export type HubServiceCategory = "core" | "finance" | "ops" | "growth" | "admin" | "ai";

export type HubServiceLink = {
  to: string;
  labelAr: string;
  labelEn: string;
};

export type HubService = {
  id: string;
  to: string;
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  longAr: string;
  longEn: string;
  featuresAr: string[];
  featuresEn: string[];
  stepsAr: string[];
  stepsEn: string[];
  links: HubServiceLink[];
  category: HubServiceCategory;
  hue: string;
  /** Optional. Default true. Set false to mark a service as temporarily unavailable. */
  available?: boolean;
  /** Optional short reason to show in UI when available === false. */
  unavailableReasonAr?: string;
  unavailableReasonEn?: string;
};

export function isHubServiceAvailable(service: Pick<HubService, "available">): boolean {
  return service.available !== false;
}

export const HUB_SERVICES: HubService[] = [
  {
    id: "dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    titleAr: "لوحة التحكم",
    titleEn: "Dashboard",
    descAr: "نظرة عامة على المؤشرات والخدمات الأكثر استخدامًا.",
    descEn: "Overview of KPIs and most-used services.",
    longAr:
      "لوحة تجمع مؤشرات الأداء اليومية، أهم التنبيهات، وروابط سريعة للخدمات التي تستخدمها بكثرة، مع خريطة تفاعلية للمملكة.",
    longEn:
      "One place for daily KPIs, key alerts, quick actions for frequently used services, and an interactive Saudi map.",
    featuresAr: ["بطاقات KPI", "توصيات ذكية", "خريطة السعودية التفاعلية"],
    featuresEn: ["KPI cards", "Smart recommendations", "Interactive Saudi map"],
    stepsAr: [
      "افتح لوحة التحكم من القائمة الجانبية.",
      "راجع البطاقات العلوية للتعرف على الأداء الحالي.",
      "استخدم الإجراءات السريعة للانتقال المباشر لأي خدمة.",
    ],
    stepsEn: [
      "Open the dashboard from the sidebar.",
      "Review the top cards for current performance.",
      "Use quick actions to jump straight into any service.",
    ],
    links: [
      { to: "/dashboard/reports", labelAr: "التقارير", labelEn: "Reports" },
      { to: "/dashboard/notifications", labelAr: "الإشعارات", labelEn: "Notifications" },
    ],
    category: "core",
    hue: "from-primary/25 to-fuchsia-500/10",
  },
  {
    id: "valuation",
    to: "/dashboard/valuation",
    icon: Sparkles,
    titleAr: "التقييم الذكي بالـ AI",
    titleEn: "AI Valuation",
    descAr: "تقدير فوري لسعر البيع أو الإيجار مع مقارنات محلية وتوصيات لرفع القيمة.",
    descEn: "Instant sale/rent price estimates with local comparables and value tips.",
    longAr:
      "أداة تقييم مبنية على الذكاء الاصطناعي، تحلّل خصائص العقار وموقعه ثم تعرض السعر المتوقع ومقارنات لعقارات قريبة مع توصيات عملية.",
    longEn:
      "AI-powered valuation that inspects property attributes and location, then returns an expected price with nearby comparables and actionable tips.",
    featuresAr: ["تسعير فوري", "مقارنات محلية", "توصيات ذكية", "سجل التقييمات"],
    featuresEn: ["Instant pricing", "Local comparables", "Smart tips", "Valuation history"],
    stepsAr: [
      "اختر عقارًا موجودًا أو أدخل بياناته يدويًا.",
      "شغّل التقييم الذكي وانتظر نتيجة النموذج.",
      "احفظ التقرير أو صدّره لصاحب العلاقة.",
    ],
    stepsEn: [
      "Pick an existing property or enter its details manually.",
      "Run the AI valuation and wait for the model's output.",
      "Save the report or export it to the stakeholder.",
    ],
    links: [
      { to: "/dashboard/properties", labelAr: "العقارات", labelEn: "Properties" },
      { to: "/dashboard/valuations", labelAr: "سجل التقييمات", labelEn: "Valuation history" },
    ],
    category: "ai",
    hue: "from-primary/25 to-accent/10",
  },
  {
    id: "viewings",
    to: "/dashboard/viewings",
    icon: CalendarClock,
    titleAr: "حجز مواعيد الزيارات",
    titleEn: "Viewing Appointments",
    descAr: "جدولة جولات معاينة العقارات مع المستأجرين والمشترين وإدارة حالة كل موعد.",
    descEn: "Schedule property tours with prospective tenants/buyers and track each visit.",
    longAr:
      "أدر جولات المعاينة من إنشاء الموعد إلى تأكيد الحضور، مع تصنيف حسب الحالة والفترة وربط مع بيانات العميل.",
    longEn:
      "Manage viewings from booking to attendance, with filters by status/period and links to lead data.",
    featuresAr: ["موعد جديد بضغطة", "تصفية بالحالة والفترة", "روابط اتصال وبريد", "مصادر متعددة"],
    featuresEn: ["One-click booking", "Filter by status & range", "Call/email links", "Multi-source"],
    stepsAr: [
      "اضغط «موعد جديد» ثم اختر العقار والعميل.",
      "حدد الوقت والموظف المسؤول.",
      "أرسل التأكيد للعميل عبر SMS/بريد.",
    ],
    stepsEn: [
      "Click ‘New appointment’ then pick a property and client.",
      "Set time and responsible team member.",
      "Send confirmation to the client via SMS/email.",
    ],
    links: [
      { to: "/dashboard/crm/leads", labelAr: "العملاء المحتملون", labelEn: "Leads" },
      { to: "/dashboard/properties", labelAr: "العقارات", labelEn: "Properties" },
    ],
    category: "ops",
    hue: "from-info/25 to-info/10",
  },
  {
    id: "archive",
    to: "/dashboard/archive",
    icon: Archive,
    titleAr: "الأرشيف الإلكتروني",
    titleEn: "Electronic Archive",
    descAr: "أرشفة المستندات مع رفع الملفات وبحث ذكي وربط تلقائي بالعقارات والعملاء.",
    descEn: "Archive documents with uploads, smart search, and auto-linking to properties & clients.",
    longAr:
      "منظومة أرشفة كاملة: رفع مستندات، استخراج الوسوم بالذكاء الاصطناعي، بحث فوري، وإصدارات لكل ملف.",
    longEn:
      "Full archive: upload documents, AI-assisted tagging, instant search, and per-file versioning.",
    featuresAr: ["رفع PDF/صور", "بحث بالعنوان والوسوم", "ربط تلقائي بالـ AI", "نسخ وإصدارات"],
    featuresEn: ["Upload PDFs/images", "Title & tag search", "AI auto-link", "Versioned files"],
    stepsAr: [
      "افتح الأرشيف واسحب الملفات للرفع.",
      "راجع الوسوم المقترحة واحفظ.",
      "ابحث لاحقًا بالكلمة المفتاحية أو الوسم.",
    ],
    stepsEn: [
      "Open the archive and drop files to upload.",
      "Review AI-suggested tags and save.",
      "Search later by keyword or tag.",
    ],
    links: [
      { to: "/dashboard/documents", labelAr: "المستندات", labelEn: "Documents" },
      { to: "/dashboard/archive-log", labelAr: "سجل الأرشيف", labelEn: "Archive log" },
    ],
    category: "ai",
    hue: "from-info/25 to-primary/10",
  },
  {
    id: "maintenance-log",
    to: "/dashboard/maintenance-log",
    icon: WrenchIcon,
    titleAr: "سجل الصيانة التفاعلي",
    titleEn: "Interactive Maintenance Log",
    descAr: "اربط بلاغات الصيانة بالفنيين وقطع الغيار وتابع الحالة والتكلفة لحظة بلحظة.",
    descEn: "Link tickets to technicians and spare parts with live status and cost tracking.",
    longAr:
      "سجل حي لكل حالة صيانة يعرض الفني المسؤول، قطع الغيار المستخدمة، والتكاليف مع تحديث فوري للحالة.",
    longEn:
      "A live log for every maintenance case showing the assigned technician, parts used, and costs with real-time status.",
    featuresAr: ["إسناد الفني بضغطة", "سجل قطع الغيار والتكلفة", "تحديث الحالة", "ملخّص لكل حالة"],
    featuresEn: ["One-click assignment", "Parts & cost ledger", "Status updates", "Per-status totals"],
    stepsAr: [
      "افتح بلاغًا موجودًا من قائمة الصيانة.",
      "أسنِد الفني وسجّل قطع الغيار.",
      "حدّث الحالة عند الإنجاز لإغلاق البلاغ.",
    ],
    stepsEn: [
      "Open an existing ticket from the maintenance list.",
      "Assign a technician and log spare parts.",
      "Update status on completion to close the ticket.",
    ],
    links: [
      { to: "/dashboard/maintenance", labelAr: "طلبات الصيانة", labelEn: "Maintenance requests" },
      { to: "/dashboard/maintenance/technicians", labelAr: "الفنيون", labelEn: "Technicians" },
    ],
    category: "ops",
    hue: "from-warning/25 to-warning/10",
  },
  {
    id: "properties",
    to: "/dashboard/properties",
    icon: Building2,
    titleAr: "إدارة العقارات",
    titleEn: "Property Management",
    descAr: "إدارة كاملة للعقارات والوحدات والتصنيفات.",
    descEn: "Full property, unit and classification management.",
    longAr:
      "أنشئ عقارات وقسّمها إلى وحدات، أرفق الصور، وأدر الحالات والتصنيفات مع دعم الأرشفة والاستيراد الجماعي.",
    longEn:
      "Create properties, break them into units, attach media, and manage statuses/classifications with archive and bulk import support.",
    featuresAr: ["شقق/فلل/مكاتب/أراضٍ", "إضافة/تعديل/أرشفة", "حالات مفصلة"],
    featuresEn: ["Apartments/villas/offices/land", "CRUD + archive", "Detailed statuses"],
    stepsAr: [
      "اضغط «عقار جديد» وأدخل البيانات الأساسية.",
      "أنشئ الوحدات المطلوبة تحت العقار.",
      "ارفق الصور والمستندات ثم احفظ.",
    ],
    stepsEn: [
      "Click ‘New property’ and fill in the basics.",
      "Create the required units under the property.",
      "Attach photos/documents and save.",
    ],
    links: [
      { to: "/dashboard/properties/new", labelAr: "عقار جديد", labelEn: "New property" },
      { to: "/dashboard/units", labelAr: "الوحدات", labelEn: "Units" },
    ],
    category: "core",
    hue: "from-success/25 to-success/10",
  },
  {
    id: "contracts",
    to: "/dashboard/contracts",
    icon: FileText,
    titleAr: "العقود والإيجارات",
    titleEn: "Contracts & Leasing",
    descAr: "قوالب عقود جاهزة مع تذكيرات وسجل تدقيق.",
    descEn: "Contract templates with reminders and audit logs.",
    longAr:
      "أنشئ عقود إيجار من قوالب جاهزة، فعّل تذكيرات التجديد، ولّد سندات وإيصالات مع سجل تدقيق كامل.",
    longEn:
      "Create leases from ready templates, enable renewal reminders, and generate receipts/vouchers with a full audit trail.",
    featuresAr: ["قوالب مرنة", "تذكيرات تجديد", "إيصالات وسندات"],
    featuresEn: ["Flexible templates", "Renewal reminders", "Receipts & vouchers"],
    stepsAr: [
      "اضغط «عقد جديد» واختر قالبًا.",
      "اربطه بالمستأجر والوحدة.",
      "فعّل التذكيرات ثم اعتمد العقد.",
    ],
    stepsEn: [
      "Click ‘New contract’ and pick a template.",
      "Link it to the tenant and unit.",
      "Enable reminders and approve.",
    ],
    links: [
      { to: "/dashboard/contracts/new", labelAr: "عقد جديد", labelEn: "New contract" },
      { to: "/dashboard/tenants", labelAr: "المستأجرون", labelEn: "Tenants" },
    ],
    category: "core",
    hue: "from-info/25 to-info/10",
  },
  {
    id: "accounting",
    to: "/accounting",
    icon: Wallet,
    titleAr: "المحاسبة",
    titleEn: "Accounting",
    descAr: "مصروفات، أرباح وخسائر، ضريبة القيمة المضافة (زاتكا).",
    descEn: "Expenses, P&L, and ZATCA VAT.",
    longAr:
      "إدارة كاملة للجانب المالي: مصروفات وسندات، تقارير الأرباح والخسائر، وتقارير ضريبة القيمة المضافة المتوافقة مع زاتكا.",
    longEn:
      "Complete financial management: expenses, P&L reports, and ZATCA-compliant VAT statements.",
    featuresAr: ["المصروفات", "P&L", "ضريبة القيمة المضافة", "تحويلات بنكية"],
    featuresEn: ["Expenses", "P&L", "VAT (ZATCA)", "Bank transfers"],
    stepsAr: [
      "سجّل المصروفات أولًا بأول.",
      "راجع تقرير الأرباح والخسائر شهريًا.",
      "أعد إقرار الضريبة من قسم زاتكا.",
    ],
    stepsEn: [
      "Log expenses as they happen.",
      "Review P&L monthly.",
      "Prepare the VAT declaration from the ZATCA section.",
    ],
    links: [
      { to: "/accounting/expenses", labelAr: "المصروفات", labelEn: "Expenses" },
      { to: "/accounting/pnl", labelAr: "الأرباح والخسائر", labelEn: "P&L" },
      { to: "/accounting/vat", labelAr: "ضريبة القيمة المضافة", labelEn: "VAT" },
    ],
    category: "finance",
    hue: "from-warning/25 to-warning/10",
  },
  {
    id: "payments",
    to: "/dashboard/payments",
    icon: CreditCard,
    titleAr: "المدفوعات",
    titleEn: "Payments",
    descAr: "الفواتير والسندات وتتبع التحصيل.",
    descEn: "Invoices, vouchers and collection tracking.",
    longAr:
      "أنشئ فواتير ومستحقات، تتبع التحصيل، وأصدر سندات القبض والصرف مع تنبيهات الاستحقاق.",
    longEn:
      "Create invoices and dues, track collection, and issue receipt/payment vouchers with due alerts.",
    featuresAr: ["فواتير", "سندات قبض/صرف", "تنبيهات استحقاق"],
    featuresEn: ["Invoices", "Receipts & vouchers", "Due alerts"],
    stepsAr: [
      "أنشئ الفاتورة واربطها بالعقد أو الوحدة.",
      "أرسلها للعميل للسداد.",
      "سجّل الدفع لإصدار سند القبض.",
    ],
    stepsEn: [
      "Create the invoice and link it to a contract/unit.",
      "Send it to the client for payment.",
      "Log the payment to issue the receipt voucher.",
    ],
    links: [
      { to: "/dashboard/invoices", labelAr: "الفواتير", labelEn: "Invoices" },
      { to: "/dashboard/vouchers", labelAr: "السندات", labelEn: "Vouchers" },
    ],
    category: "finance",
    hue: "from-warning/25 to-warning/10",
  },
  {
    id: "maintenance",
    to: "/dashboard/maintenance",
    icon: Wrench,
    titleAr: "الصيانة",
    titleEn: "Maintenance",
    descAr: "طلبات صيانة مربوطة بالعقار والوحدة والفنيّ.",
    descEn: "Requests linked to property, unit and technician.",
    longAr:
      "استقبل بلاغات الصيانة من المستأجرين، أسندها للفنيين، وتابع حالتها حتى الإغلاق.",
    longEn:
      "Receive maintenance tickets from tenants, assign technicians, and track them to closure.",
    featuresAr: ["طلبات", "فنيّون", "ربط بالوحدة"],
    featuresEn: ["Requests", "Technicians", "Unit linking"],
    stepsAr: [
      "افتح طلبًا جديدًا واربطه بالوحدة.",
      "اختر الفني المسؤول.",
      "حدّث الحالة حتى الإنجاز.",
    ],
    stepsEn: [
      "Open a new request and link it to the unit.",
      "Pick the responsible technician.",
      "Update status until completion.",
    ],
    links: [
      { to: "/dashboard/maintenance-log", labelAr: "سجل الصيانة", labelEn: "Maintenance log" },
      { to: "/dashboard/maintenance/technicians", labelAr: "الفنيون", labelEn: "Technicians" },
    ],
    category: "ops",
    hue: "from-destructive/25 to-pink-500/10",
  },
  {
    id: "reports",
    to: "/dashboard/reports",
    icon: BarChart3,
    titleAr: "التقارير",
    titleEn: "Reports",
    descAr: "قوالب تقارير تنفيذية وباني تقارير مخصص + PDF.",
    descEn: "Executive templates + custom builder with PDF export.",
    longAr:
      "قوالب تنفيذية جاهزة لأداء الشركة، مع باني تقارير مخصص وتصدير PDF لكل تقرير.",
    longEn:
      "Ready executive templates for company performance plus a custom report builder with PDF export.",
    featuresAr: ["قوالب جاهزة", "باني مخصص", "تصدير PDF"],
    featuresEn: ["Ready templates", "Custom builder", "PDF export"],
    stepsAr: [
      "افتح التقارير واختر قالبًا مناسبًا.",
      "خصص الفلاتر والفترة.",
      "صدّر التقرير PDF أو شاركه.",
    ],
    stepsEn: [
      "Open Reports and pick a template.",
      "Adjust filters and period.",
      "Export as PDF or share.",
    ],
    links: [
      { to: "/dashboard/reports/executive", labelAr: "التقرير التنفيذي", labelEn: "Executive report" },
      { to: "/dashboard/reports/templates", labelAr: "قوالب التقارير", labelEn: "Templates" },
    ],
    category: "core",
    hue: "from-info/25 to-primary/10",
  },
  {
    id: "analytics-builder",
    to: "/dashboard/reports/builder",
    icon: Sigma,
    titleAr: "باني تقارير التحليلات",
    titleEn: "Analytics Report Builder",
    descAr: "للمالية: أنشئ وجهات نظر مخصصة، احفظها كقوالب، وصدّر النتائج.",
    descEn: "For finance: build custom views, save as templates, and export results.",
    longAr:
      "أداة متقدمة لإنشاء تقارير تحليلية مخصصة مع اختيار الأعمدة والفلاتر وحفظ القوالب لإعادة الاستخدام.",
    longEn:
      "Advanced tool for building custom analytics with column selection, filters, and reusable saved views.",
    featuresAr: ["مصادر متعددة", "أعمدة وفلاتر", "قوالب محفوظة", "CSV/XLSX/JSON/PDF"],
    featuresEn: ["Multi source", "Columns & filters", "Saved views", "CSV/XLSX/JSON/PDF"],
    stepsAr: [
      "اختر مصدر البيانات.",
      "حدد الأعمدة وطبّق الفلاتر.",
      "احفظ التقرير كقالب أو صدّره.",
    ],
    stepsEn: [
      "Pick a data source.",
      "Select columns and apply filters.",
      "Save the view or export it.",
    ],
    links: [
      { to: "/dashboard/reports/templates", labelAr: "القوالب", labelEn: "Templates" },
      { to: "/dashboard/reports/preview", labelAr: "معاينة التقرير", labelEn: "Report preview" },
    ],
    category: "core",
    hue: "from-primary/25 to-fuchsia-500/10",
  },
  {
    id: "assistant",
    to: "/assistant",
    icon: Bot,
    titleAr: "المساعد الذكي",
    titleEn: "AI Assistant",
    descAr: "محادثة ثنائية اللغة مع SQL آمن حسب الدور.",
    descEn: "Bilingual chat with role-based safe SQL.",
    longAr:
      "حامد — مساعدك الذكي داخل المنصة. يجيب عن أسئلتك، ينفذ استعلامات آمنة حسب دورك، ويسجل كل تفاعل للتدقيق.",
    longEn:
      "Hamid — your in-platform AI. Answers questions, runs role-safe SQL, and logs every interaction for audit.",
    featuresAr: ["عربي/إنجليزي", "أدوات تنفيذ آمنة", "سجل تدقيق"],
    featuresEn: ["AR/EN", "Safe tool-calls", "Audit trail"],
    stepsAr: [
      "افتح المساعد من الشريط الجانبي.",
      "اكتب سؤالك بلغتك المفضلة.",
      "راجع النتيجة قبل الاعتماد.",
    ],
    stepsEn: [
      "Open the assistant from the sidebar.",
      "Type your question in your preferred language.",
      "Review the answer before acting on it.",
    ],
    links: [
      { to: "/assistant/scripts", labelAr: "السكربتات", labelEn: "Scripts" },
      { to: "/assistant/audit", labelAr: "سجل التدقيق", labelEn: "Audit log" },
    ],
    category: "ai",
    hue: "from-primary/25 to-primary/10",
  },
  {
    id: "listings",
    to: "/listings",
    icon: Megaphone,
    titleAr: "الإعلانات والعملاء المحتملون",
    titleEn: "Listings & Leads",
    descAr: "إعلانات عامة + طلبات المستأجرين + CRM.",
    descEn: "Public listings, tenant applications and CRM.",
    longAr:
      "انشر عقاراتك للجمهور، استقبل الطلبات، وحوّلها إلى صفقات عبر CRM كامل مع تتبع النشاط.",
    longEn:
      "Publish listings, receive applications, and convert them to deals in a full CRM with activity tracking.",
    featuresAr: ["إعلانات عامة", "طلبات مستأجرين", "CRM"],
    featuresEn: ["Public listings", "Tenant applications", "Leads CRM"],
    stepsAr: [
      "أنشئ إعلانًا واربطه بعقار.",
      "استقبل الطلبات في CRM.",
      "حوّل العميل المحتمل إلى صفقة.",
    ],
    stepsEn: [
      "Create a listing linked to a property.",
      "Receive applications in the CRM.",
      "Convert a lead to a deal.",
    ],
    links: [
      { to: "/dashboard/listings", labelAr: "إدارة الإعلانات", labelEn: "Listings admin" },
      { to: "/dashboard/crm/leads", labelAr: "العملاء المحتملون", labelEn: "Leads" },
    ],
    category: "growth",
    hue: "from-info/25 to-info/10",
  },
  {
    id: "auctions",
    to: "/dashboard/auctions",
    icon: Gavel,
    titleAr: "المزادات",
    titleEn: "Auctions",
    descAr: "مزادات عقارية مع فلاتر متقدمة.",
    descEn: "Property auctions with advanced filters.",
    longAr:
      "أنشئ مزادات عقارية، استقبل المزايدات، وتابع النتائج مع تقارير فلاتر متقدمة.",
    longEn:
      "Create property auctions, receive bids, and track outcomes with advanced filter reports.",
    featuresAr: ["إنشاء مزاد", "مزايدة", "فلاتر"],
    featuresEn: ["Create auction", "Bidding", "Filters"],
    stepsAr: [
      "أنشئ مزادًا جديدًا وأدخل الشروط.",
      "افتح باب المزايدة للفترة المحددة.",
      "راجع النتائج واعتمد الفائز.",
    ],
    stepsEn: [
      "Create a new auction with its terms.",
      "Open bidding for the chosen period.",
      "Review results and approve the winner.",
    ],
    links: [
      { to: "/dashboard/auctions/new", labelAr: "مزاد جديد", labelEn: "New auction" },
      { to: "/dashboard/auctions/reports", labelAr: "تقارير المزادات", labelEn: "Auction reports" },
    ],
    category: "growth",
    hue: "from-warning/25 to-destructive/10",
  },
  {
    id: "portals",
    to: "/dashboard",
    icon: Users,
    titleAr: "البوابات",
    titleEn: "Portals",
    descAr: "بوابات المستأجر والمالك والموظف والعميل الذكي.",
    descEn: "Tenant, owner, employee and AI client portals.",
    longAr:
      "بوابات مخصصة لكل نوع من المستخدمين: مستأجر، مالك، موظف، مع محتوى وأدوات تناسب دور كل واحد.",
    longEn:
      "Dedicated portals per user type — tenant, owner, employee — each with content and tools tailored to the role.",
    featuresAr: ["مستأجر", "مالك", "موظف", "عميل AI"],
    featuresEn: ["Tenant", "Owner", "Employee", "AI client"],
    stepsAr: [
      "أرسل دعوة للبوابة للعميل/الموظف.",
      "يفعل حسابه ويسجّل الدخول.",
      "تظهر له البيانات المرتبطة به فقط.",
    ],
    stepsEn: [
      "Send a portal invitation to the client/employee.",
      "They activate their account and sign in.",
      "They see only the data linked to them.",
    ],
    links: [
      { to: "/portal", labelAr: "البوابة", labelEn: "Portal" },
      { to: "/admin/portal-invitations", labelAr: "دعوات البوابة", labelEn: "Portal invitations" },
    ],
    category: "growth",
    hue: "from-success/25 to-success/10",
  },
  {
    id: "subscriptions",
    to: "/dashboard/settings/billing",
    icon: Sparkles,
    titleAr: "الاشتراكات والفوترة",
    titleEn: "Subscriptions & Billing",
    descAr: "خطط Starter/Pro/Enterprise مع تحويل بنكي يدوي.",
    descEn: "Starter/Pro/Enterprise plans via manual bank transfer.",
    longAr:
      "اختر خطتك، أرسل إيصال التحويل البنكي، ودع الفريق يعتمده لتفعيل الاشتراك تلقائيًا.",
    longEn:
      "Pick your plan, upload the bank transfer receipt, and the team approves it to activate the subscription.",
    featuresAr: ["خطط متعددة", "تحويل بنكي", "تجديد تلقائي"],
    featuresEn: ["Multiple plans", "Bank transfer", "Auto-renew"],
    stepsAr: [
      "افتح الفوترة واختر الخطة.",
      "ارفع إيصال التحويل البنكي.",
      "انتظر اعتماد الفريق للتفعيل.",
    ],
    stepsEn: [
      "Open billing and pick a plan.",
      "Upload the bank transfer receipt.",
      "Wait for team approval to activate.",
    ],
    links: [
      { to: "/dashboard/settings/billing", labelAr: "الفوترة", labelEn: "Billing" },
      { to: "/pricing", labelAr: "الأسعار", labelEn: "Pricing" },
    ],
    category: "finance",
    hue: "from-fuchsia-500/25 to-pink-500/10",
  },
  {
    id: "security",
    to: "/dashboard/settings",
    icon: ShieldCheck,
    titleAr: "الأمان",
    titleEn: "Security",
    descAr: "مصادقة ثنائية TOTP وأمان على مستوى الصفوف.",
    descEn: "TOTP 2FA and row-level security.",
    longAr:
      "فعّل المصادقة الثنائية، تحقق من الجلسات النشطة، وتأكد من عزل بيانات كل شركة عبر RLS.",
    longEn:
      "Enable 2FA, review active sessions, and rely on RLS to isolate each company's data.",
    featuresAr: ["2FA/TOTP", "RLS", "أدوار وصلاحيات"],
    featuresEn: ["2FA/TOTP", "RLS", "RBAC"],
    stepsAr: [
      "افتح إعدادات الأمان في البوابة.",
      "فعّل المصادقة الثنائية عبر تطبيقك.",
      "راجع الجلسات وسجل الدخول.",
    ],
    stepsEn: [
      "Open portal security settings.",
      "Enable 2FA using your authenticator app.",
      "Review sessions and login events.",
    ],
    links: [
      { to: "/portal/settings/security", labelAr: "إعدادات الأمان", labelEn: "Security settings" },
      { to: "/security/sessions", labelAr: "الجلسات", labelEn: "Sessions" },
    ],
    category: "admin",
    hue: "from-lime-500/25 to-success/10",
  },
  {
    id: "settings",
    to: "/dashboard/settings",
    icon: Settings,
    titleAr: "الإعدادات",
    titleEn: "Settings",
    descAr: "معلومات الشركة والفروع وواجهات API.",
    descEn: "Company info, branches and APIs.",
    longAr:
      "أدر بيانات الشركة، الفروع، مفاتيح الـAPI، وإعدادات زاتكا والاستيراد الجماعي.",
    longEn:
      "Manage company info, branches, API keys, ZATCA settings, and bulk import.",
    featuresAr: ["الشركة/الفروع", "API/زاتكا", "استيراد جماعي"],
    featuresEn: ["Company/branches", "APIs/ZATCA", "Bulk import"],
    stepsAr: [
      "افتح الإعدادات من القائمة الجانبية.",
      "حدث بيانات الشركة والفروع.",
      "أدر مفاتيح الـAPI حسب الحاجة.",
    ],
    stepsEn: [
      "Open Settings from the sidebar.",
      "Update company and branch details.",
      "Manage API keys as needed.",
    ],
    links: [
      { to: "/dashboard/settings/api-keys", labelAr: "مفاتيح API", labelEn: "API keys" },
      { to: "/dashboard/settings/zatca", labelAr: "زاتكا", labelEn: "ZATCA" },
    ],
    category: "admin",
    hue: "from-slate-400/25 to-slate-500/10",
  },
  {
    id: "admin",
    to: "/admin",
    icon: LayoutDashboard,
    titleAr: "لوحة الإدارة",
    titleEn: "Admin Panel",
    descAr: "الشركات، الاشتراكات، المقاييس، القوالب.",
    descEn: "Companies, subscriptions, metrics and templates.",
    longAr:
      "لوحة السوبر أدمن: إدارة الشركات، الاشتراكات، المقاييس، والقوالب على مستوى المنصة.",
    longEn:
      "Super-admin panel: manage companies, subscriptions, metrics, and platform-level templates.",
    featuresAr: ["الشركات", "الفوترة", "التشخيص"],
    featuresEn: ["Companies", "Billing", "Diagnostics"],
    stepsAr: [
      "افتح /admin (يشترط الصلاحيات).",
      "استعرض الشركات أو الاشتراكات.",
      "استخدم التشخيص لمعالجة أي مشكلة.",
    ],
    stepsEn: [
      "Open /admin (requires permissions).",
      "Browse companies or subscriptions.",
      "Use diagnostics to resolve issues.",
    ],
    links: [
      { to: "/admin/companies", labelAr: "الشركات", labelEn: "Companies" },
      { to: "/admin/subscriptions", labelAr: "الاشتراكات", labelEn: "Subscriptions" },
    ],
    category: "admin",
    hue: "from-destructive/25 to-destructive/10",
  },
];

export type HubCategoryKey = "all" | HubServiceCategory;

export const HUB_CATEGORIES: { key: HubCategoryKey; ar: string; en: string }[] = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "core", ar: "أساسية", en: "Core" },
  { key: "finance", ar: "مالية", en: "Finance" },
  { key: "ops", ar: "تشغيل", en: "Operations" },
  { key: "growth", ar: "نمو", en: "Growth" },
  { key: "ai", ar: "الذكاء الاصطناعي", en: "AI" },
  { key: "admin", ar: "الإدارة", en: "Admin" },
];

export function getHubService(id: string): HubService | undefined {
  return HUB_SERVICES.find((s) => s.id === id);
}
