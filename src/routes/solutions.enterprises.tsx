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
          "HBSpro للمؤسسات: إدارة أملاك متعددة الفروع، صلاحيات دقيقة (RBAC)، تكامل ZATCA، ومركز مصاريف موحّد بمستوى أمان مؤسسي.",
      },
      { property: "og:title", content: "حلول الشركات الكبرى — HBSpro" },
      {
        property: "og:description",
        content: "إدارة أملاك متعددة الفروع، صلاحيات مؤسسية، تكامل ZATCA، ومركز مصاريف موحّد.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/solutions/enterprises" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/solutions/enterprises" }],
  }),
  component: () => (
    <SolutionPage
      eyebrowAr="للشركات الكبرى"
      eyebrowEn="For enterprises"
      titleAr="منصة واحدة لإدارة أملاك كل فروعك"
      titleEn="One platform to manage every branch's properties"
      subtitleAr="مصممة للشركات متعددة الفروع مع مركز مصاريف موحّد، تحكم صارم في الصلاحيات، وسجلات تدقيق شاملة."
      subtitleEn="Built for multi-branch companies with a unified expense center, fine-grained access control, and full audit trails."
      features={[
        {
          icon: Building2,
          titleAr: "متعدد الفروع",
          titleEn: "Multi-branch",
          descAr: "افصل بيانات كل فرع مع تجميع تقارير الإيرادات والمصاريف على مستوى الشركة.",
          descEn: "Isolate branch data while rolling up income and expenses at company level.",
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
          descAr: "2FA إلزامي، سجلات دخول، وسجل تدقيق كامل لكل مصروف وإجراء.",
          descEn: "Enforced 2FA, login history, and full audit log on every expense and action.",
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
          descAr: "لوحات KPI للإيرادات والمصاريف والإشغال ومقارنات بين الفروع.",
          descEn: "C-suite KPI boards for revenue, expenses, occupancy, and cross-branch comparisons.",
        },
      ]}
    />
  ),
});
