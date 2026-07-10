import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  HBSAuthShell,
  hbsInputClass,
  hbsInputStyle,
  hbsPrimaryBtnStyle,
} from "@/components/hbspro/AuthShell";
import { HBS } from "@/components/hbspro/tokens";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Reset password — HBSpro" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase places recovery tokens in the URL hash and auto-establishes a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error(t("reset.tooShort"));
    if (password !== confirm) return toast.error(t("reset.mismatch"));
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success(t("reset.successToast"));
      setTimeout(() => nav({ to: "/dashboard", replace: true }), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reset.updateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HBSAuthShell eyebrow="Reset">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: HBS.white }}>
        {t("reset.title")}
      </h1>
      <p className="mt-1 text-sm" style={{ color: HBS.gray }}>
        {t("reset.subtitle")}
      </p>

      {ready && !hasSession && (
        <div
          className="mt-6 flex items-start gap-3 rounded-xl p-4 text-sm"
          style={{
            border: `1px solid ${HBS.border}`,
            background: `${HBS.gold}12`,
            color: HBS.goldSoft,
          }}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: HBS.gold }} />
          <div style={{ color: HBS.white }}>
            {t("reset.linkInvalid")}
            <Link
              to="/forgot-password"
              className="ms-1 font-medium hover:underline"
              style={{ color: HBS.goldSoft }}
            >
              {t("reset.requestNew")}
            </Link>
            .
          </div>
        </div>
      )}

      {done ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-xl p-4"
          style={{ border: `1px solid ${HBS.border}`, background: `${HBS.gold}12` }}
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: HBS.goldSoft }} />
          <div className="text-sm" style={{ color: HBS.white }}>
            {t("reset.done")}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: HBS.gray }}
            >
              {t("reset.newPassword")}
            </Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                style={{ color: HBS.gold }}
              />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`ps-9 ${hbsInputClass}`}
                style={hbsInputStyle}
                placeholder="••••••••"
                disabled={!hasSession}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="confirm"
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: HBS.gray }}
            >
              {t("reset.confirmPassword")}
            </Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                style={{ color: HBS.gold }}
              />
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`ps-9 ${hbsInputClass}`}
                style={hbsInputStyle}
                placeholder="••••••••"
                disabled={!hasSession}
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full border-0"
            style={hbsPrimaryBtnStyle}
            disabled={submitting || !hasSession}
          >
            {submitting && <Loader2 className="me-2 size-4 animate-spin" />}
            {t("reset.submit")}
          </Button>
        </form>
      )}
    </HBSAuthShell>
  );
}
