import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Building2, Users, ClipboardList, CalendarClock, Wrench, Receipt } from "lucide-react";

export const Route = createFileRoute("/solutions/property-managers")({
  head: () => ({
    meta: [
      { title: "حلول مدراء العقارات — HBSpro | Solutions for Property Managers" },
      {
        name: "description",
        content:
          "أدوات مدير العقارات في HBSpro: تسجيل المصاريف، متابعة الصيانة، جدولة عقود الإيجار، وتقارير أداء لكل عقار.",
      },
      { property: "og:title", content: "حلول مدراء العقارات — HBSpro" },
      {
        property: "og:description",
        content: "تسجيل المصاريف، متابعة الصيانة، وتقارير الأداء لمدراء العقارات.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/solutions/property-managers" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/solutions/property-managers" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="لمدراء العقارات"
      eyebrowEn="For property managers"
      titleAr="أدر محفظتك بالكامل من شاشة واحدة"
      titleEn="Manage your entire portfolio from one screen"
      subtitleAr="من طلبات الصيانة وتسجيل المصاريف إلى تجديد عقود الإيجار ومتابعة التحصيل — كل ما يحتاجه مدير العقارات لتشغيل يومي منظّم."
      subtitleEn="From maintenance and expense entry to lease renewals and collections — everything a property manager needs for an organized day."
      features={[
        {
          icon: Building2,
          titleAr: "محفظة موحّدة",
          titleEn: "Unified portfolio",
          descAr: "اطّلع على كل العقارات والوحدات والملاك الذين تديرهم في مكان واحد.",
          descEn: "See every property, unit, and owner you manage in one place.",
        },
        {
          icon: Users,
          titleAr: "إدارة الفريق",
          titleEn: "Team management",
          descAr: "أدوار وصلاحيات دقيقة للموظفين والفنيين ومسؤولي المحاسبة.",
          descEn: "Granular roles for staff, technicians, and accountants.",
        },
        {
          icon: Receipt,
          titleAr: "تسجيل المصاريف",
          titleEn: "Expense tracking",
          descAr: "أدخل مصاريف الصيانة والرسوم والخدمات مع إرفاق الفواتير لكل وحدة.",
          descEn: "Log maintenance, fees, and services with receipts attached per unit.",
        },
        {
          icon: ClipboardList,
          titleAr: "قائمة المهام اليومية",
          titleEn: "Daily task list",
          descAr: "المهام المستحقة اليوم — تجديدات، متأخرات، صيانة — في تدفق واحد.",
          descEn: "Today's tasks — renewals, arrears, maintenance — in one feed.",
        },
        {
          icon: CalendarClock,
          titleAr: "تنبيهات تجديد عقود الإيجار",
          titleEn: "Lease renewal alerts",
          descAr: "تنبيهات مبكرة قبل انتهاء كل عقد بـ 30 و 60 و 90 يوماً.",
          descEn: "Early alerts 30, 60, and 90 days before each lease ends.",
        },
        {
          icon: Wrench,
          titleAr: "تتبع الصيانة",
          titleEn: "Maintenance tracking",
          descAr: "من فتح البلاغ إلى إغلاقه، مع صور قبل وبعد وتكلفة مسجّلة في المصاريف.",
          descEn: "From ticket open to close, with before/after photos and cost recorded as expense.",
        },
      ]}
    />
  ),
});
