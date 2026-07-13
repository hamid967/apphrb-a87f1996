import { createFileRoute } from "@tanstack/react-router";
import {
  Navbar,
  Stats,
  Features,
  DashboardPreview,
  AISection,
  Integrations,
  Testimonials,
  Pricing,
  FAQ,
  CTA,
  Footer,
  DemoModalRoot,
} from "@/components/hbspro/sections";
import { PortfolioCommandCenter } from "@/components/hbspro/EmeraldSplitHero";
import { CinematicIntro } from "@/components/hbspro/CinematicIntro";
import { SignupAssistant } from "@/components/SignupAssistant";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HBSpro — مركز قيادة ذكي لإدارة الأملاك والعقارات" },
      {
        name: "description",
        content:
          "HBSpro منصة سعودية ذكية لإدارة المحافظ العقارية: أملاك، وحدات، عقود، تحصيل، صيانة، تقارير تنفيذية، ومساعد ذكاء اصطناعي في نظام واحد.",
      },
      {
        property: "og:title",
        content: "HBSpro — مركز قيادة ذكي لإدارة الأملاك والعقارات",
      },
      {
        property: "og:description",
        content:
          "منصة عقارية متكاملة لإدارة المحافظ، التحصيل، الشغور، الصيانة، العقود، والتقارير الذكية للسوق السعودي.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/aff05cce-c377-413e-bb68-ddcfed90d484" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/aff05cce-c377-413e-bb68-ddcfed90d484" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#043927" },
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
          featureList: [
            "إدارة المحافظ العقارية",
            "إدارة العقود والتحصيل",
            "إدارة الصيانة والتذاكر",
            "تقارير تنفيذية ذكية",
            "مساعد ذكاء اصطناعي عقاري",
          ],
          audience: {
            "@type": "BusinessAudience",
            audienceType: "Real estate companies and property managers",
          },
        }),
      },
    ],
  }),
  component: HBSproHome,
});

function HBSproHome() {
  return (
    <div className="theme-luxe min-h-screen font-sans antialiased bg-[#043927] text-[#f5f0e0] selection:bg-[#C5A059]/30 selection:text-white">
      <Navbar />
      <main>
        <CinematicIntro />
        <PortfolioCommandCenter />
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
