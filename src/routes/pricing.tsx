import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, Mail, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ogPricing from "@/assets/og-pricing.jpg.asset.json";

const OG_PRICING = `https://hrhbs.com${ogPricing.url}`;
const CONTACT_EMAIL = "sales@hrhbs.com";
const CONTACT_WHATSAPP = "https://wa.me/966500000000";
const CONTACT_PHONE = "+966500000000";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "الاشتراك — HBSpro" },
      {
        name: "description",
        content:
          "باقة موحّدة واحدة تشمل جميع خدمات HBSpro. سجّل الآن وسيتم التواصل معك لتفعيل اشتراكك.",
      },
      { property: "og:title", content: "الاشتراك — HBSpro" },
      {
        property: "og:description",
        content: "باقة واحدة شاملة لكل خدمات المنصة — التفعيل يتم بعد التواصل مع فريقنا.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/pricing" },
      { property: "og:image", content: OG_PRICING },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "الاشتراك — HBSpro" },
      {
        name: "twitter:description",
        content: "باقة موحّدة تشمل كل الخدمات. تواصل معنا للتفعيل.",
      },
      { name: "twitter:image", content: OG_PRICING },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/pricing" }],
  }),
  component: PricingPage,
});

const INCLUDED_FEATURES_AR = [
  "إدارة كاملة للعقارات والوحدات والعقود",
  "بوابة المستأجرين وبوابة الملاك",
  "المصاريف والفواتير والمدفوعات وسندات القبض والصرف",
  "التذاكر والصيانة",
  "التقارير الكاملة وتصدير CSV",
  "المساعد الذكي (AI Assistant)",
  "دعم فني بأولوية",
  "عدد غير محدود من العقارات والوحدات والمستخدمين",
];
const INCLUDED_FEATURES_EN = [
  "Full management of properties, units, contracts",
  "Tenant portal and owner portal",
  "Expenses, invoices, payments, receipt & payment vouchers",
  "Tickets and maintenance",
  "Full reports and CSV export",
  "AI Assistant",
  "Priority support",
  "Unlimited properties, units and users",
];

function PricingPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const features = isAr ? INCLUDED_FEATURES_AR : INCLUDED_FEATURES_EN;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-dvh bg-background text-foreground">
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <header className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
            {isAr ? "باقة واحدة تشمل كل شيء" : "One plan, everything included"}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {isAr ? "الباقة الموحدة" : "The All-in-One Plan"}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {isAr
              ? "سجّل حساب الشركة الآن، وسيتواصل معك فريقنا لتفعيل الاشتراك ومناقشة التفاصيل. لا توجد مدفوعات إلكترونية عبر الموقع."
              : "Register your company now — our team will contact you to activate your subscription and discuss details. No online payment is required on the website."}
          </p>
        </header>

        <div className="mt-12">
          <Card className="relative border-primary/50 shadow-lg shadow-primary/10">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">
                  {isAr ? "الباقة الموحدة" : "All-in-One Plan"}
                </CardTitle>
                <CardDescription className="text-base">
                  {isAr
                    ? "كل خدمات المنصة في اشتراك واحد."
                    : "All platform services in a single subscription."}
                </CardDescription>
                <div className="pt-6">
                  <div className="text-2xl font-semibold text-primary">
                    {isAr ? "تواصل معنا للتفعيل" : "Contact us to activate"}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isAr
                      ? "لا يوجد دفع عبر الموقع — يتم الاتفاق على الاشتراك مباشرة مع فريقنا."
                      : "No online payment — the subscription is arranged directly with our team."}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="grid gap-3 pt-4 sm:grid-cols-2">
                  <Button asChild size="lg" className="w-full">
                    <Link to="/register-company">
                      {isAr ? "سجّل حسابك الآن" : "Register your account"}
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full">
                    <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="me-2 size-4" />
                      {isAr ? "تواصل عبر واتساب" : "Contact on WhatsApp"}
                    </a>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 border-t border-border/40 pt-4 text-sm text-muted-foreground">
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <Mail className="size-4" /> {CONTACT_EMAIL}
                  </a>
                  <a
                    href={`tel:${CONTACT_PHONE}`}
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <Phone className="size-4" /> {CONTACT_PHONE}
                  </a>
                </div>
              </CardContent>
            </Card>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {isAr
            ? "بعد التسجيل سيراجع فريقنا طلبك ويتواصل معك لتفعيل الاشتراك."
            : "After signup, our team will review your request and contact you to activate your subscription."}
        </p>
      </div>
    </div>
  );
}
