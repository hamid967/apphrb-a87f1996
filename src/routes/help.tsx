import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  Building2,
  BookOpen,
  CreditCard,
  Users,
  ShieldCheck,
  Wrench,
  FileText,
  MessageSquare,
} from "lucide-react";

const TOPICS = [
  {
    icon: BookOpen,
    titleAr: "البداية السريعة",
    titleEn: "Getting started",
    descAr: "أنشئ حسابك، أضف أول عقار، وادعُ فريقك خلال 10 دقائق.",
    descEn: "Create your account, add your first property, and invite your team in 10 minutes.",
  },
  {
    icon: Building2,
    titleAr: "إدارة العقارات والوحدات",
    titleEn: "Managing properties & units",
    descAr: "طرق تنظيم المباني، الطوابق، الوحدات، وربطها بالملاك.",
    descEn: "How to organize buildings, floors, units, and link them to owners.",
  },
  {
    icon: Users,
    titleAr: "المستأجرون والعقود",
    titleEn: "Tenants & contracts",
    descAr: "إنشاء عقد، جدولة الدفعات، والتجديد التلقائي.",
    descEn: "Create a contract, schedule payments, and auto-renew.",
  },
  {
    icon: CreditCard,
    titleAr: "الاشتراك والدفع",
    titleEn: "Subscription & billing",
    descAr: "كيف تدفع الاشتراك بالتحويل البنكي وترسل إيصال الاعتماد.",
    descEn: "Pay via bank transfer and submit the receipt for approval.",
  },
  {
    icon: FileText,
    titleAr: "الفوترة الإلكترونية ZATCA",
    titleEn: "ZATCA e-invoicing",
    descAr: "ربط شهادة CSID وإصدار الفواتير الضريبية الممتثلة.",
    descEn: "Connect your CSID certificate and issue compliant tax invoices.",
  },
  {
    icon: Wrench,
    titleAr: "الصيانة والطلبات",
    titleEn: "Maintenance & requests",
    descAr: "استقبال طلبات المستأجرين، تعيين الفنيين، وتتبع الحالة.",
    descEn: "Receive tenant requests, assign technicians, and track status.",
  },
  {
    icon: ShieldCheck,
    titleAr: "الأمان والصلاحيات",
    titleEn: "Security & permissions",
    descAr: "تفعيل التحقق الثنائي وضبط أدوار الموظفين.",
    descEn: "Enable 2FA and configure staff roles.",
  },
  {
    icon: MessageSquare,
    titleAr: "الدعم الفني",
    titleEn: "Getting support",
    descAr: "كيف تفتح تذكرة دعم من داخل المنصة ومتى نرد.",
    descEn: "How to open a support ticket in-app and our response times.",
  },
];

function HelpPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5" />
            <span>HBSpro</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/faq" className="text-muted-foreground hover:text-foreground">
              {isAr ? "الأسئلة الشائعة" : "FAQ"}
            </Link>
            <Link to="/contact" className="text-muted-foreground hover:text-foreground">
              {isAr ? "تواصل معنا" : "Contact"}
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              {isAr ? "الأسعار" : "Pricing"}
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
          {isAr ? "مركز المساعدة" : "Help Center"}
        </div>
        <h1 className="text-display text-4xl sm:text-5xl">
          {isAr ? "كيف يمكننا مساعدتك؟" : "How can we help?"}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {isAr
            ? "أدلة قصيرة لكل ما تحتاج معرفته لتشغيل عملياتك على HBSpro بكفاءة."
            : "Short guides for everything you need to run your operations on HBSpro efficiently."}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TOPICS.map((t) => (
            <div
              key={t.titleEn}
              className="rounded-xl border border-border/60 bg-card/40 p-6 transition hover:border-primary/50"
            >
              <t.icon className="mb-3 h-6 w-6 text-primary" />
              <div className="mb-1 font-semibold">{isAr ? t.titleAr : t.titleEn}</div>
              <p className="text-sm text-muted-foreground">{isAr ? t.descAr : t.descEn}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-border/60 bg-card/40 p-8 text-center">
          <h2 className="text-2xl font-semibold">
            {isAr ? "لم تجد ما تبحث عنه؟" : "Didn't find what you need?"}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {isAr
              ? "فريق الدعم متاح من الأحد إلى الخميس، 9 صباحاً – 6 مساءً بتوقيت الرياض."
              : "Support is available Sunday–Thursday, 9am–6pm Riyadh time."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {isAr ? "تواصل مع الدعم" : "Contact support"}
            </Link>
            <Link
              to="/faq"
              className="inline-flex items-center rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-card"
            >
              {isAr ? "الأسئلة الشائعة" : "Read FAQ"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "مركز المساعدة — HBSpro | Help Center" },
      {
        name: "description",
        content:
          "مركز المساعدة لمنصة HBSpro: أدلة سريعة للبداية، إدارة العقارات، الفوترة الإلكترونية، والدعم الفني.",
      },
      { property: "og:title", content: "مركز المساعدة — HBSpro" },
      {
        property: "og:description",
        content: "أدلة سريعة لتشغيل عمليات إدارة أملاكك على HBSpro.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/help" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/help" }],
  }),
  component: HelpPage,
});
