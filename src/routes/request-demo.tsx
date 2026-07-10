import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle, BrandMark } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Calendar, ArrowRight, Loader2, AlertCircle } from "lucide-react";

const demoSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  units: z.string().trim().max(100).optional(),
  message: z.string().trim().max(4000).optional(),
});

const CANONICAL = "https://hrhbs.com/request-demo";

export const Route = createFileRoute("/request-demo")({
  head: () => ({
    meta: [
      { title: "احجز عرضاً توضيحياً — HBSpro | Request a Demo" },
      {
        name: "description",
        content:
          "احجز عرضاً حياً مخصصاً لفريقك: جولة 30 دقيقة في HBSpro مع فريق المنتج — لا بطاقة، لا التزام.",
      },
      { property: "og:title", content: "احجز عرضاً — HBSpro" },
      {
        property: "og:description",
        content: "جولة حية 30 دقيقة في منصة HBSpro مع فريق المنتج.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "HBSpro — Request a Demo",
          url: CANONICAL,
        }),
      },
    ],
  }),
  component: RequestDemoPage,
});

function RequestDemoPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bullets = isAr
    ? [
        "جولة حية 30 دقيقة مخصصة لحالتك.",
        "أسئلة وأجوبة مع فريق المنتج.",
        "خطة ترحيل بيانات في أسبوع.",
      ]
    : [
        "30-min live tour tailored to your case.",
        "Q&A with the product team.",
        "One-week data migration plan.",
      ];

  return (
    <div className="min-h-screen theme-luxe" dir={isAr ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs uppercase tracking-widest text-primary">
            <Calendar className="h-3.5 w-3.5" />
            {isAr ? "احجز عرضاً" : "Request a Demo"}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            {isAr
              ? "شاهد HBSpro مع فريقنا مباشرةً."
              : "See HBSpro live with our team."}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {isAr
              ? "جولة قصيرة مخصصة — نُريك الوحدات التي تهم شركتك، ونجيب عن كل أسئلتك."
              : "A short, tailored tour — we show the modules that matter to your company and answer every question."}
          </p>
          <ul className="mt-8 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/50 p-6 backdrop-blur-sm md:p-8">
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-9 w-9 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">
                {isAr ? "شكراً لك! تم استلام طلبك." : "Thank you! Your request is in."}
              </h2>
              <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                {isAr
                  ? "سيتواصل معك فريق HBSpro خلال يوم عمل واحد لتحديد موعد العرض التوضيحي. تحقّق من بريدك — بما في ذلك مجلد الرسائل غير المرغوبة."
                  : "The HBSpro team will reach out within one business day to schedule your demo. Please check your inbox — including spam."}
              </p>
              <div className="mt-3 rounded-lg border border-border/40 bg-background/60 px-4 py-2 text-xs text-muted-foreground">
                {isAr
                  ? "رقم المرجع: HBS-" + Date.now().toString().slice(-6)
                  : "Reference: HBS-" + Date.now().toString().slice(-6)}
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg">
                  <Link to="/features">
                    {isAr ? "العودة إلى المزايا" : "Back to features"}
                    <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setSubmitted(false)}
                >
                  {isAr ? "إرسال طلب آخر" : "Submit another"}
                </Button>
              </div>
            </div>

          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">{isAr ? "الاسم" : "Full name"}</Label>
                  <Input id="name" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="company">{isAr ? "الشركة" : "Company"}</Label>
                  <Input id="company" required className="mt-1" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="email">{isAr ? "البريد" : "Work email"}</Label>
                  <Input id="email" type="email" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">{isAr ? "الجوال" : "Phone"}</Label>
                  <Input id="phone" type="tel" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="units">
                  {isAr ? "عدد الوحدات المُدارة" : "Units under management"}
                </Label>
                <Input id="units" type="number" min={1} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="notes">
                  {isAr ? "ماذا تريد أن ترى؟" : "What would you like to see?"}
                </Label>
                <Textarea id="notes" rows={3} className="mt-1" />
              </div>
              <Button type="submit" size="lg" className="w-full">
                {isAr ? "احجز الآن" : "Book demo"}
                <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {isAr
                  ? "لا بطاقة ائتمانية · نرد خلال يوم عمل"
                  : "No credit card · reply within 1 business day"}
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
