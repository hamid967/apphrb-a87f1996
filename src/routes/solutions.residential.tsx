import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Home, Receipt, CalendarDays, Wrench, Bell, Smartphone } from "lucide-react";

export const Route = createFileRoute("/solutions/residential")({
  head: () => ({
    meta: [
      { title: "حلول العقارات السكنية — HBSpro | Solutions for Residential" },
      {
        name: "description",
        content:
          "إدارة الشقق والفلل والمجمعات السكنية على HBSpro: عقود إيجار داخلية، تسجيل المصاريف، وتذكيرات الإيجار الشهرية.",
      },
      { property: "og:title", content: "حلول العقارات السكنية — HBSpro" },
      {
        property: "og:description",
        content: "إدارة الشقق والفلل مع تذكيرات إيجار شهرية وتسجيل مصاريف وبوابة مستأجر.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/solutions/residential" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/solutions/residential" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للعقارات السكنية"
      eyebrowEn="For residential"
      titleAr="أدر الشقق والفلل بسلاسة كاملة"
      titleEn="Manage apartments and villas seamlessly"
      subtitleAr="من عقد الإيجار الداخلي إلى تحصيل الإيجار الشهري وتسجيل مصاريف الصيانة — تشغيل منظّم وتجربة مستأجر عصرية عبر بوابة مخصصة."
      subtitleEn="From the internal lease to monthly rent collection and maintenance expense tracking — organized operations and a modern tenant portal."
      features={[
        {
          icon: Home,
          titleAr: "أنواع سكنية متعددة",
          titleEn: "All residential types",
          descAr: "شقق، فلل، دبلوكسات، غرف مفروشة — كل نوع بترتيبه.",
          descEn: "Apartments, villas, duplexes, furnished rooms — each with its own setup.",
        },
        {
          icon: CalendarDays,
          titleAr: "جدولة الإيجار الشهري",
          titleEn: "Monthly rent scheduling",
          descAr: "دفعات مجدولة تلقائياً مع تقويم هجري وميلادي.",
          descEn: "Auto-scheduled payments with both Hijri and Gregorian calendars.",
        },
        {
          icon: Receipt,
          titleAr: "تسجيل مصاريف الوحدة",
          titleEn: "Per-unit expense tracking",
          descAr: "سجّل مصاريف الصيانة والخدمات لكل شقة وفيلا مع إرفاق الفواتير.",
          descEn: "Log maintenance and service expenses per apartment or villa with receipts.",
        },
        {
          icon: Bell,
          titleAr: "تذكيرات الإيجار",
          titleEn: "Rent reminders",
          descAr: "تذكيرات آلية للمستأجر عبر SMS وواتساب قبل الاستحقاق.",
          descEn: "Automatic SMS and WhatsApp reminders before due date.",
        },
        {
          icon: Wrench,
          titleAr: "طلبات صيانة سريعة",
          titleEn: "Fast maintenance requests",
          descAr: "يفتح المستأجر بلاغاً بالصور من هاتفه والتكلفة تُقيَّد تلقائياً في المصاريف.",
          descEn: "Tenants open tickets with photos; cost is auto-posted as an expense.",
        },
        {
          icon: Smartphone,
          titleAr: "بوابة المستأجر",
          titleEn: "Tenant portal",
          descAr: "الفواتير، الإيصالات، عقد الإيجار، والطلبات — في تطبيق ويب مخصص.",
          descEn: "Invoices, receipts, lease contract, and requests — in a dedicated web app.",
        },
      ]}
    />
  ),
});
