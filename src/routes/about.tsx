import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Building2, Target, Heart, Users2, Sparkles, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "من نحن — عقاري Aqari | About Aqari" },
      {
        name: "description",
        content:
          "تعرّف على قصة عقاري Aqari من HRHBS: منصة سحابية سعودية لإدارة العقارات بالذكاء الاصطناعي، ورؤيتنا لتحويل قطاع العقارات.",
      },
      { property: "og:title", content: "من نحن — عقاري Aqari" },
      {
        property: "og:description",
        content:
          "قصة عقاري Aqari، رؤيتنا ورسالتنا، والفريق الذي يبني نظام التشغيل الذكي للعقار السعودي.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://apphrb.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://apphrb.lovable.app/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const values = [
    {
      icon: Target,
      titleAr: "التركيز على العميل",
      titleEn: "Customer obsession",
      descAr: "كل قرار منتج يبدأ من سؤال: هل يجعل حياة عملائنا أسهل؟",
      descEn: "Every product decision starts with: does it make our customers' life easier?",
    },
    {
      icon: ShieldCheck,
      titleAr: "الأمان أولاً",
      titleEn: "Security first",
      descAr: "بنية متعددة المستأجرين بعزل صارم وحماية على مستوى قاعدة البيانات.",
      descEn: "Multi-tenant architecture with strict isolation and database-level protection.",
    },
    {
      icon: Sparkles,
      titleAr: "الابتكار المستمر",
      titleEn: "Continuous innovation",
      descAr: "نُطلق تحديثات أسبوعية ونستمع لملاحظاتكم لتحسين كل جزء من المنصة.",
      descEn: "We ship weekly and listen to your feedback to improve every corner of the platform.",
    },
    {
      icon: Heart,
      titleAr: "شغف بالقطاع",
      titleEn: "Passion for real estate",
      descAr: "فريقنا يجمع بين خبرة القطاع العقاري وأحدث تقنيات البرمجيات.",
      descEn: "Our team blends deep real-estate experience with cutting-edge software craft.",
    },
  ];

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5" />
            <span>Aqari</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/services" className="text-muted-foreground hover:text-foreground">
              {isAr ? "الخدمات" : "Services"}
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              {isAr ? "الأسعار" : "Pricing"}
            </Link>
            <Link to="/contact" className="text-muted-foreground hover:text-foreground">
              {isAr ? "تواصل" : "Contact"}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <h1 className="text-display text-4xl sm:text-5xl">
            {isAr ? "نبني نظام التشغيل الذكي للعقار السعودي" : "Building the smart OS for Saudi real estate"}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {isAr
              ? "عقاري Aqari منتج من HRHBS يجمع إدارة العقارات، العقود، المدفوعات، المستأجرين، والتقارير في منصة واحدة مدعومة بالذكاء الاصطناعي."
              : "Aqari by HRHBS unifies property, contracts, payments, tenants, and reporting into a single AI-powered workspace."}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card/50 p-8">
            <div className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" />
              {isAr ? "رؤيتنا" : "Our vision"}
            </div>
            <p className="text-lg leading-relaxed">
              {isAr
                ? "أن نصبح البنية التقنية الافتراضية لكل شركة عقارية في المملكة، ونساهم في رؤية 2030 عبر رقمنة القطاع بالكامل."
                : "To become the default technology backbone for every real-estate company in Saudi Arabia, contributing to Vision 2030 by fully digitizing the sector."}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/50 p-8">
            <div className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Heart className="h-4 w-4" />
              {isAr ? "رسالتنا" : "Our mission"}
            </div>
            <p className="text-lg leading-relaxed">
              {isAr
                ? "تمكين شركات العقارات — كبيرة وصغيرة — من إدارة عملياتها بكفاءة عالية عبر منصة سحابية سهلة، آمنة، ومتوافقة مع الأنظمة السعودية."
                : "Empowering real-estate companies — of every size — to run efficient operations on a cloud platform that's easy, secure, and locally compliant."}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-display mb-10 text-center text-3xl sm:text-4xl">
          {isAr ? "قيمنا" : "Our values"}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <div key={v.titleEn} className="rounded-xl border border-border/60 bg-card/40 p-6">
              <v.icon className="mb-3 h-6 w-6 text-primary" />
              <div className="mb-1 font-semibold">{isAr ? v.titleAr : v.titleEn}</div>
              <p className="text-sm text-muted-foreground">{isAr ? v.descAr : v.descEn}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-16 text-center">
          <Users2 className="h-8 w-8 text-primary" />
          <h2 className="text-display text-3xl">{isAr ? "انضم إلى رحلتنا" : "Join our journey"}</h2>
          <p className="max-w-xl text-muted-foreground">
            {isAr
              ? "سواء كنت شركة عقارية تبحث عن نظام أفضل، أو مطوّر يريد الانضمام لفريقنا — نودّ التحدث معك."
              : "Whether you run a real-estate company looking for a better system, or you're a builder wanting to join our team — we'd love to talk."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/contact">{isAr ? "تواصل معنا" : "Contact us"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">{isAr ? "الاطلاع على الأسعار" : "See pricing"}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
