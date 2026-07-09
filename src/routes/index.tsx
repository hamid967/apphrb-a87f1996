import { createFileRoute } from "@tanstack/react-router";
import { HBS } from "@/components/hbspro/tokens";
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
import { OpeningExperience } from "@/components/hbspro/OpeningExperience";
import { SignupAssistant } from "@/components/SignupAssistant";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "عقاري Aqari — إدارة عقارات بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "عقاري Aqari من HRHBS — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      {
        property: "og:title",
        content: "عقاري Aqari — إدارة عقارات بالذكاء الاصطناعي",
      },
      {
        property: "og:description",
        content:
          "عقاري Aqari من HRHBS — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/" },
      { property: "og:image", content: "https://hrhbs.com/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: "https://hrhbs.com/og-image.jpg" },
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
          name: "Aqari Aqari",
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
    <div
      className="theme-luxe min-h-screen font-sans antialiased text-white"
      style={{
        background: `radial-gradient(1200px 800px at 20% -10%, #14264f 0%, ${HBS.bg} 55%, #0a1128 100%)`,
      }}
    >
      <Navbar />
      <main>
        <OpeningExperience />
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
