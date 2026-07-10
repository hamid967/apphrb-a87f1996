import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Store, Receipt, FileSignature, Calculator, BarChart3, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/solutions/commercial")({
  head: () => ({
    meta: [
      { title: "حلول العقارات التجارية — HBSpro | Solutions for Commercial Real Estate" },
      {
        name: "description",
        content:
          "إدارة المحلات والمكاتب والمجمعات التجارية على HBSpro: عقود متعددة السنوات، فوترة ZATCA، وضريبة القيمة المضافة.",
      },
      { property: "og:title", content: "حلول العقارات التجارية — HBSpro" },
      {
        property: "og:description",
        content: "إدارة المحلات والمكاتب مع فوترة ZATCA وضريبة القيمة المضافة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/solutions/commercial" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/solutions/commercial" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للعقارات التجارية"
      eyebrowEn="For commercial real estate"
      titleAr="حلول متخصصة للمحلات والمكاتب والمجمعات"
      titleEn="Purpose-built for shops, offices, and complexes"
      subtitleAr="عقود متعددة السنوات، فوترة ضريبية ممتثلة لـ ZATCA، وحسابات مستأجرين تجاريين — بدقة عالية وبساطة تشغيلية."
      subtitleEn="Multi-year contracts, ZATCA-compliant tax invoices, and commercial tenant ledgers — accurate and simple to operate."
      features={[
        {
          icon: Store,
          titleAr: "أنواع وحدات تجارية",
          titleEn: "Commercial unit types",
          descAr: "محلات، مكاتب، مستودعات، شوروم — كل نوع بحقوله المخصصة.",
          descEn: "Shops, offices, warehouses, showrooms — each with its own fields.",
        },
        {
          icon: FileSignature,
          titleAr: "عقود متعددة السنوات",
          titleEn: "Multi-year contracts",
          descAr: "زيادة سنوية تلقائية، خيارات تجديد، وشروط إنهاء مبكر.",
          descEn: "Automatic annual escalation, renewal options, and early-termination clauses.",
        },
        {
          icon: Receipt,
          titleAr: "فوترة ZATCA المرحلة الثانية",
          titleEn: "ZATCA Phase-2 invoicing",
          descAr: "فواتير ضريبية موقّعة إلكترونياً ومُرسَلة لبوابة فاتورة.",
          descEn: "E-signed tax invoices submitted to the Fatoora portal.",
        },
        {
          icon: Calculator,
          titleAr: "ضريبة القيمة المضافة",
          titleEn: "VAT handling",
          descAr: "احتساب تلقائي بنسبة 15%، تقارير VAT جاهزة للإقرار.",
          descEn: "Automatic 15% calculation, VAT reports ready for filing.",
        },
        {
          icon: BarChart3,
          titleAr: "إشغال المجمعات",
          titleEn: "Complex occupancy",
          descAr: "مؤشرات الإشغال لكل طابق ومجمع مع تحليل الوحدات الأعلى إيراداً.",
          descEn: "Per-floor and per-complex occupancy with top-earning unit analysis.",
        },
        {
          icon: ShieldCheck,
          titleAr: "الأرشيف الإلكتروني",
          titleEn: "E-archive",
          descAr: "احفظ كل العقود والفواتير والمستندات المصدّقة لسنوات.",
          descEn: "Store contracts, invoices, and stamped documents for years.",
        },
      ]}
    />
  ),
});
