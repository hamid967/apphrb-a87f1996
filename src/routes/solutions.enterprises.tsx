import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/marketing/SolutionPage";
import { Building2, ShieldCheck, Users2, BarChart3, Database, Lock } from "lucide-react";

export const Route = createFileRoute("/solutions/enterprises")({
  head: () => ({
    meta: [
      { title: "حلول الشركات الكبرى — HBSpro | Enterprise Solutions" },
      {
        name: "description",
        content:
          "HBSpro للمؤسسات: دعم متعدد الفروع، صلاحيات دقيقة (RBAC)، تكامل ZATCA، وSSO — بمستوى أمان مؤسسي.",
      },
      { property: "og:title", content: "حلول الشركات الكبرى — HBSpro" },
      {
        property: "og:description",
        content: "متعدد الفروع، صلاحيات مؤسسية، تكامل ZATCA، وSSO لشركات العقارات الكبرى.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://apphrb.lovable.app/solutions/enterprises" },
    ],
    links: [{ rel: "canonical", href: "https://apphrb.lovable.app/solutions/enterprises" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للشركات الكبرى"
      eyebrowEn="For enterprises"
      titleAr="منصة واحدة لكل فروعك — بمستوى أمان مؤسسي"
      titleEn="One platform for every branch — with enterprise-grade security"
      subtitleAr="مصممة للشركات متعددة الفروع مع تحكم صارم في الصلاحيات، تكامل حكومي، وسجلات تدقيق شاملة."
      subtitleEn="Built for multi-branch companies with fine-grained access control, government integrations, and full audit trails."
      features={[
        {
          icon: Building2,
          titleAr: "متعدد الفروع",
          titleEn: "Multi-branch",
          descAr: "افصل بيانات كل فرع مع تجميع تقارير على مستوى الشركة.",
          descEn: "Isolate branch data while rolling up reports at company level.",
        },
        {
          icon: Users2,
          titleAr: "صلاحيات دقيقة (RBAC)",
          titleEn: "Fine-grained RBAC",
          descAr: "أدوار مخصّصة وصلاحيات لكل موظف بحسب المسؤولية.",
          descEn: "Custom roles and permissions per employee responsibility.",
        },
        {
          icon: ShieldCheck,
          titleAr: "أمان على مستوى المؤسسة",
          titleEn: "Enterprise security",
          descAr: "2FA إلزامي، سجلات دخول، وسجل تدقيق كامل.",
          descEn: "Enforced 2FA, login history, and comprehensive audit log.",
        },
        {
          icon: Database,
          titleAr: "تكامل ZATCA",
          titleEn: "ZATCA integration",
          descAr: "فوترة إلكترونية متوافقة مع المرحلة الثانية لهيئة الزكاة.",
          descEn: "E-invoicing compliant with ZATCA Phase 2.",
        },
        {
          icon: Lock,
          titleAr: "SSO و SAML",
          titleEn: "SSO & SAML",
          descAr: "تسجيل دخول موحّد عبر مزود هويتك الحالي.",
          descEn: "Single sign-on through your existing identity provider.",
        },
        {
          icon: BarChart3,
          titleAr: "تقارير تنفيذية",
          titleEn: "Executive reporting",
          descAr: "لوحات KPI للإدارة العليا ومقارنات بين الفروع.",
          descEn: "C-suite KPI boards with cross-branch comparisons.",
        },
      ]}
    />
  ),
});
