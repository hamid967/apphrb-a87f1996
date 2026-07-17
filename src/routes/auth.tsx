import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { getMyAccessContext } from "@/lib/company.functions";
import { resolveHomeRoute } from "@/lib/access-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  Building2,
  Loader2,
  Mail,
  Lock,
  Sparkles,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  Fingerprint,
  Cloud,
  Users,
  Headphones,
  BadgeCheck,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { describeAuthError } from "@/lib/auth-errors";
import { checkLoginRateLimit, recordLoginEvent } from "@/lib/sessions.functions";
import {
  getFailedAttempts,
  incFailedAttempts,
  resetFailedAttempts,
} from "@/lib/auth-attempts";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { getAppOrigin, getAppUrl } from "@/lib/app-url";
import {
  consumePendingRedirect,
  clearPendingRedirect,
  savePendingRedirect,
} from "@/lib/pending-redirect";
import { SignupAssistant } from "@/components/SignupAssistant";
import { LoginStage } from "@/components/hbspro/login/LoginStage";
import { HBS } from "@/components/hbspro/tokens";

// Only allow same-origin absolute paths as redirect targets to prevent open
// redirects to arbitrary hosts. Query strings and fragments are preserved so
// deep links keep their state (e.g. /dashboard?tab=x, /reset-password?token=y).
export function safeRedirect(target: string | undefined): string | null {
  if (!target) return null;
  // Leading whitespace / control chars — browsers strip these and then
  // re-parse, turning " //evil.com" into "//evil.com".
  if (/^[\s\u0000-\u001f]/.test(target)) return null;
  if (!target.startsWith("/")) return null;
  // Protocol-relative and backslash-normalization vectors:
  //   "//evil.com" and "/\evil.com" both resolve to another host in some clients.
  if (target.startsWith("//") || target.startsWith("/\\")) return null;
  // URL-encoded slash smuggling: "/%2f%2fevil.com" decodes to "//evil.com".
  const lower = target.toLowerCase();
  if (lower.startsWith("/%2f") || lower.startsWith("/%5c")) return null;
  // Never bounce back to the auth pages themselves (case-insensitive; loop guard).
  const pathOnly = lower.split(/[?#]/, 1)[0];
  if (pathOnly === "/auth" || pathOnly.startsWith("/auth/")) return null;
  return target;
}


export async function routeAfterLogin(nav: ReturnType<typeof useNavigate>, redirect?: string) {
  // 1) Explicit ?redirect= wins when it points at a safe same-origin path.
  const safe = safeRedirect(redirect);
  if (safe) {
    clearPendingRedirect();
    nav({ to: safe, replace: true });
    return;
  }
  // 2) Fall back to the destination we stashed before bouncing to /auth.
  //    Some WebViews strip query params on OAuth round-trips, so this is
  //    the only signal left when the query param is gone.
  const stashed = safeRedirect(consumePendingRedirect() ?? undefined);
  if (stashed) {
    nav({ to: stashed, replace: true });
    return;
  }
  // 3) No preserved intent — resolve the user's default home route.
  try {
    const ctx = await getMyAccessContext();
    const target = resolveHomeRoute(ctx);
    nav(target ?? { to: "/dashboard", replace: true });
  } catch {
    nav({ to: "/dashboard", replace: true });
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (raw): {
    redirect?: string;
    mode?: "signin" | "signup";
    reason?: "signin_required" | "session_expired" | "access_denied";
  } => {
    const r = raw?.redirect;
    const m = raw?.mode;
    const rn = raw?.reason;
    const out: {
      redirect?: string;
      mode?: "signin" | "signup";
      reason?: "signin_required" | "session_expired" | "access_denied";
    } = {};
    if (typeof r === "string" && r.length > 0 && r.length < 2000) out.redirect = r;
    if (m === "signin" || m === "signup") out.mode = m;
    if (rn === "signin_required" || rn === "session_expired" || rn === "access_denied") out.reason = rn;
    return out;
  },
  head: () => ({
    meta: [
      { title: i18n.t("auth.metaTitle") },
      { name: "description", content: i18n.t("auth.metaDesc") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { redirect: redirectTarget, reason } = useSearch({ from: "/auth" });
  const { user, ready } = useAuth();

  // Email-only flow: step "email" -> ask for address; step "otp" -> verify 6-digit code.
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Persist any incoming ?redirect= so we can recover it if the WebView
  // strips query params during an OAuth / magic-link round-trip.
  useEffect(() => {
    const safe = safeRedirect(redirectTarget);
    if (safe) savePendingRedirect(safe);
  }, [redirectTarget]);

  useEffect(() => {
    if (ready && user) {
      void routeAfterLogin(nav, redirectTarget);
    }
  }, [ready, user, nav, redirectTarget]);
  useEffect(() => {
    document.title = t("auth.metaTitle");
  }, [t, i18n.language]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const trimmedEmail = email.trim().toLowerCase();

  const sendOtp = async (opts?: { silent?: boolean }) => {
    if (!trimmedEmail) {
      toast.error(
        i18n.language?.startsWith("ar")
          ? "أدخل بريدك الإلكتروني"
          : "Enter your email",
      );
      return;
    }
    setSending(true);
    try {
      const fp = getDeviceFingerprint();
      const rl = await checkLoginRateLimit({ data: { identifier: trimmedEmail } });
      if (rl.blocked) {
        await recordLoginEvent({
          data: {
            email: trimmedEmail,
            fingerprint: fp,
            userAgent: navigator.userAgent,
            status: "rate_limited",
            reason: `${rl.attempts}/${rl.max}`,
          },
        }).catch(() => {});
        throw new Error(
          t("auth.rateLimited", { minutes: Math.ceil(rl.retry_after_seconds / 60) }),
        );
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: getAppUrl("/dashboard"),
        },
      });
      if (error) throw error;
      setStep("otp");
      setResendIn(30);
      if (!opts?.silent) {
        toast.success(
          i18n.language?.startsWith("ar")
            ? "أرسلنا رمز الدخول إلى بريدك"
            : "We sent a code to your email",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "Error");
      console.error("[auth]", "send-otp failed:", msg);
      const hint = describeAuthError(err, i18n.language);
      toast.error(hint.title, { description: hint.description });
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otp.replace(/\D/g, "").length < 6) {
      toast.error(
        i18n.language?.startsWith("ar")
          ? "أدخل الرمز المكون من 6 أرقام"
          : "Enter the 6-digit code",
      );
      return;
    }
    setVerifying(true);
    const fp = getDeviceFingerprint();
    const ua = navigator.userAgent;
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: otp.replace(/\D/g, ""),
        type: "email",
      });
      if (error) {
        await recordLoginEvent({
          data: {
            email: trimmedEmail,
            fingerprint: fp,
            userAgent: ua,
            status: "failed",
            reason: error.message,
          },
        }).catch(() => {});
        incFailedAttempts(trimmedEmail);
        throw error;
      }
      await recordLoginEvent({
        data: { email: trimmedEmail, fingerprint: fp, userAgent: ua, status: "success" },
      }).catch(() => {});
      resetFailedAttempts(trimmedEmail);
      await routeAfterLogin(nav, redirectTarget);
    } catch (err) {
      const hint = describeAuthError(err, i18n.language);
      toast.error(hint.title, { description: hint.description });
    } finally {
      setVerifying(false);
    }
  };

  const sendMagicLink = async () => {
    if (!trimmedEmail) {
      toast.error(
        i18n.language?.startsWith("ar") ? "أدخل بريدك الإلكتروني" : "Enter your email",
      );
      return;
    }
    setMagicLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: getAppUrl("/dashboard"),
        },
      });
      if (error) throw error;
      toast.success(
        i18n.language?.startsWith("ar")
          ? "أرسلنا رابط الدخول — تحقق من بريدك"
          : "Magic link sent — check your inbox",
      );
    } catch (err) {
      const hint = describeAuthError(err, i18n.language);
      toast.error(hint.title, { description: hint.description });
    } finally {
      setMagicLoading(false);
    }
  };

  const onGoogle = async () => {
    setOauthLoading(true);
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: getAppOrigin() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OAuth error");
      setOauthLoading(false);
    }
  };

  const notImplemented = (label: string) => () => toast(t("auth.comingSoonLabel", { label }));

  const onDeveloperAccount = async () => {
    setDevLoading(true);
    const devEmail = `dev+${Math.random().toString(36).slice(2, 8)}@hbspro.dev`;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: devEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: getAppUrl("/dashboard"),
          data: { full_name: "Developer", account_type: "developer" },
        },
      });
      if (error) throw error;
      setEmail(devEmail);
      setStep("otp");
      toast.success(
        i18n.language?.startsWith("ar")
          ? `أُرسل رمز الدخول إلى ${devEmail}`
          : `Code sent to ${devEmail}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Developer signup failed");
    } finally {
      setDevLoading(false);
    }
  };


  return (
    <div
      className="theme-luxe relative min-h-[var(--app-height,100vh)] overflow-hidden"
      style={{ background: "radial-gradient(circle at 18% 12%, rgba(197,160,89,0.18), transparent 34%), linear-gradient(135deg, #031f17 0%, #043927 58%, #0a5238 100%)", color: HBS.white }}
    >
      <div className="absolute top-4 end-4 z-30">
        <LanguageSwitcher />
      </div>
      <SignupAssistant />

      <div className="relative grid min-h-[var(--app-height,100vh)] grid-cols-1 lg:grid-cols-[6fr_4fr]">
        {/* LEFT — cinematic stage */}
        <div className="relative hidden lg:block">
          <LoginStage />
        </div>

        {/* RIGHT — luxury glass panel */}
        <div
          className="relative flex items-center justify-center px-4 py-10 sm:px-8"
          style={{ background: "linear-gradient(180deg, rgba(3,31,23,0.96), rgba(4,57,39,0.98))" }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(500px 400px at 80% 20%, rgba(212,175,55,0.14), transparent 60%), radial-gradient(500px 400px at 10% 80%, rgba(13,122,95,0.22), transparent 60%)`,
            }}
          />

          <motion.div
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[520px]"
          >
            {/* animated gold border glow */}
            <motion.div
              aria-hidden
              className="absolute -inset-[1px] rounded-[30px]"
              style={{
                background: `conic-gradient(from 0deg, ${HBS.gold}, transparent 30%, ${HBS.blue}, transparent 70%, ${HBS.gold})`,
                filter: "blur(8px)",
                opacity: 0.55,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="studio-card-lg relative rounded-[30px] border p-8 backdrop-blur-2xl sm:p-10"
              style={{
                borderColor: HBS.border,
                background:
                  "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                boxShadow: `0 40px 120px -30px ${HBS.blue}, 0 0 0 1px rgba(212,175,55,0.08) inset`,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 font-semibold tracking-tight lg:hidden"
                >
                  <span
                    className="grid size-9 place-items-center rounded-xl"
                    style={{ background: `linear-gradient(140deg, ${HBS.gold}, ${HBS.blue})` }}
                  >
                    <Building2 className="size-4 text-white" />
                  </span>
                  <span className="text-white">
                    HBSpro <span style={{ color: HBS.gold }}>AI</span>
                  </span>
                </Link>
                <div
                  className="ms-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]"
                  style={{ borderColor: HBS.border, color: HBS.goldSoft }}
                >
                  <BadgeCheck className="size-3" /> {t("auth.enterpriseBadge")}
                </div>
              </div>

              <div className="mt-6">
                <h1
                  className="text-3xl font-bold leading-tight tracking-tight"
                  style={{ color: HBS.white }}
                >
                  {t("auth.welcome")} <span style={{ color: HBS.gold }}>HBSpro</span>
                </h1>
                <p className="mt-2 text-sm" style={{ color: HBS.gray }}>
                  {t("auth.welcomeSubtitle")}
                </p>
              </div>

              {/* Step indicator */}
              <div
                className="mt-6 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderColor: HBS.border,
                  color: HBS.gray,
                }}
              >
                <Mail className="size-3.5" style={{ color: HBS.gold }} />
                <span>
                  {step === "email"
                    ? i18n.language?.startsWith("ar")
                      ? "الدخول والتسجيل بالبريد فقط — سنرسل لك رمزاً"
                      : "Email-only sign in / sign up — we'll send you a code"
                    : i18n.language?.startsWith("ar")
                      ? `أدخل الرمز المُرسل إلى ${trimmedEmail}`
                      : `Enter the code we sent to ${trimmedEmail}`}
                </span>
              </div>


              {reason && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-4 rounded-lg border p-3 text-sm"
                  style={{
                    background:
                      reason === "session_expired"
                        ? "rgba(234,179,8,0.10)"
                        : reason === "access_denied"
                          ? "rgba(239,68,68,0.10)"
                          : "rgba(59,130,246,0.10)",
                    borderColor:
                      reason === "session_expired"
                        ? "rgba(234,179,8,0.35)"
                        : reason === "access_denied"
                          ? "rgba(239,68,68,0.35)"
                          : "rgba(59,130,246,0.35)",
                    color: HBS.gray,
                  }}
                >
                  <div className="font-medium">
                    {reason === "session_expired"
                      ? "انتهت جلستك"
                      : reason === "access_denied"
                        ? "لا تملك صلاحية الوصول"
                        : "الدخول مطلوب"}
                  </div>
                  <div className="mt-0.5 text-xs opacity-90">
                    {reason === "session_expired"
                      ? "انتهت صلاحية جلسة الدخول. سجّل الدخول مجدداً للمتابعة إلى الصفحة المطلوبة."
                      : reason === "access_denied"
                        ? "الحساب الحالي لا يملك صلاحية فتح هذه الصفحة. سجّل الدخول بحساب لديه الصلاحية المناسبة."
                        : "هذه الصفحة تتطلب تسجيل الدخول. أكمل تسجيل الدخول وسنعيدك تلقائياً إلى الصفحة التي طلبتها."}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!ready}
                      onClick={async () => {
                        const { data } = await supabase.auth.getSession();
                        if (data.session) {
                          await routeAfterLogin(nav, redirectTarget);
                        } else {
                          toast(
                            i18n.language?.startsWith("ar")
                              ? "أكمل تسجيل الدخول أدناه ثم اضغط متابعة."
                              : "Sign in below, then press Continue.",
                          );
                        }
                      }}
                      className="h-8 rounded-lg px-3 text-xs font-semibold"
                      style={{
                        background: `linear-gradient(140deg, ${HBS.gold}, ${HBS.blue})`,
                        color: HBS.white,
                      }}
                    >
                      {i18n.language?.startsWith("ar") ? "متابعة الآن" : "Continue now"}
                    </Button>
                    {redirectTarget && safeRedirect(redirectTarget) && (
                      <span className="truncate text-[10px] opacity-70" style={{ color: HBS.gray }}>
                        → {safeRedirect(redirectTarget)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {step === "email" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendOtp();
                  }}
                  className="mt-6 space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="email"
                      className="text-xs uppercase tracking-[0.18em]"
                      style={{ color: HBS.gray }}
                    >
                      {t("auth.email")}
                    </Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                        style={{ color: HBS.gray }}
                      />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 rounded-xl border-white/10 bg-white/5 ps-9 text-white placeholder:text-white/60 focus-visible:ring-1"
                        style={{ borderColor: HBS.border }}
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="group relative h-12 w-full overflow-hidden rounded-xl border-0 text-base font-semibold text-white transition-transform hover:-translate-y-0.5"
                    style={{
                      background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
                      boxShadow: `0 20px 50px -15px ${HBS.gold}`,
                    }}
                    disabled={sending}
                  >
                    {sending && <Loader2 className="me-2 size-4 animate-spin" />}
                    <KeyRound className="me-2 size-4" />
                    {i18n.language?.startsWith("ar")
                      ? "أرسل رمز الدخول"
                      : "Send login code"}
                  </Button>

                  <button
                    type="button"
                    onClick={sendMagicLink}
                    disabled={magicLoading}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm transition hover:-translate-y-0.5 disabled:opacity-60"
                    style={{
                      borderColor: HBS.border,
                      background: "rgba(255,255,255,0.03)",
                      color: HBS.white,
                    }}
                  >
                    {magicLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Mail className="size-4" style={{ color: HBS.gold }} />
                    )}
                    {i18n.language?.startsWith("ar")
                      ? "أو أرسل رابط دخول سحري"
                      : "Or send a magic link"}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyOtp} className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="otp"
                      className="text-xs uppercase tracking-[0.18em]"
                      style={{ color: HBS.gray }}
                    >
                      {i18n.language?.startsWith("ar") ? "رمز الدخول" : "Login code"}
                    </Label>
                    <div className="relative">
                      <KeyRound
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                        style={{ color: HBS.gold }}
                      />
                      <Input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="h-12 rounded-xl border-white/10 bg-white/5 ps-9 text-center font-mono text-2xl tracking-[0.6em] text-white placeholder:text-white/40"
                        style={{ borderColor: HBS.border }}
                        placeholder="••••••"
                      />
                    </div>
                    <p className="text-[10px]" style={{ color: HBS.gray }}>
                      {i18n.language?.startsWith("ar")
                        ? "أدخل الرمز المكون من 6 أرقام. صالح لـ 60 دقيقة."
                        : "Enter the 6-digit code. Valid for 60 minutes."}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full overflow-hidden rounded-xl border-0 text-base font-semibold text-white"
                    style={{
                      background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
                      boxShadow: `0 20px 50px -15px ${HBS.gold}`,
                    }}
                    disabled={verifying}
                  >
                    {verifying && <Loader2 className="me-2 size-4 animate-spin" />}
                    {i18n.language?.startsWith("ar") ? "دخول" : "Sign in"}
                  </Button>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setOtp("");
                      }}
                      className="hover:underline"
                      style={{ color: HBS.gray }}
                    >
                      {i18n.language?.startsWith("ar") ? "← تغيير البريد" : "← Change email"}
                    </button>
                    <button
                      type="button"
                      disabled={resendIn > 0 || sending}
                      onClick={() => void sendOtp()}
                      className="hover:underline disabled:opacity-50"
                      style={{ color: HBS.goldSoft }}
                    >
                      {resendIn > 0
                        ? i18n.language?.startsWith("ar")
                          ? `إعادة الإرسال بعد ${resendIn}ث`
                          : `Resend in ${resendIn}s`
                        : i18n.language?.startsWith("ar")
                          ? "إعادة إرسال الرمز"
                          : "Resend code"}
                    </button>
                  </div>
                </form>
              )}



              {/* Social providers removed per product decision */}

              {/* OTP + Biometric */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={notImplemented(t("auth.otpNotImplemented"))}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm transition hover:-translate-y-0.5"
                  style={{
                    borderColor: HBS.border,
                    background: "rgba(255,255,255,0.03)",
                    color: HBS.white,
                  }}
                >
                  <KeyRound className="size-4" style={{ color: HBS.gold }} /> {t("auth.otp")}
                </button>
                <button
                  type="button"
                  onClick={notImplemented(t("auth.biometricNotImplemented"))}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border text-sm transition hover:-translate-y-0.5"
                  style={{
                    borderColor: HBS.border,
                    background: "rgba(255,255,255,0.03)",
                    color: HBS.white,
                  }}
                >
                  <Fingerprint className="size-4" style={{ color: HBS.blueSoft }} />{" "}
                  {t("auth.biometric")}
                </button>
              </div>

              {/* Developer account */}
              <div
                className="mt-5 rounded-2xl border border-dashed p-4"
                style={{
                  borderColor: `${HBS.gold}55`,
                  background: `linear-gradient(140deg, ${HBS.gold}10, ${HBS.blue}08)`,
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg"
                    style={{ background: `${HBS.gold}22`, color: HBS.gold }}
                  >
                    <Sparkles className="size-4" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: HBS.white }}>
                      {t("auth.devAccountTitle")}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: HBS.gray }}>
                      {t("auth.devAccountDesc")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 w-full rounded-xl text-white"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: `1px solid ${HBS.border}`,
                      }}
                      onClick={onDeveloperAccount}
                      disabled={devLoading}
                    >
                      {devLoading && <Loader2 className="me-2 size-4 animate-spin" />}
                      {t("auth.devAccountBtn")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Security */}
              <div
                className="mt-6 rounded-2xl border p-4"
                style={{ borderColor: HBS.border, background: "rgba(255,255,255,0.03)" }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4" style={{ color: HBS.gold }} />
                  <div
                    className="text-xs font-semibold uppercase tracking-[0.2em]"
                    style={{ color: HBS.goldSoft }}
                  >
                    {t("auth.enterpriseSecurity")}
                  </div>
                </div>
                <div
                  className="mt-3 grid grid-cols-2 gap-2 text-[11px]"
                  style={{ color: HBS.gray }}
                >
                  {[
                    t("auth.encryptedLogin"),
                    t("auth.jwtReady"),
                    t("auth.socCert"),
                  ].map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <BadgeCheck className="size-3" style={{ color: HBS.blueSoft }} /> {s}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer chips */}
              <div
                className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] uppercase tracking-[0.2em]"
                style={{ color: HBS.gray }}
              >
                <FooterChip icon={Sparkles}>{t("auth.aiPowered")}</FooterChip>
                <FooterChip icon={BadgeCheck}>{t("auth.saudiReady")}</FooterChip>
                <FooterChip icon={Cloud}>{t("auth.cloud")}</FooterChip>
                <FooterChip icon={Headphones}>{t("auth.support247")}</FooterChip>
                <FooterChip icon={ShieldCheck}>{t("auth.secure")}</FooterChip>
                <FooterChip icon={Users}>{t("auth.multiTenant")}</FooterChip>
              </div>

              <p className="mt-5 text-center text-[11px]" style={{ color: HBS.gray }}>
                {t("auth.footerCopyright", {
                  year: new Date().getFullYear(),
                  legal: t("auth.footerLegal"),
                })}
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SocialBtn({
  onClick,
  loading,
  label,
  svg,
}: {
  onClick: () => void;
  loading?: boolean;
  label: string;
  svg: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      className="group flex h-11 items-center justify-center rounded-xl border transition hover:-translate-y-0.5 disabled:opacity-60"
      style={{ borderColor: HBS.border, background: "rgba(255,255,255,0.04)" }}
    >
      {loading ? <Loader2 className="size-4 animate-spin text-white" /> : svg}
    </button>
  );
}

function FooterChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-1"
      style={{ borderColor: HBS.border }}
    >
      <Icon className="size-3" style={{ color: HBS.goldSoft }} />
      {children}
    </span>
  );
}
