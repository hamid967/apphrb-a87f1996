import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ShieldCheck, RefreshCw, LogOut, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { provisionDeveloperWorkspace } from "@/lib/organizations.functions";
import {
  HBSAuthShell,
  hbsInputClass,
  hbsInputStyle,
  hbsPrimaryBtnStyle,
} from "@/components/hbspro/AuthShell";
import { HBS } from "@/components/hbspro/tokens";

export const Route = createFileRoute("/dev/verify")({
  ssr: false,
  head: () => ({
    meta: [{ title: "تأكيد حساب المطوّر — Aqari" }, { name: "robots", content: "noindex" }],
  }),
  component: DevVerifyPage,
});

const COOLDOWN = 60;
const EPHEMERAL_DOMAIN = "@hbspro.dev";

function isVerifiedDev(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null,
) {
  if (!user) return false;
  const meta = (user.user_metadata ?? {}) as { dev_verified?: boolean; account_type?: string };
  if (meta.dev_verified === true) return true;
  // Fallback: real email (not the ephemeral one) means the confirmation succeeded.
  return !!user.email && !user.email.endsWith(EPHEMERAL_DOMAIN);
}

function DevVerifyPage() {
  const nav = useNavigate();
  const { user, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const provisionFn = useServerFn(provisionDeveloperWorkspace);
  const [prov, setProv] = useState<{
    status: "idle" | "running" | "done" | "error";
    org?: boolean;
    role?: boolean;
    perms?: number;
    error?: string;
  }>({ status: "idle" });

  // Auto-provision org + role + permissions once for developer accounts.
  useEffect(() => {
    if (!ready || !user) return;
    const meta = (user.user_metadata ?? {}) as { account_type?: string };
    if (meta.account_type !== "developer") return;
    if (prov.status !== "idle") return;
    setProv({ status: "running" });
    provisionFn()
      .then((r) =>
        setProv({ status: "done", org: r.created_org, role: true, perms: r.permissions }),
      )
      .catch((e: unknown) =>
        setProv({ status: "error", error: e instanceof Error ? e.message : "فشل التهيئة" }),
      );
  }, [ready, user, prov.status, provisionFn]);

  // Countdown for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Redirect away if this user shouldn't be here.
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      nav({ to: "/auth", replace: true });
      return;
    }
    const meta = (user.user_metadata ?? {}) as { account_type?: string };
    if (meta.account_type !== "developer" || isVerifiedDev(user)) {
      nav({ to: "/dashboard", replace: true });
    }
  }, [ready, user, nav]);

  // Listen for the email-change confirmation event.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== "USER_UPDATED" || !session?.user) return;
      if (isVerifiedDev(session.user)) {
        // Persist the verified flag so future sessions skip this gate.
        await supabase.auth.updateUser({ data: { dev_verified: true } });
        setConfirmed(true);
        toast.success("تم تأكيد البريد وربطه بالجلسة الحالية.");
        setTimeout(() => nav({ to: "/dashboard", replace: true }), 1200);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  const sendConfirmation = async (target: string) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/dev/verify` },
      );
      if (error) throw error;
      setPendingEmail(target);
      setCooldown(COOLDOWN);
      toast.success("أرسلنا رسالة تأكيد. اضغط الرابط داخلها ثم عد إلى هذه الصفحة.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إرسال التأكيد");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0) return;
    void sendConfirmation(email);
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };

  return (
    <HBSAuthShell eyebrow="Developer">
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl"
          style={{
            background: `linear-gradient(140deg, ${HBS.gold}33, ${HBS.blue}33)`,
            color: HBS.goldSoft,
            border: `1px solid ${HBS.border}`,
          }}
        >
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: HBS.white }}>
            تأكيد بريد المطوّر
          </h1>
          <p className="mt-1 text-sm" style={{ color: HBS.gray }}>
            حسابك التجريبي مُقيّد الوصول. أدخل بريداً حقيقياً لإكمال التحقق وتفعيل الوصول الكامل.
          </p>
          {user?.email && (
            <div className="mt-2 text-xs" style={{ color: HBS.gray }}>
              الجلسة الحالية:{" "}
              <span className="font-mono" style={{ color: HBS.goldSoft }}>
                {user.email}
              </span>
            </div>
          )}
        </div>
      </div>

      {confirmed ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-xl p-4"
          style={{ border: `1px solid ${HBS.border}`, background: `${HBS.gold}12` }}
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: HBS.goldSoft }} />
          <div className="text-sm" style={{ color: HBS.white }}>
            تم التأكيد — جارٍ التوجيه إلى لوحة التحكم…
          </div>
        </div>
      ) : !pendingEmail ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="email"
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: HBS.gray }}
            >
              بريدك الحقيقي
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
            إرسال رابط التأكيد
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              border: `1px solid ${HBS.border}`,
              background: "rgba(255,255,255,0.04)",
              color: HBS.gray,
            }}
          >
            أرسلنا رابط التأكيد إلى{" "}
            <span className="font-medium" style={{ color: HBS.white }}>
              {pendingEmail}
            </span>
            . افتحه من نفس المتصفح، وستُحدَّث جلستك تلقائياً هنا.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="border-0"
              style={hbsPrimaryBtnStyle}
              disabled={submitting || cooldown > 0}
              onClick={() => sendConfirmation(pendingEmail)}
            >
              <RefreshCw className="me-2 size-4" />
              {cooldown > 0 ? `${cooldown} ث` : "إعادة الإرسال"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="hover:bg-white/5"
              style={{ color: HBS.gray, border: `1px solid ${HBS.border}` }}
              onClick={() => {
                setPendingEmail(null);
                setEmail("");
              }}
            >
              تغيير البريد
            </Button>
          </div>
        </div>
      )}

      <div
        className="mt-6 rounded-xl p-4"
        style={{ border: `1px solid ${HBS.border}`, background: "rgba(255,255,255,0.03)" }}
      >
        <div
          className="mb-2 text-xs font-medium uppercase tracking-[0.18em]"
          style={{ color: HBS.goldSoft }}
        >
          تهيئة بيئة المطوّر
        </div>
        <ul className="space-y-1.5 text-sm">
          <ProvStep
            label="إنشاء منظمة تجريبية"
            state={
              prov.status === "running"
                ? "running"
                : prov.status === "done"
                  ? "done"
                  : prov.status === "error"
                    ? "error"
                    : "idle"
            }
          />
          <ProvStep
            label="ربط دور «Developer»"
            state={
              prov.status === "done"
                ? "done"
                : prov.status === "running"
                  ? "running"
                  : prov.status === "error"
                    ? "error"
                    : "idle"
            }
          />
          <ProvStep
            label={`تفعيل الصلاحيات${prov.perms ? ` (${prov.perms})` : ""}`}
            state={
              prov.status === "done"
                ? "done"
                : prov.status === "running"
                  ? "running"
                  : prov.status === "error"
                    ? "error"
                    : "idle"
            }
          />
        </ul>
        {prov.status === "error" && (
          <div className="mt-2 text-xs text-destructive">{prov.error}</div>
        )}
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 inline-flex items-center gap-1.5 text-xs transition hover:opacity-80"
        style={{ color: HBS.gray }}
      >
        <LogOut className="size-3.5" />
        تسجيل الخروج
      </button>
    </HBSAuthShell>
  );
}

function ProvStep({
  label,
  state,
}: {
  label: string;
  state: "idle" | "running" | "done" | "error";
}) {
  return (
    <li className="flex items-center gap-2">
      {state === "done" ? (
        <CheckCircle2 className="size-4" style={{ color: HBS.goldSoft }} />
      ) : state === "running" ? (
        <Loader2 className="size-4 animate-spin" style={{ color: HBS.blueSoft }} />
      ) : state === "error" ? (
        <span className="grid size-4 place-items-center rounded-full bg-destructive/20 text-[10px] text-destructive">
          !
        </span>
      ) : (
        <span className="size-4 rounded-full" style={{ border: `1px solid ${HBS.border}` }} />
      )}
      <span style={{ color: state === "done" ? HBS.white : HBS.gray }}>{label}</span>
    </li>
  );
}
