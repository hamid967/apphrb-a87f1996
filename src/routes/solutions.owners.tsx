import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Home, Wallet, FileText, BarChart3, Bell, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/solutions/owners")({
  head: () => ({
    meta: [
      { title: "حلول ملاك العقارات — Aqari | Solutions for Owners" },
      {
        name: "description",
        content:
          "بوابة الملاك في عقاري Aqari: كشوف حساب شهرية، تتبع الإيرادات، وتقارير الأداء لكل عقار — من مكان واحد.",
      },
      { property: "og:title", content: "حلول ملاك العقارات — Aqari" },
      {
        property: "og:description",
        content: "بوابة الملاك، كشوف حساب، وتقارير أداء العقارات في مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://apphrb.lovable.app/solutions/owners" },
    ],
    links: [{ rel: "canonical", href: "https://apphrb.lovable.app/solutions/owners" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للملاك"
      eyebrowEn="For owners"
      titleAr="اطّلع على أداء عقاراتك — لحظياً"
      titleEn="See your properties perform — in real time"
      subtitleAr="بوابة الملاك تعطيك رؤية كاملة: الإيرادات، النفقات، الإشغال، وحالة كل عقد بدون الحاجة لطلب تقارير."
      subtitleEn="Owner portal gives you full visibility: revenue, expenses, occupancy, and contract status — no reports needed."
      features={[
        {
          icon: Home,
          titleAr: "ملخّص العقارات",
          titleEn: "Property overview",
          descAr: "كل عقاراتك مع مؤشرات الأداء الرئيسية في لوحة واحدة.",
          descEn: "All properties with headline KPIs on one dashboard.",
        },
        {
          icon: Wallet,
          titleAr: "كشوف حساب شهرية",
          titleEn: "Monthly statements",
          descAr: "تُولَّد آلياً وتُرسَل بريدياً في نهاية كل شهر.",
          descEn: "Auto-generated and emailed at the end of every month.",
        },
        {
          icon: FileText,
          titleAr: "العقود النشطة",
          titleEn: "Active contracts",
          descAr: "اطلع على كل العقود ومواعيد التجديد.",
          descEn: "See every contract and its renewal date.",
        },
        {
          icon: BarChart3,
          titleAr: "تقارير الأداء",
          titleEn: "Performance reports",
          descAr: "مقارنة الإيرادات شهرياً وسنوياً.",
          descEn: "Compare revenue month-over-month and year-over-year.",
        },
        {
          icon: Bell,
          titleAr: "تنبيهات فورية",
          titleEn: "Instant alerts",
          descAr: "إشعارات عند استحقاق الدفعات أو انتهاء العقود.",
          descEn: "Get notified when payments are due or contracts expire.",
        },
        {
          icon: ShieldCheck,
          titleAr: "خصوصية كاملة",
          titleEn: "Full privacy",
          descAr: "ترى بيانات عقاراتك فقط — عزل تام على مستوى قاعدة البيانات.",
          descEn: "You see only your property data — strict database-level isolation.",
        },
      ]}
    />
  ),
});
