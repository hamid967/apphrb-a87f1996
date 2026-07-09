import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type HoloIntensity = "off" | "soft" | "medium" | "intense";

const STORAGE_KEY = "holo-intensity";

function readInitial(): HoloIntensity {
  if (typeof window === "undefined") return "medium";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "off" || v === "soft" || v === "medium" || v === "intense") return v;
  return "medium";
}

function apply(intensity: HoloIntensity) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-holo", intensity);
}

export function HoloIntensityToggle() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [value, setValue] = useState<HoloIntensity>("medium");

  useEffect(() => {
    const v = readInitial();
    setValue(v);
    apply(v);
  }, []);

  const set = (v: HoloIntensity) => {
    setValue(v);
    apply(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const labels: Record<HoloIntensity, string> = isAr
    ? { off: "بدون", soft: "ناعم", medium: "متوسط", intense: "مكثف" }
    : { off: "Off", soft: "Soft", medium: "Medium", intense: "Intense" };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="luxe-icon-btn"
          aria-label={isAr ? "شدة تأثير الهولوجرام" : "Holographic intensity"}
          title={isAr ? "شدة التأثير" : "Effect intensity"}
        >
          <Sparkles className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{isAr ? "شدة التأثير" : "Effect intensity"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["off", "soft", "medium", "intense"] as HoloIntensity[]).map((k) => (
          <DropdownMenuItem
            key={k}
            onSelect={() => set(k)}
            className={value === k ? "font-semibold text-primary" : ""}
          >
            {labels[k]}
            {value === k ? <span className="ms-auto text-xs">●</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
