import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Home, Wallet, FileText, BarChart3, Bell, Receipt } from "lucide-react";

export const Route = createFileRoute("/solutions/owners")({
  head: () => ({
    meta: [
      { title: "حلول ملاك العقارات — HBSpro | Solutions for Owners" },
      {
        name: "description",
        content:
          "بوابة الملاك في HBSpro: كشوف حساب شهرية، تتبع الإيرادات والمصاريف، وتقارير أداء لكل عقار تحت الإدارة.",
      },
      { property: "og:title", content: "حلول ملاك العقارات — HBSpro" },
      {
        property: "og:description",
        content: "بوابة الملاك، كشوف حساب، تسجيل المصاريف، وتقارير أداء العقارات في مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/solutions/owners" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/solutions/owners" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للملاك"
      eyebrowEn="For owners"
      titleAr="اطّلع على أداء أملاكك — لحظياً"
      titleEn="See your properties perform — in real time"
      subtitleAr="بوابة الملاك تعطيك رؤية كاملة على الإيرادات والمصاريف والإشغال لكل عقار تديره — بدون الحاجة لطلب تقارير."
      subtitleEn="Owner portal gives full visibility into income, expenses, and occupancy for every property you manage — no reports needed."
      features={[
        {
          icon: Home,
          titleAr: "ملخّص العقارات المُدارة",
          titleEn: "Managed properties overview",
          descAr: "كل الوحدات التي تديرها مع مؤشرات الأداء في لوحة واحدة.",
          descEn: "All managed units with headline KPIs on one dashboard.",
        },
        {
          icon: Wallet,
          titleAr: "كشوف حساب شهرية",
          titleEn: "Monthly statements",
          descAr: "صافي الدخل بعد المصاريف، تُولَّد آلياً في نهاية كل شهر.",
          descEn: "Net income after expenses, auto-generated at month end.",
        },
        {
          icon: Receipt,
          titleAr: "تسجيل المصاريف",
          titleEn: "Expense tracking",
          descAr: "صيانة، رسوم حكومية، خدمات — مصنّفة لكل عقار ووحدة.",
          descEn: "Maintenance, government fees, services — categorized per property and unit.",
        },
        {
          icon: FileText,
          titleAr: "عقود الإيجار النشطة",
          titleEn: "Active lease contracts",
          descAr: "اطلع على كل العقود ومواعيد التجديد.",
          descEn: "See every lease and its renewal date.",
        },
        {
          icon: BarChart3,
          titleAr: "تقارير الأداء",
          titleEn: "Performance reports",
          descAr: "مقارنة الإيرادات والمصاريف شهرياً وسنوياً.",
          descEn: "Compare income and expenses month-over-month and year-over-year.",
        },
        {
          icon: Bell,
          titleAr: "تنبيهات فورية",
          titleEn: "Instant alerts",
          descAr: "إشعارات عند استحقاق الدفعات، انتهاء العقود، أو تجاوز حد المصاريف.",
          descEn: "Alerts on due payments, contract expiry, or expense-limit breaches.",
        },
      ]}
    />
  ),
});
