import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import type { LucideIcon } from "lucide-react";
import { Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SolutionFeature {
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
}

export interface SolutionPageProps {
  eyebrowAr: string;
  eyebrowEn: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  features: SolutionFeature[];
  ctaAr?: string;
  ctaEn?: string;
}

export function SolutionPage(props: SolutionPageProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
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
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
          {isAr ? props.eyebrowAr : props.eyebrowEn}
        </div>
        <h1 className="text-display text-4xl sm:text-5xl">
          {isAr ? props.titleAr : props.titleEn}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          {isAr ? props.subtitleAr : props.subtitleEn}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/contact">
              {isAr ? props.ctaAr ?? "احجز عرضاً" : props.ctaEn ?? "Book a demo"}
              <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/pricing">{isAr ? "الأسعار" : "Pricing"}</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {props.features.map((f) => (
            <div key={f.titleEn} className="rounded-xl border border-border/60 bg-card/40 p-6">
              <f.icon className="mb-3 h-6 w-6 text-primary" />
              <div className="mb-1 font-semibold">{isAr ? f.titleAr : f.titleEn}</div>
              <p className="text-sm text-muted-foreground">{isAr ? f.descAr : f.descEn}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
