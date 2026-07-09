import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  getPortalInvitationByToken,
  acceptPortalInvitation,
} from "@/lib/portal-invitations.functions";

export const Route = createFileRoute("/portal-invite/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Accept portal invitation — Aqari" }, { name: "robots", content: "noindex" }],
  }),
  component: AcceptPage,
});

type Invite = Awaited<ReturnType<typeof getPortalInvitationByToken>>;

function AcceptPage() {
  const { t } = useTranslation();
  const { token } = useParams({ from: "/portal-invite/$token" });
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    getPortalInvitationByToken({ data: { token } })
      .then((row) => setInvite(row))
      .catch((e: any) => setError(e?.message ?? t("portalInvite.genericError")));
  }, [token, ready, user, t]);

  const expired = invite && new Date(invite.expires_at).getTime() < Date.now();
  const used = !!invite?.accepted_at;
  const emailMismatch =
    !!invite && !!user?.email && user.email.toLowerCase() !== invite.email.toLowerCase();

  async function onAccept() {
    setAccepting(true);
    try {
      await acceptPortalInvitation({ data: { token } });
      toast.success(t("portalInvite.accepted"));
      nav({ to: invite?.kind === "owner" ? "/portal/owner" : "/portal", replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? t("portalInvite.genericError"));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="grid min-h-[var(--app-height,100vh)] place-items-center bg-gradient-to-b from-background to-muted/30 px-4">
      <div className="w-full max-w-md surface-card p-8 shadow-sm">
        <div className="mb-6 inline-flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </span>
          {t("portalInvite.brand")}
        </div>

        {ready && !user && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("portalInvite.signInPrompt")}</p>
            <Button asChild className="w-full">
              <Link to="/auth">{t("portalInvite.signIn")}</Link>
            </Button>
          </div>
        )}
        {(!ready || (user && !invite && !error)) && (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {invite && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              {t("portalInvite.inviteTo", { org: invite.org_name })}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("portalInvite.invitedAs", {
                role:
                  invite.kind === "tenant"
                    ? t("portalInvite.roleTenant")
                    : t("portalInvite.roleOwner"),
                email: invite.email,
              })}
            </p>
            <div className="mt-6 space-y-3">
              {used && (
                <p className="text-sm text-muted-foreground">{t("portalInvite.alreadyAccepted")}</p>
              )}
              {!used && expired && (
                <p className="text-sm text-destructive">{t("portalInvite.expired")}</p>
              )}
              {!used && !expired && emailMismatch && (
                <p className="text-sm text-destructive">
                  {t("portalInvite.wrongAccount", { email: invite.email })}
                </p>
              )}
              {!used && !expired && !emailMismatch && (
                <Button className="w-full" onClick={onAccept} disabled={accepting}>
                  {accepting && <Loader2 className="size-4 me-2 animate-spin" />}
                  {t("portalInvite.accept")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
