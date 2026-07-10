import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { PublicNav } from "@/components/marketing/PublicNav";

export interface LegalSection {
  headingAr: string;
  headingEn: string;
  bodyAr: string;
  bodyEn: string;
}

export interface LegalPageProps {
  titleAr: string;
  titleEn: string;
  updatedAr: string;
  updatedEn: string;
  introAr: string;
  introEn: string;
  sections: LegalSection[];
}

export function LegalPage(props: LegalPageProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <PublicNav />


      <article className="mx-auto max-w-3xl px-6 py-16">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          {isAr ? "قانوني" : "Legal"}
        </p>
        <h1 className="text-display text-3xl sm:text-4xl">
          {isAr ? props.titleAr : props.titleEn}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAr ? props.updatedAr : props.updatedEn}
        </p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          {isAr ? props.introAr : props.introEn}
        </p>

        <div className="mt-10 space-y-8">
          {props.sections.map((s, i) => (
            <section key={i}>
              <h2 className="mb-2 text-xl font-semibold">
                {i + 1}. {isAr ? s.headingAr : s.headingEn}
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {isAr ? s.bodyAr : s.bodyEn}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
          {isAr
            ? "لأي استفسار قانوني، تواصل معنا عبر البريد "
            : "For any legal inquiry, contact us at "}
          <a href="mailto:legal@hrhbs.com" className="text-primary hover:underline">
            legal@hrhbs.com
          </a>
          .
        </div>
      </article>
    </div>
  );
}
