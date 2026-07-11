import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  Loader2,
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  HBSAuthShell,
  hbsInputClass,
  hbsInputStyle,
  hbsPrimaryBtnStyle,
} from "@/components/hbspro/AuthShell";
import { HBS } from "@/components/hbspro/tokens";
import { incFailedAttempts, resetFailedAttempts } from "@/lib/auth-attempts";
import { getAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور — HBSpro" },
      { name: "description", content: "أرسل رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

const COOLDOWN_SECONDS = 45;
// افتراضي سوبابيس: صلاحية رابط الاستعادة ساعة واحدة
const LINK_TTL_SECONDS = 60 * 60;

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string; sentAt: number }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

function classifyError(err: unknown): Status {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();
  // supabase common rate-limit signals
  if (msg.includes("rate") || msg.includes("too many") || msg.includes("429")) {
    const m = msg.match(/(\d+)\s*second/);
    const retry = m ? Number(m[1]) : 60;
    return { kind: "rate_limited", retryAfter: retry };
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return { kind: "invalid", message: raw };
  }
  return { kind: "error", message: raw || "unknown_error" };
}

function fmtMMSS(total: number) {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [cooldown, setCooldown] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const linkRemaining = useMemo(() => {
    if (status.kind !== "sent") return 0;
    const elapsed = Math.floor((now - status.sentAt) / 1000);
    return Math.max(0, LINK_TTL_SECONDS - elapsed);
  }, [status, now]);

  const linkExpired = status.kind === "sent" && linkRemaining <= 0;

  const sendReset = async (targetEmail: string) => {
    const trimmed = targetEmail.trim();
    if (!trimmed) return;
    setStatus({ kind: "sending" });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getAppUrl("/reset-password"),
      });
      if (error) throw error;
      setStatus({ kind: "sent", email: trimmed, sentAt: Date.now() });
      setCooldown(COOLDOWN_SECONDS);
      resetFailedAttempts(`reset:${trimmed}`);
      toast.success(t("forgot.sent"));
    } catch (err) {
      incFailedAttempts(`reset:${trimmed}`);
      const s = classifyError(err);
      setStatus(s);
      if (s.kind === "rate_limited") setCooldown(s.retryAfter);
      toast.error(err instanceof Error ? err.message : t("forgot.sendFailed"));
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0 || status.kind === "sending") return;
    void sendReset(email);
  };

  const showForm = status.kind !== "sent";

  return (
    <HBSAuthShell eyebrow="Password" topRight={<LanguageSwitcher />}>
      {showForm ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: HBS.white }}>
            {t("forgot.title")}
          </h1>
          <p className="mt-1 text-sm" style={{ color: HBS.gray }}>
            {t("forgot.subtitle")}
          </p>

          {/* حالة الطلب: إشعارات موجّهة */}
          {status.kind === "rate_limited" && (
            <StatusBanner
              tone="warn"
              icon={<Clock className="size-4" />}
              title="محاولات كثيرة"
              body={`تجاوزت الحد المسموح. أعد المحاولة بعد ${fmtMMSS(cooldown || status.retryAfter)}.`}
            />
          )}
          {status.kind === "invalid" && (
            <StatusBanner
              tone="warn"
              icon={<ShieldAlert className="size-4" />}
              title="بريد غير صالح"
              body="تأكد من كتابة البريد الإلكتروني بشكل صحيح ثم أعد المحاولة."
            />
          )}
          {status.kind === "error" && (
            <StatusBanner
              tone="error"
              icon={<AlertTriangle className="size-4" />}
              title="تعذّر إرسال الرابط"
              body={status.message || "حدث خطأ غير متوقع. حاول مجدداً بعد قليل."}
            />
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs uppercase tracking-[0.18em]"
                style={{ color: HBS.gray }}
              >
                {t("forgot.email")}
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                  style={{ color: HBS.gold }}
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`ps-9 ${hbsInputClass}`}
                  style={hbsInputStyle}
                  placeholder="you@company.com"
                />
              </div>
              <p className="flex items-start gap-1.5 text-[11px]" style={{ color: HBS.gray }}>
                <Info className="mt-0.5 size-3 shrink-0" />
                لأسباب أمنية، لن نُفصح عمّا إذا كان البريد مسجّلاً. سيصلك الرابط فقط إذا كان الحساب موجوداً.
              </p>
            </div>
            <Button
              type="submit"
              className="w-full border-0"
              style={hbsPrimaryBtnStyle}
              disabled={status.kind === "sending" || cooldown > 0}
            >
              {status.kind === "sending" && <Loader2 className="me-2 size-4 animate-spin" />}
              {cooldown > 0
                ? t("forgot.resendIn", { seconds: cooldown })
                : t("forgot.submit")}
            </Button>
          </form>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{
                background: linkExpired ? `${HBS.gold}12` : `${HBS.gold}22`,
                color: HBS.goldSoft,
              }}
            >
              {linkExpired ? <Clock className="size-5" /> : <CheckCircle2 className="size-5" />}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: HBS.white }}>
                {linkExpired ? "انتهت صلاحية الرابط" : t("forgot.checkTitle")}
              </h1>
              <p className="mt-1 text-sm" style={{ color: HBS.gray }}>
                {linkExpired
                  ? "الرابط الذي أرسلناه لم يعد صالحاً. اضغط أدناه لإرسال رابط جديد."
                  : t("forgot.checkBody", { email: status.kind === "sent" ? status.email : "" })}
              </p>
            </div>
          </div>

          {/* حالة الصلاحية */}
          {!linkExpired && status.kind === "sent" && (
            <div
              className="mt-4 flex items-center justify-between rounded-xl border px-3 py-2 text-xs"
              style={{ borderColor: HBS.border, color: HBS.gray, background: "rgba(255,255,255,0.02)" }}
            >
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" style={{ color: HBS.goldSoft }} />
                صلاحية الرابط تنتهي خلال
              </span>
              <span className="font-mono tabular-nums" style={{ color: HBS.white }}>
                {fmtMMSS(linkRemaining)}
              </span>
            </div>
          )}

          {/* خطوات موجّهة */}
          <ol className="mt-4 space-y-2 text-xs" style={{ color: HBS.gray }}>
            <li>١. افتح بريدك الإلكتروني وابحث عن رسالة من HBSpro.</li>
            <li>٢. اضغط زر «إعادة تعيين كلمة المرور» داخل الرسالة.</li>
            <li>٣. إن لم تجدها خلال دقيقتين، راجع مجلد «الرسائل غير المرغوب فيها».</li>
          </ol>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              className="w-full border-0"
              style={hbsPrimaryBtnStyle}
              disabled={
                status.kind !== "sent" || (cooldown > 0 && !linkExpired)
              }
              onClick={() => status.kind === "sent" && sendReset(status.email)}
            >
              {cooldown > 0 && !linkExpired
                ? t("forgot.resendIn", { seconds: cooldown })
                : linkExpired
                ? "إرسال رابط جديد"
                : t("forgot.resend")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full hover:bg-white/5"
              style={{ color: HBS.gray }}
              onClick={() => {
                setStatus({ kind: "idle" });
                setEmail("");
              }}
            >
              {t("forgot.useAnother")}
            </Button>
          </div>
        </>
      )}

      <Link
        to="/auth"
        className="mt-6 inline-flex items-center gap-1.5 text-sm hover:opacity-100"
        style={{ color: HBS.goldSoft }}
      >
        <ArrowLeft className="size-3.5" />
        {t("forgot.back")}
      </Link>
    </HBSAuthShell>
  );
}

function StatusBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "warn" | "error" | "info";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const bg =
    tone === "error"
      ? "rgba(239,68,68,0.10)"
      : tone === "warn"
      ? "rgba(234,179,8,0.10)"
      : "rgba(59,130,246,0.10)";
  const fg =
    tone === "error" ? "#fecaca" : tone === "warn" ? "#fde68a" : "#bfdbfe";
  const bd =
    tone === "error"
      ? "rgba(239,68,68,0.35)"
      : tone === "warn"
      ? "rgba(234,179,8,0.35)"
      : "rgba(59,130,246,0.35)";
  return (
    <div
      className="mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs"
      style={{ background: bg, borderColor: bd, color: fg }}
    >
      <span className="mt-0.5">{icon}</span>
      <div className="space-y-0.5">
        <div className="font-semibold">{title}</div>
        <div className="opacity-90">{body}</div>
      </div>
    </div>
  );
}
