import { createFileRoute } from "@tanstack/react-router";
import { LuxuryIntroOverlay } from "@/components/hbspro/LuxuryIntroOverlay";
import { Phase8LandingPage } from "@/components/hbspro/Phase8LandingPage";
import { DemoModalRoot } from "@/components/hbspro/sections";
import { SignupAssistant } from "@/components/SignupAssistant";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HBSpro — أملاكك ومصاريفك وصيانتك في منصة واحدة" },
      {
        name: "description",
        content:
          "HBSpro منصة سعودية عربية لإدارة الأملاك والوحدات والعقود والتحصيل والمصاريف والصيانة، مع تقارير PDF احترافية وأسعار واضحة للأفراد والمنشآت.",
      },
      {
        property: "og:title",
        content: "HBSpro — أملاكك ومصاريفك وصيانتك في منصة واحدة",
      },
      {
        property: "og:description",
        content:
          "منصة واحدة للعقارات، التحصيل، الصيانة، المصاريف، وتقارير PDF بشعارك وبياناتك.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/" },
      { property: "og:image", content: "https://hrhbs.com/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: "https://hrhbs.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#071729" },
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
          offers: [
            { "@type": "Offer", name: "مجاني", price: "0", priceCurrency: "SAR" },
            { "@type": "Offer", name: "برو للأفراد", price: "49", priceCurrency: "SAR" },
            { "@type": "Offer", name: "منشآت", price: "149", priceCurrency: "SAR" },
          ],
          featureList: [
            "إدارة العقارات والوحدات",
            "العقود والتحصيل بالسندات",
            "الصيانة والموردون",
            "المصاريف العقارية والشخصية",
            "تقارير PDF بشعار العميل",
            "لوحة تحكم ذكية",
          ],
        }),
      },
    ],
  }),
  component: HBSproHome,
});

function HBSproHome() {
  return (
    <div className="theme-luxe min-h-screen font-sans antialiased bg-[#071729] text-white selection:bg-[#00D9C0]/30 selection:text-white">
      <LuxuryIntroOverlay />
      <Phase8LandingPage />
      <DemoModalRoot />
      <SignupAssistant />
    </div>
  );
}
