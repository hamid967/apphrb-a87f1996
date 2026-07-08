import { createFileRoute, Link } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { Bot, ArrowUpRight, Sparkles } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";

export const Route = createFileRoute("/_authenticated/portal/assistant")({
  head: () => portalHead({ titleAr: 'المساعد الذكي', titleEn: 'Portal Assistant', descAr: 'مساعدك الذكي داخل المحطة.', path: '/portal/assistant' }),
  component: AssistantHome,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

const PROMPTS = [
  { ar: "كيف أجدد السجل التجاري؟", en: "How do I renew my Commercial Registration?" },
  { ar: "اشرح خطوات نقل كفالة موظف", en: "Explain the steps to transfer sponsorship" },
  { ar: "ما مستندات تأشيرة العمل؟", en: "What documents are required for a work visa?" },
  { ar: "احسب زكاة شركتي هذا العام", en: "Calculate my company's Zakat this year" },
  { ar: "لخّص عقد العمل المرفق", en: "Summarize the attached employment contract" },
  { ar: "استخرج بيانات فاتورة PDF", en: "Extract data from a PDF invoice" },
];

function AssistantHome() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <div className="mx-auto max-w-[1000px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<Bot className="size-5" />}
        title={isAr ? "المساعد الذكي" : "AI Assistant"}
        subtitle={isAr ? "مستشار حكومي ومساعد للأعمال" : "Government & business copilot"}
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="surface-card relative overflow-hidden bg-gradient-to-br from-primary/8 via-card to-accent/8 p-6 sm:p-8"
      >
        <motion.div
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3" /> {isAr ? "مدعوم بـ HBS AI" : "Powered by HBS AI"}
          </div>
          <Button asChild size="sm" className="ms-auto">
            <Link to="/assistant">
              {isAr ? "افتح المحادثة الكاملة" : "Open full chat"}
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
        <h2 className="mt-4 text-xl font-semibold">
          {isAr ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAr ? "اختر اقتراحاً أو اطرح سؤالك" : "Pick a suggestion or ask anything"}
        </p>
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {PROMPTS.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.05, duration: 0.28, ease: "easeOut" }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                to="/assistant"
                className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 text-sm transition hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <span className="min-w-0 flex-1 truncate">{isAr ? p.ar : p.en}</span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
