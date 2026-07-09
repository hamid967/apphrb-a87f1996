import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { acceptInvitation } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Loader2, Building2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "قبول دعوة — Aqari" }, { name: "robots", content: "noindex" }],
  }),
  component: InvitePage,
});

type Invite = {
  email: string;
  role: string;
  org_name: string;
  expires_at: string;
  accepted_at: string | null;
};

function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams({ from: "/invite/$token" });
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) return; // require sign-in before revealing invite email
    (async () => {
      const { data, error } = await supabase.rpc("get_invitation_by_token", { _token: token });
      if (error) {
        setError(error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError("Not found");
        return;
      }
      setInvite(row as Invite);
    })();
  }, [token, ready, user]);

  const expired = invite && new Date(invite.expires_at).getTime() < Date.now();
  const used = invite?.accepted_at != null;
  const emailMismatch =
    !!invite && !!user?.email && user.email.toLowerCase() !== invite.email.toLowerCase();

  async function onAccept() {
    setAccepting(true);
    try {
      await acceptInvitation({ data: { token } });
      toast.success(t("team.accept.success"));
      nav({ to: "/dashboard", replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="grid min-h-[var(--app-height,100vh)] place-items-center bg-gradient-to-b from-background to-muted/30 px-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md surface-card p-8 shadow-sm">
        <div className="mb-6 inline-flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </span>
          {t("brand")}
        </div>
        {!invite && !error && ready && !user && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("auth.signInRequired", { defaultValue: "يرجى تسجيل الدخول لعرض تفاصيل الدعوة." })}
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">{t("auth.signIn")}</Link>
            </Button>
          </div>
        )}
        {!invite && !error && (!ready || !!user) && (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {invite && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              {t("team.accept.title", { org: invite.org_name })}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("team.accept.body", { role: t(`team.roles.${invite.role}`), email: invite.email })}
            </p>

            <div className="mt-6 space-y-3">
              {used && <p className="text-sm text-muted-foreground">{t("team.accept.used")}</p>}
              {!used && expired && (
                <p className="text-sm text-destructive">{t("team.accept.expired")}</p>
              )}
              {!used && !expired && ready && !user && (
                <Button asChild className="w-full">
                  <Link to="/auth">{t("auth.signIn")}</Link>
                </Button>
              )}
              {!used && !expired && user && emailMismatch && (
                <p className="text-sm text-destructive">
                  {t("team.accept.wrongEmail", { email: invite.email })}
                </p>
              )}
              {!used && !expired && user && !emailMismatch && (
                <Button className="w-full" onClick={onAccept} disabled={accepting}>
                  {accepting && <Loader2 className="size-4 me-2 animate-spin" />}
                  {t("team.accept.accept")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
