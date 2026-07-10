import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listFaqEntries } from "@/lib/marketing.functions";
import { Building2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqQuery = queryOptions({
  queryKey: ["faq-entries"],
  queryFn: () => listFaqEntries(),
});

export const Route = createFileRoute("/faq")({
  head: ({ loaderData }) => {
    const entries = (loaderData as { entries?: Array<{ question_ar?: string | null; question_en?: string | null; answer_ar?: string | null; answer_en?: string | null }> } | undefined)?.entries ?? [];
    const mainEntity = entries
      .map((e) => {
        const q = e.question_ar || e.question_en;
        const a = e.answer_ar || e.answer_en;
        if (!q || !a) return null;
        return {
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        };
      })
      .filter(Boolean);
    return {
      meta: [
        { title: "الأسئلة الشائعة — HBSpro | FAQ" },
        {
          name: "description",
          content:
            "إجابات عن أكثر الأسئلة تكراراً حول HBSpro: الاشتراك، الأمان، النسخ الاحتياطي، الفوترة الإلكترونية، وأكثر.",
        },
        { property: "og:title", content: "الأسئلة الشائعة — HBSpro" },
        { property: "og:description", content: "أسئلة شائعة حول منصة HBSpro وإجاباتها." },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://hrhbs.com/faq" },
      ],
      links: [{ rel: "canonical", href: "https://hrhbs.com/faq" }],
      ...(mainEntity.length > 0
        ? {
            scripts: [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity,
                }),
              },
            ],
          }
        : {}),
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(faqQuery),
  component: FaqPage,
});

function FaqPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { data } = useSuspenseQuery(faqQuery);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    data.entries.forEach((e) => set.add(e.category));
    return ["all", ...Array.from(set)];
  }, [data.entries]);

  const filtered = useMemo(() => {
    return data.entries.filter((e) => {
      if (activeCat !== "all" && e.category !== activeCat) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const fields = isAr
        ? [e.question_ar, e.answer_ar]
        : [e.question_en, e.answer_en];
      return fields.some((f) => f?.toLowerCase().includes(q));
    });
  }, [data.entries, query, activeCat, isAr]);

  const fallback = data.entries.length === 0;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5" />
            <span>HBSpro</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/services" className="text-muted-foreground hover:text-foreground">
              {isAr ? "الخدمات" : "Services"}
            </Link>
            <Link to="/contact" className="text-muted-foreground hover:text-foreground">
              {isAr ? "تواصل" : "Contact"}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-display text-4xl sm:text-5xl">
            {isAr ? "الأسئلة الشائعة" : "Frequently asked questions"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {isAr
              ? "ابحث بين الأسئلة الأكثر تكراراً — إن لم تجد إجابتك، لا تتردد في التواصل معنا."
              : "Search common questions — if you don't find your answer, reach out to us."}
          </p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute top-3 h-4 w-4 text-muted-foreground ltr:left-3 rtl:right-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "ابحث في الأسئلة..." : "Search questions..."}
            className="ltr:pl-9 rtl:pr-9"
          />
        </div>

        {categories.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCat(c)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  activeCat === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "all" ? (isAr ? "الكل" : "All") : c}
              </button>
            ))}
          </div>
        )}

        {fallback ? (
          <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center text-muted-foreground">
            {isAr
              ? "لا توجد أسئلة شائعة منشورة حالياً. تواصل معنا مباشرة."
              : "No FAQ entries published yet. Please contact us directly."}
          </div>
        ) : (
          <Accordion type="single" collapsible className="rounded-xl border border-border/60 bg-card/40">
            {filtered.map((e) => (
              <AccordionItem key={e.id} value={e.id} className="border-border/60 px-4">
                <AccordionTrigger className="text-start">
                  {isAr ? e.question_ar : e.question_en}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {isAr ? e.answer_ar : e.answer_en}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        <div className="mt-10 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/contact">{isAr ? "لم أجد إجابتي — تواصل" : "Can't find an answer? Contact us"}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
