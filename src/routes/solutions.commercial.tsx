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
          "إدارة المحلات والمكاتب والمجمعات التجارية على HBSpro: عقود إيجار متعددة السنوات، فوترة ZATCA، وتسجيل المصاريف التشغيلية.",
      },
      { property: "og:title", content: "حلول العقارات التجارية — HBSpro" },
      {
        property: "og:description",
        content: "إدارة المحلات والمكاتب مع فوترة ZATCA وتسجيل المصاريف التشغيلية.",
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
      titleAr="حلول متخصصة لإدارة المحلات والمكاتب والمجمعات"
      titleEn="Purpose-built to manage shops, offices, and complexes"
      subtitleAr="عقود إيجار داخلية متعددة السنوات، فوترة ضريبية ممتثلة لـ ZATCA، وتسجيل مصاريف تشغيلية لكل وحدة — بدقة عالية."
      subtitleEn="Internal multi-year leases, ZATCA-compliant tax invoices, and per-unit operating expenses — accurate and simple to operate."
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
          titleAr: "عقود إيجار متعددة السنوات",
          titleEn: "Multi-year leases",
          descAr: "زيادة سنوية تلقائية، خيارات تجديد، وشروط إنهاء مبكر.",
          descEn: "Automatic annual escalation, renewal options, and early-termination clauses.",
        },
        {
          icon: Receipt,
          titleAr: "تسجيل المصاريف التشغيلية",
          titleEn: "Operating expense tracking",
          descAr: "كهرباء، تكييف، أمن، نظافة — مصنّفة لكل وحدة ومجمّع.",
          descEn: "Utilities, HVAC, security, cleaning — categorized per unit and complex.",
        },
        {
          icon: Calculator,
          titleAr: "ضريبة القيمة المضافة",
          titleEn: "VAT handling",
          descAr: "احتساب تلقائي بنسبة 15% على الإيجار والمصاريف، وتقارير VAT جاهزة للإقرار.",
          descEn: "Automatic 15% on rent and expenses, VAT reports ready for filing.",
        },
        {
          icon: BarChart3,
          titleAr: "إشغال المجمعات",
          titleEn: "Complex occupancy",
          descAr: "مؤشرات الإشغال لكل طابق ومجمع مع صافي الدخل بعد المصاريف.",
          descEn: "Per-floor and per-complex occupancy with net income after expenses.",
        },
        {
          icon: ShieldCheck,
          titleAr: "الأرشيف الإلكتروني",
          titleEn: "E-archive",
          descAr: "احفظ كل العقود والفواتير وإيصالات المصاريف المصدّقة لسنوات.",
          descEn: "Store leases, invoices, and stamped expense receipts for years.",
        },
      ]}
    />
  ),
});
