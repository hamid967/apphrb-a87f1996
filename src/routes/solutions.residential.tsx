import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Home, Users, CalendarDays, Wrench, Bell, Smartphone } from "lucide-react";

export const Route = createFileRoute("/solutions/residential")({
  head: () => ({
    meta: [
      { title: "حلول العقارات السكنية — HBSpro | Solutions for Residential" },
      {
        name: "description",
        content:
          "إدارة الشقق والفلل والمجمعات السكنية على HBSpro: عقود سنوية، طلبات صيانة، وتذكيرات الإيجار الشهرية.",
      },
      { property: "og:title", content: "حلول العقارات السكنية — HBSpro" },
      {
        property: "og:description",
        content: "إدارة الشقق والفلل مع تذكيرات إيجار شهرية وبوابة مستأجر.",
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
      subtitleAr="من توقيع العقد إلى تحصيل الإيجار الشهري وطلبات الصيانة — تجربة مستأجر عصرية عبر بوابة مخصصة."
      subtitleEn="From contract signing to monthly rent collection and maintenance requests — a modern tenant experience via a dedicated portal."
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
          descAr: "يفتح المستأجر بلاغاً بالصور من هاتفه ويتابع الحالة مباشرة.",
          descEn: "Tenants open a ticket with photos from their phone and track status live.",
        },
        {
          icon: Smartphone,
          titleAr: "بوابة المستأجر",
          titleEn: "Tenant portal",
          descAr: "الفواتير، الإيصالات، العقد، والطلبات — في تطبيق ويب مخصص.",
          descEn: "Invoices, receipts, contract, and requests — in a dedicated web app.",
        },
        {
          icon: Users,
          titleAr: "إدارة الضيوف والزوّار",
          titleEn: "Guest & visitor management",
          descAr: "سجّل الزوّار المتكررين وتحكم بالدخول في المجمعات المسوّرة.",
          descEn: "Log recurring visitors and control access in gated communities.",
        },
      ]}
    />
  ),
});
