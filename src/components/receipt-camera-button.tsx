import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Renders a "Take photo" button that opens the device camera directly on
 * mobile (uses `capture="environment"` on a hidden file input, so iOS Safari
 * and Android Chrome open the rear camera without needing a native plugin).
 *
 * Hidden on desktop / non-touch devices — those users are better served by
 * the file picker/drag-drop that already exists next to it.
 *
 * Works identically inside the Capacitor WebView because Capacitor honors
 * the standard HTML file input attributes on both iOS and Android.
 */
export function ReceiptCameraButton({
  onCapture,
  disabled = false,
  className,
  size = "sm",
  variant = "outline",
}: {
  onCapture: (file: File | null | undefined) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "secondary" | "default" | "ghost";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isTouch, setIsTouch] = useState(false);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  if (!isTouch) return null;

  const isAr = (i18n.language || "").startsWith("ar");
  const label = t("receiptCamera.takePhoto", {
    defaultValue: isAr ? "التقاط الإيصال بالكاميرا" : "Take photo of receipt",
  });

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Allow re-selecting the same photo after cancel/retry.
          e.target.value = "";
          onCapture(file);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        className={cn("w-full gap-2", className)}
      >
        <Camera className="h-4 w-4" />
        {label}
      </Button>
    </>
  );
}
