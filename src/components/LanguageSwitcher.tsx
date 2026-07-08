import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyDirection } from "@/lib/i18n";

export function LanguageSwitcher({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // On mount: sync from signed-in user's profile.language if present.
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", user.id)
        .maybeSingle();
      const lang = data?.language === "en" || data?.language === "ar" ? data.language : null;
      if (lang && lang !== i18n.language) {
        await i18n.changeLanguage(lang);
        applyDirection(lang);
      }
    })();
  }, [i18n]);
  const current = i18n.language?.startsWith("ar") ? "ar" : "en";
  const toggle = async () => {
    const next = current === "ar" ? "en" : "ar";
    await i18n.changeLanguage(next);
    applyDirection(next);
    // Persist to profile if signed in (fire-and-forget; localStorage already saved).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      void supabase.from("profiles").update({ language: next }).eq("id", user.id);
    }
  };
  return (
    <Button type="button" variant={variant} size="sm" onClick={toggle} className="gap-2">
      <Languages className="size-4" />
      <span suppressHydrationWarning>
        {mounted ? (current === "ar" ? "English" : "العربية") : "English"}
      </span>
    </Button>
  );
}
