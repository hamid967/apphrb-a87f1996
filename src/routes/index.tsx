import { createFileRoute } from "@tanstack/react-router";
import {
  Navbar,
  Stats,
  Features,
  DashboardPreview,
  PropertySlider,
  AISection,
  Integrations,
  Testimonials,
  Pricing,
  FAQ,
  CTA,
  Footer,
  DemoModalRoot,
} from "@/components/hbspro/sections";
import { EmeraldSplitHero } from "@/components/hbspro/EmeraldSplitHero";
import { SignupAssistant } from "@/components/SignupAssistant";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HBSpro — إدارة عقارات بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "عقاري من HBSpro — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      {
        property: "og:title",
        content: "HBSpro — إدارة عقارات بالذكاء الاصطناعي",
      },
      {
        property: "og:description",
        content:
          "عقاري من HBSpro — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/aff05cce-c377-413e-bb68-ddcfed90d484" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/aff05cce-c377-413e-bb68-ddcfed90d484" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#071320" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "HBSpro",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://hrhbs.com/",
          inLanguage: ["ar", "en"],
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "SAR",
            availability: "https://schema.org/InStock",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "120",
          },
        }),
      },
    ],
  }),
  component: HBSproHome,
});

function HBSproHome() {
  return (
    <div className="theme-luxe min-h-screen font-sans antialiased bg-[#043927] text-[#f5f0e0]">
      <Navbar />
      <main>
        <EmeraldSplitHero />
        <div
          aria-hidden
          className="h-24"
          style={{
            background: "linear-gradient(180deg, #fdfcfb 0%, #043927 100%)",
          }}
        />
        <Stats />
        <Features />
        <AISection />
        <DashboardPreview />
        <PropertySlider />
        <Testimonials />
        <Pricing />
        <Integrations />
        <FAQ />
        <CTA />
      </main>
      <Footer />
      <DemoModalRoot />
      <SignupAssistant />
    </div>
  );
}

