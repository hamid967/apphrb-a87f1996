import { useTranslation } from "react-i18next";
import { toHijri, type HijriStyle } from "@/lib/hijri";
import { Badge } from "@/components/ui/badge";

type Props = {
  date: Date | string | number | null | undefined;
  style?: HijriStyle;
  showGregorian?: boolean;
  className?: string;
};

/**
 * Displays a Hijri (Umm al-Qura) date, optionally with the Gregorian equivalent
 * as a muted sub-label. Localised through i18n language.
 */
export function HijriDateBadge({ date, style = "short", showGregorian = false, className }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const hijri = toHijri(date, { locale: isAr ? "ar" : "en", style });
  const gregorian = date ? new Date(date as string).toLocaleDateString(isAr ? "ar-SA" : "en-GB") : "—";
  return (
    <div className={`inline-flex flex-col gap-0.5 ${className ?? ""}`}>
      <Badge variant="outline" className="whitespace-nowrap font-normal tabular-nums">
        {hijri}
      </Badge>
      {showGregorian && (
        <span className="text-[10px] text-muted-foreground tabular-nums">{gregorian}</span>
      )}
    </div>
  );
}
