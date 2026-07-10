import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
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

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [, setFailedAttempts] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendReset = async (targetEmail: string) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: getAppUrl("/reset-password"),
      });
      if (error) throw error;
      setSentTo(targetEmail);
      setCooldown(COOLDOWN_SECONDS);
      resetFailedAttempts(`reset:${targetEmail}`);
      toast.success(t("forgot.sent"));
    } catch (err) {
      setFailedAttempts(incFailedAttempts(`reset:${targetEmail}`));
      toast.error(err instanceof Error ? err.message : t("forgot.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  };


  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0) return;
    void sendReset(email);
  };

  return (
    <HBSAuthShell eyebrow="Password" topRight={<LanguageSwitcher />}>
      {!sentTo ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: HBS.white }}>
            {t("forgot.title")}
          </h1>
          <p className="mt-1 text-sm" style={{ color: HBS.gray }}>
            {t("forgot.subtitle")}
          </p>

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
            </div>
            <Button
              type="submit"
              className="w-full border-0"
              style={hbsPrimaryBtnStyle}
              disabled={submitting}
            >
              {submitting && <Loader2 className="me-2 size-4 animate-spin" />}
              {t("forgot.submit")}
            </Button>
          </form>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ background: `${HBS.gold}22`, color: HBS.goldSoft }}
            >
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: HBS.white }}>
                {t("forgot.checkTitle")}
              </h1>
              <p className="mt-1 text-sm" style={{ color: HBS.gray }}>
                {t("forgot.checkBody", { email: sentTo })}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              className="w-full border-0"
              style={hbsPrimaryBtnStyle}
              variant="secondary"
              disabled={submitting || cooldown > 0}
              onClick={() => sendReset(sentTo)}
            >
              {submitting && <Loader2 className="me-2 size-4 animate-spin" />}
              {cooldown > 0 ? t("forgot.resendIn", { seconds: cooldown }) : t("forgot.resend")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full hover:bg-white/5"
              style={{ color: HBS.gray }}
              onClick={() => {
                setSentTo(null);
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
