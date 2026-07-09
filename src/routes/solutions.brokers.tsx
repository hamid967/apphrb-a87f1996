import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Users2, Target, MessageCircle, Handshake, Calendar, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/solutions/brokers")({
  head: () => ({
    meta: [
      { title: "حلول الوسطاء العقاريين — Aqari | Solutions for Brokers" },
      {
        name: "description",
        content:
          "عقاري Aqari للوسطاء: CRM كامل للعملاء المحتملين، جدولة المعاينات، تتبع العمولات، وأتمتة المتابعة عبر WhatsApp.",
      },
      { property: "og:title", content: "حلول الوسطاء — Aqari" },
      {
        property: "og:description",
        content: "CRM، معاينات، عمولات، وأتمتة WhatsApp لوسطاء العقارات.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://apphrb.lovable.app/solutions/brokers" },
    ],
    links: [{ rel: "canonical", href: "https://apphrb.lovable.app/solutions/brokers" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للوسطاء"
      eyebrowEn="For brokers"
      titleAr="حوّل كل عميل محتمل إلى صفقة"
      titleEn="Turn every lead into a deal"
      subtitleAr="أدوات مبنية لسير عمل الوسيط: من التقاط العميل، جدولة المعاينة، إغلاق الصفقة، وحساب العمولة تلقائياً."
      subtitleEn="Tools built for the broker workflow: capture the lead, book a viewing, close the deal, calculate commission — automatically."
      features={[
        {
          icon: Users2,
          titleAr: "CRM للعملاء المحتملين",
          titleEn: "Lead CRM",
          descAr: "قنوات، حالات، وتحليلات معدل التحويل لكل مصدر.",
          descEn: "Pipelines, stages, and conversion analytics per source.",
        },
        {
          icon: Calendar,
          titleAr: "جدولة المعاينات",
          titleEn: "Viewings scheduler",
          descAr: "احجز معاينات مع تنبيه العميل والوسيط قبل الموعد.",
          descEn: "Book viewings with automated reminders for both parties.",
        },
        {
          icon: MessageCircle,
          titleAr: "أتمتة WhatsApp",
          titleEn: "WhatsApp automation",
          descAr: "قوالب مسبقة تُرسَل تلقائياً عند تحديث حالة الصفقة.",
          descEn: "Pre-built templates that fire on deal-stage changes.",
        },
        {
          icon: Handshake,
          titleAr: "إدارة الصفقات",
          titleEn: "Deals pipeline",
          descAr: "من عرض أول حتى توقيع العقد — بدون فقدان أي معلومة.",
          descEn: "From first offer to signed contract — nothing falls through.",
        },
        {
          icon: Target,
          titleAr: "حساب العمولات",
          titleEn: "Commission engine",
          descAr: "احسب عمولات الوسطاء تلقائياً بحسب قواعد الشركة.",
          descEn: "Auto-calculate broker commissions using your firm's rules.",
        },
        {
          icon: TrendingUp,
          titleAr: "لوحة أداء الفريق",
          titleEn: "Team performance",
          descAr: "قارن أداء الوسطاء بمؤشرات صفقات، إيراد، ومعدل الإغلاق.",
          descEn: "Compare broker performance by deals, revenue, and close rate.",
        },
      ]}
    />
  ),
});
