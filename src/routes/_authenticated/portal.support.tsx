import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { LifeBuoy, MessageCircle, Phone, Mail, BookOpen, PlayCircle } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";

export const Route = createFileRoute("/_authenticated/portal/support")({
  head: () => portalHead({ titleAr: 'الدعم الفني', titleEn: 'Support', descAr: 'تواصل مع فريق الدعم وأنشئ تذاكر.', path: '/portal/support' }),
  component: SupportPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

function SupportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const channels = [
    {
      icon: MessageCircle,
      ar: "الدردشة المباشرة",
      en: "Live chat",
      arSub: "الرد خلال دقائق",
      enSub: "Reply in minutes",
      href: "#",
    },
    {
      icon: Phone,
      ar: "واتساب",
      en: "WhatsApp",
      arSub: "دعم فوري",
      enSub: "Instant support",
      href: "https://wa.me/966500000000",
    },
    {
      icon: Mail,
      ar: "البريد",
      en: "Email",
      arSub: "support@hrhbs.com",
      enSub: "support@hrhbs.com",
      href: "mailto:support@hrhbs.com",
    },
  ];
  const faqs = [
    { ar: "كيف أنشئ طلباً جديداً؟", en: "How to create a new request?" },
    { ar: "كيف أرفع وثيقة رسمية؟", en: "How to upload an official document?" },
    { ar: "كيف أدفع فاتورة إلكترونياً؟", en: "How to pay an invoice online?" },
    { ar: "كيف أفعّل المصادقة الثنائية؟", en: "How to enable 2FA?" },
  ];
  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<LifeBuoy className="size-5" />}
        title={isAr ? "مركز الدعم" : "Support Center"}
        subtitle={isAr ? "نحن هنا لمساعدتك 24/7" : "We're here for you 24/7"}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {channels.map((c) => (
          <a
            key={c.en}
            href={c.href}
            className="surface-card group flex items-start gap-3 p-4 transition hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-110">
              <c.icon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{isAr ? c.ar : c.en}</div>
              <div className="truncate text-xs text-muted-foreground">
                {isAr ? c.arSub : c.enSub}
              </div>
            </div>
          </a>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4" /> {isAr ? "الأسئلة الشائعة" : "FAQs"}
          </h3>
          <ul className="mt-3 divide-y divide-border/60">
            {faqs.map((f, i) => (
              <li key={i} className="py-2.5 text-sm">
                {isAr ? f.ar : f.en}
              </li>
            ))}
          </ul>
        </div>
        <div className="surface-card p-5">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <PlayCircle className="size-4" /> {isAr ? "شروحات فيديو" : "Video tutorials"}
          </h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="aspect-video rounded-xl bg-gradient-to-br from-muted/60 to-muted/30"
                aria-label="tutorial placeholder"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
