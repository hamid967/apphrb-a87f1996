import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ElevenLabsHamidAgent } from "@/components/assistant/ElevenLabsHamidAgent";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/assistant/elevenlabs")({
  component: ElevenLabsAssistantPage,
  head: () =>
    sectionHead({
      section: "assistant",
      entityAr: "حامد ElevenLabs",
      entityEn: "Hamid ElevenLabs",
      descAr: "محادثة صوتية مباشرة مع وكيل حامد عبر ElevenLabs داخل HBSpro.",
      descAr: "محادثة صوتية مباشرة مع وكيل حامد عبر ElevenLabs داخل HBSpro.",
      path: "/assistant/elevenlabs",
    }),
});

function ElevenLabsAssistantPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? true;
  return <ElevenLabsHamidAgent isAr={isAr} />;
}
