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
  ssr: false,
  validateSearch: (raw): { redirect?: string } => {
    const r = raw?.redirect;
    return typeof r === "string" && r.length > 0 && r.length < 2000 ? { redirect: r } : {};
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
  const { redirect: redirectTarget } = useSearch({ from: "/auth" });
  const { user, ready } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [establishmentNo, setEstablishmentNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    setFailedAttempts(getFailedAttempts(email));
  }, [email]);


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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: getAppUrl("/onboarding/wizard") },
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
        // If session is available immediately (email confirmations disabled), go collect profile.
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) nav({ to: "/onboarding/wizard", replace: true });
      } else {
        const fp = getDeviceFingerprint();
        const ua = navigator.userAgent;
        const estNo = establishmentNo.trim();
        const rl = await checkLoginRateLimit({ data: { identifier: email } });

        if (rl.blocked) {
          await recordLoginEvent({
            data: {
              email,
              fingerprint: fp,
              userAgent: ua,
              status: "rate_limited",
              reason: `${rl.attempts}/${rl.max}`,
            },
          }).catch(() => {});
          throw new Error(
            t("auth.rateLimited", { minutes: Math.ceil(rl.retry_after_seconds / 60) }),
          );
        }
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          await recordLoginEvent({
            data: {
              email,
              fingerprint: fp,
              userAgent: ua,
              status: "failed",
              reason: error.message,
            },
          }).catch(() => {});
          setFailedAttempts(incFailedAttempts(email));
          throw error;
        }
        // Verify establishment membership only when the user typed a number.
        // Portal tenants/owners and site admins sign in without one.
        if (estNo) {
          const { data: ok, error: vErr } = await supabase.rpc(
            "verify_my_establishment" as never,
            { _est_no: estNo } as never,
          );
          if (vErr || ok !== true) {
            await supabase.auth.signOut();
            await recordLoginEvent({
              data: {
                email,
                fingerprint: fp,
                userAgent: ua,
                status: "failed",
                reason: `establishment_mismatch:${estNo}`,
              },
            }).catch(() => {});
            setFailedAttempts(incFailedAttempts(email));
            throw new Error(t("auth.establishmentMismatch"));
          }
        }
        await recordLoginEvent({
          data: { email, fingerprint: fp, userAgent: ua, status: "success" },
        }).catch(() => {});
        resetFailedAttempts(email);
        await routeAfterLogin(nav, redirectTarget);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
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
    const devPassword = `Dev!${Math.random().toString(36).slice(2, 10)}Aa1`;
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: devEmail,
        password: devPassword,
        options: {
          emailRedirectTo: getAppUrl("/dashboard"),
          data: { full_name: "Developer", account_type: "developer" },
        },
      });
      if (signUpErr) throw signUpErr;
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: devEmail,
        password: devPassword,
      });
      if (signInErr) throw signInErr;
      // Provision sandbox org + RBAC role + approve profile + grant trial.
      // Without this, the user lands on wizard with a pending profile and no roles.
      try {
        const { provisionDeveloperWorkspace } = await import(
          "@/lib/organizations.functions"
        );
        await provisionDeveloperWorkspace();
      } catch (provErr) {
        console.warn("Developer provisioning deferred:", provErr);
      }
      try {
        await navigator.clipboard.writeText(`${devEmail} / ${devPassword}`);
      } catch {}
      toast.success(t("auth.devAccountCreated", { email: devEmail, defaultValue: `Developer account created: ${devEmail} — credentials copied to clipboard` }));
      nav({ to: "/onboarding/wizard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Developer signup failed");
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div
      className="theme-luxe relative min-h-[var(--app-height,100vh)] overflow-hidden"
      style={{ background: HBS.bg, color: HBS.white }}
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
          style={{ background: `linear-gradient(180deg, ${HBS.bg}, #04101c)` }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(500px 400px at 80% 20%, rgba(212,175,55,0.14), transparent 60%), radial-gradient(500px 400px at 10% 80%, rgba(30,136,229,0.14), transparent 60%)`,
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
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
              className="relative rounded-[30px] border p-8 backdrop-blur-2xl sm:p-10"
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

              {/* Tabs */}
              <div
                className="mt-6 grid grid-cols-2 gap-1 rounded-xl p-1"
                style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${HBS.border}` }}
              >
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="relative rounded-lg px-3 py-2 text-sm font-medium transition"
                    style={{
                      background:
                        mode === m
                          ? `linear-gradient(140deg, ${HBS.gold}22, ${HBS.blue}22)`
                          : "transparent",
                      color: mode === m ? HBS.white : HBS.gray,
                      boxShadow: mode === m ? `inset 0 0 0 1px ${HBS.border}` : "none",
                    }}
                  >
                    {m === "signin" ? t("auth.signIn") : t("auth.signUp")}
                  </button>
                ))}
              </div>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                {mode === "signin" && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="est_no"
                      className="text-xs uppercase tracking-[0.18em]"
                      style={{ color: HBS.gray }}
                    >
                      {t("auth.establishmentNo")}{" "}
                      <span className="opacity-60">{t("auth.establishmentOptional")}</span>
                    </Label>
                    <div className="relative">
                      <Building
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                        style={{ color: HBS.gold }}
                      />
                      <Input
                        id="est_no"
                        type="text"
                        autoComplete="off"
                        value={establishmentNo}
                        onChange={(e) => setEstablishmentNo(e.target.value.toUpperCase())}
                        className="h-12 rounded-xl border-white/10 bg-white/5 ps-9 font-mono tracking-widest text-white placeholder:text-white/60"
                        style={{ borderColor: HBS.border }}
                        placeholder="HBS-000123"
                      />
                    </div>
                    <p className="text-[10px]" style={{ color: HBS.gray }}>
                      {t("auth.establishmentHint")}
                    </p>
                  </div>
                )}
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
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs uppercase tracking-[0.18em]"
                    style={{ color: HBS.gray }}
                  >
                    {t("auth.password")}
                  </Label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                      style={{ color: HBS.gray }}
                    />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 rounded-xl border-white/10 bg-white/5 ps-9 pe-10 text-white placeholder:text-white/60"
                      style={{ borderColor: HBS.border }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md hover:bg-white/10"
                      style={{ color: HBS.gray }}
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                {mode === "signin" && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs" style={{ color: HBS.gray }}>
                      <Checkbox
                        checked={remember}
                        onCheckedChange={(v) => setRemember(v === true)}
                        className="border-white/30"
                      />
                      {t("auth.rememberMe")}
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs hover:underline"
                      style={{ color: HBS.goldSoft }}
                    >
                      {t("auth.forgotPassword")}
                    </Link>
                  </div>
                )}
                <Button
                  type="submit"
                  className="group relative h-12 w-full overflow-hidden rounded-xl border-0 text-base font-semibold text-white transition-transform hover:-translate-y-0.5"
                  style={{
                    background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
                    boxShadow: `0 20px 50px -15px ${HBS.gold}`,
                  }}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="me-2 size-4 animate-spin" />}
                  {mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
                </Button>
              </form>


              {/* Divider */}
              <div
                className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em]"
                style={{ color: HBS.gray }}
              >
                <div className="h-px flex-1" style={{ background: HBS.border }} />
                <span>{t("auth.orDivider")}</span>
                <div className="h-px flex-1" style={{ background: HBS.border }} />
              </div>

              {/* Social */}
              <div className="grid grid-cols-3 gap-2">
                <SocialBtn
                  onClick={onGoogle}
                  loading={oauthLoading}
                  label="Google"
                  svg={
                    <svg viewBox="0 0 24 24" className="size-4">
                      <path
                        fill="#EA4335"
                        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.6 14.6 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c6.9 0 9.2-4.8 9.2-7.3 0-.5 0-.9-.1-1.3H12z"
                      />
                    </svg>
                  }
                />
                <SocialBtn
                  onClick={notImplemented("Microsoft")}
                  label="Microsoft"
                  svg={
                    <svg viewBox="0 0 24 24" className="size-4">
                      <rect x="2" y="2" width="9" height="9" fill="#F35325" />
                      <rect x="13" y="2" width="9" height="9" fill="#81BC06" />
                      <rect x="2" y="13" width="9" height="9" fill="#05A6F0" />
                      <rect x="13" y="13" width="9" height="9" fill="#FFBA08" />
                    </svg>
                  }
                />
                <SocialBtn
                  onClick={notImplemented("Apple")}
                  label="Apple"
                  svg={
                    <svg viewBox="0 0 24 24" className="size-4 fill-white">
                      <path d="M16.365 1.43c0 1.14-.42 2.21-1.11 3-.74.85-1.96 1.51-3.02 1.43-.13-1.11.42-2.28 1.11-3.02.78-.86 2.1-1.5 3.02-1.41zM20.5 17.44c-.55 1.27-.82 1.84-1.53 2.97-.99 1.57-2.39 3.52-4.13 3.54-1.55.01-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.78-4.06-3.35C.31 16.86-.08 12.24 1.66 9.75c1.24-1.77 3.2-2.81 5.03-2.81 1.87 0 3.05.99 4.6.99 1.5 0 2.42-.99 4.58-.99 1.64 0 3.37.9 4.61 2.44-4.05 2.22-3.39 8-.01 9.06z" />
                    </svg>
                  }
                />
              </div>

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
                    t("auth.twoFactorAuth"),
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
