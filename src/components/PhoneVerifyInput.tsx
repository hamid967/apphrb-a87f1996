import { useEffect, useMemo, useState } from "react";
import {
  AsYouType,
  parsePhoneNumberFromString,
  getExampleNumber,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

const COUNTRIES: { code: CountryCode; label: string; dial: string }[] = [
  { code: "SA", label: "🇸🇦 السعودية", dial: "+966" },
  { code: "AE", label: "🇦🇪 الإمارات", dial: "+971" },
  { code: "KW", label: "🇰🇼 الكويت", dial: "+965" },
  { code: "QA", label: "🇶🇦 قطر", dial: "+974" },
  { code: "BH", label: "🇧🇭 البحرين", dial: "+973" },
  { code: "OM", label: "🇴🇲 عُمان", dial: "+968" },
  { code: "EG", label: "🇪🇬 مصر", dial: "+20" },
  { code: "JO", label: "🇯🇴 الأردن", dial: "+962" },
];

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (e164: string) => void;
  onVerifiedChange?: (verified: boolean) => void;
  required?: boolean;
};

/**
 * Phone input with country selector, live E.164 auto-formatting, and a
 * simplified in-app verification step (4-digit code shown once, user must
 * re-enter to confirm they read the number correctly).
 */
export function PhoneVerifyInput({
  id = "phone",
  label = "رقم الجوال",
  value,
  onChange,
  onVerifiedChange,
  required,
}: Props) {
  const [country, setCountry] = useState<CountryCode>("SA");
  const [display, setDisplay] = useState("");
  const [verified, setVerified] = useState(false);
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");

  // Hydrate display from parent value.
  useEffect(() => {
    if (!value) return;
    const parsed = parsePhoneNumberFromString(value);
    if (parsed) {
      setCountry(parsed.country ?? country);
      setDisplay(parsed.formatNational());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = useMemo(() => parsePhoneNumberFromString(display, country), [display, country]);
  const isValid = !!parsed?.isValid();
  const example = useMemo(() => {
    const ex = getExampleNumber(country, examples);
    return ex ? ex.formatNational() : "";
  }, [country]);

  const handleInput = (raw: string) => {
    const formatter = new AsYouType(country);
    const formatted = formatter.input(raw);
    setDisplay(formatted);
    setVerified(false);
    setCodeSent(null);
    onVerifiedChange?.(false);
    const p = parsePhoneNumberFromString(formatted, country);
    onChange(p?.isValid() ? p.number : "");
  };

  const sendCode = () => {
    if (!isValid) {
      toast.error("رقم الجوال غير صالح");
      return;
    }
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setCodeSent(code);
    setCodeInput("");
    toast.message(`رمز التحقق التجريبي: ${code}`, {
      description: "أعد إدخال الرمز أدناه لتأكيد الرقم.",
      duration: 10000,
    });
  };

  const confirmCode = () => {
    if (codeInput.trim() === codeSent) {
      setVerified(true);
      setCodeSent(null);
      onVerifiedChange?.(true);
      toast.success("تم تأكيد الرقم");
    } else {
      toast.error("الرمز غير صحيح");
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="flex gap-2">
        <Select
          value={country}
          onValueChange={(v) => {
            setCountry(v as CountryCode);
            handleInput(display);
          }}
        >
          <SelectTrigger className="w-[140px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label} {c.dial}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Input
            id={id}
            type="tel"
            dir="ltr"
            inputMode="tel"
            value={display}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={example || "5X XXX XXXX"}
            aria-invalid={display.length > 0 && !isValid}
            className="pe-9"
          />
          {display.length > 0 && (
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2">
              {verified ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : isValid ? (
                <ShieldCheck className="size-4 text-primary" />
              ) : (
                <XCircle className="size-4 text-destructive" />
              )}
            </span>
          )}
        </div>
      </div>

      {display.length > 0 && !isValid && (
        <p className="text-xs text-destructive">رقم غير صالح — تأكد من الصيغة والدولة.</p>
      )}

      {isValid && !verified && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!codeSent ? (
            <Button type="button" size="sm" variant="outline" onClick={sendCode}>
              <ShieldCheck className="me-1.5 size-3.5" />
              إرسال رمز التحقق
            </Button>
          ) : (
            <>
              <Input
                dir="ltr"
                inputMode="numeric"
                maxLength={4}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                className="w-28"
              />
              <Button type="button" size="sm" onClick={confirmCode}>
                تأكيد
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={sendCode}>
                إعادة الإرسال
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">{parsed?.formatInternational()}</span>
        </div>
      )}

      {verified && (
        <p className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="size-3.5" /> تم تأكيد الرقم:{" "}
          <span dir="ltr" className="font-mono">
            {parsed?.formatInternational()}
          </span>
        </p>
      )}
    </div>
  );
}
