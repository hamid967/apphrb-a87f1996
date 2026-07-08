import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RequireRole } from "@/components/auth/RequireRole";
import { ADMIN_ROLES } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  listPortalInvitations,
  createPortalInvitation,
  revokePortalInvitation,
} from "@/lib/portal-invitations.functions";
import { InvitationCard } from "@/components/admin/InvitationCard";
import { InvitationDetailDialog } from "@/components/admin/InvitationDetailDialog";
import type {
  PortalInvitation,
  InvitationTarget,
  RevokeKind,
} from "@/components/admin/invitation-types";
import { useTranslation } from "react-i18next";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/portal-invitations")({
  head: () => sectionHead({ section: "admin", entityAr: "دعوات المحطات", entityEn: "Portal Invitations", path: "/admin/portal-invitations" }),
  component: () => <GuardedPage />,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    const { t } = useTranslation();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {t("adminInvites.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => {
    const { t } = useTranslation();
    return <div className="p-6">{t("adminInvites.notFound")}</div>;
  },
});

function GuardedPage() {
  const { t } = useTranslation();
  return (
    <RequireRole
      roles={ADMIN_ROLES}
      title={t("adminInvites.unauthorizedTitle")}
      description={t("adminInvites.unauthorizedDesc")}
    >
      <PortalInvitationsPage />
    </RequireRole>
  );
}

type Kind = "tenant" | "owner";

function PortalInvitationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const origin = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);

  const orgsQ = useQuery({
    queryKey: ["my-organizations", user?.id],
    queryFn: () => listMyOrganizations(),
    enabled: !!user,
  });
  const orgId = orgsQ.data?.[0]?.org.id;

  const dataQ = useQuery({
    queryKey: ["portal-invitations", orgId],
    queryFn: () => listPortalInvitations({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const [kind, setKind] = useState<Kind>("tenant");
  const [targetId, setTargetId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<PortalInvitation | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{
    id: string;
    kind: RevokeKind;
    name: string;
  } | null>(null);

  const targets: InvitationTarget[] =
    kind === "tenant" ? (dataQ.data?.tenants ?? []) : (dataQ.data?.owners ?? []);
  const invitations: PortalInvitation[] = dataQ.data?.invitations ?? [];

  function onPickTarget(id: string) {
    setTargetId(id);
    const found = targets.find((t) => t.id === id);
    if (found?.email) setEmail(found.email);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !targetId || !email) return;
    setSending(true);
    try {
      await createPortalInvitation({ data: { orgId, kind, targetId, email } });
      toast.success(t("adminInvites.created"));
      setTargetId("");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["portal-invitations", orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminInvites.error"));
    } finally {
      setSending(false);
    }
  }

  async function doRevoke(id: string, kind: RevokeKind) {
    if (!orgId) return;
    try {
      await revokePortalInvitation({ data: { orgId, invitationId: id } });
      toast.success(
        kind === "delete" ? t("adminInvites.deletedToast") : t("adminInvites.revokedToast"),
        {
          description:
            kind === "delete" ? t("adminInvites.deletedDesc") : t("adminInvites.revokedDesc"),
        },
      );
      qc.invalidateQueries({ queryKey: ["portal-invitations", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("adminInvites.error"));
    }
  }

  const askRevoke = (inv: PortalInvitation, kind: RevokeKind) =>
    setConfirmRevoke({ id: inv.id, kind, name: nameOf(inv) ?? inv.email });

  function copyLink(token: string) {
    const url = `${origin}/portal-invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success(t("adminInvites.copied"));
  }

  const nameOf = (inv: PortalInvitation) => {
    if (inv.kind === "tenant")
      return dataQ.data?.tenants.find((t) => t.id === inv.tenant_id)?.full_name;
    return dataQ.data?.owners.find((o) => o.id === inv.owner_id)?.full_name;
  };

  const now = Date.now();
  const pending = invitations.filter(
    (i) => !i.accepted_at && new Date(i.expires_at).getTime() >= now,
  );
  const accepted = invitations.filter((i) => !!i.accepted_at);
  const expired = invitations.filter(
    (i) => !i.accepted_at && new Date(i.expires_at).getTime() < now,
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("adminInvites.heading")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("adminInvites.subheading")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="size-4" />
            {t("adminInvites.newInvite")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>{t("adminInvites.kindLabel")}</Label>
              <Tabs
                value={kind}
                onValueChange={(v) => {
                  setKind(v as Kind);
                  setTargetId("");
                  setEmail("");
                }}
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="tenant">{t("adminInvites.tenant")}</TabsTrigger>
                  <TabsTrigger value="owner">{t("adminInvites.owner")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-2">
              <Label>
                {kind === "tenant" ? t("adminInvites.targetTenant") : t("adminInvites.targetOwner")}
              </Label>
              <Select value={targetId} onValueChange={onPickTarget}>
                <SelectTrigger>
                  <SelectValue placeholder={t("adminInvites.pickPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("adminInvites.emailLabel")}</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={sending || !targetId} className="w-full">
                {sending ? (
                  <Loader2 className="size-4 me-2 animate-spin" />
                ) : (
                  <Send className="size-4 me-2" />
                )}
                {t("adminInvites.send")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {dataQ.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("adminInvites.pending", { count: pending.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t("adminInvites.emptyPending")}
                </p>
              ) : (
                <div className="divide-y">
                  {pending.map((inv) => (
                    <InvitationCard
                      key={inv.id}
                      inv={inv}
                      status="pending"
                      name={nameOf(inv) ?? inv.email}
                      origin={origin}
                      onOpen={setDetail}
                      onCopy={copyLink}
                      onAskRevoke={askRevoke}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("adminInvites.expiredList", { count: expired.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expired.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t("adminInvites.emptyExpired")}
                </p>
              ) : (
                <div className="divide-y">
                  {expired.map((inv) => (
                    <InvitationCard
                      key={inv.id}
                      inv={inv}
                      status="expired"
                      name={nameOf(inv) ?? inv.email}
                      origin={origin}
                      onOpen={setDetail}
                      onCopy={copyLink}
                      onAskRevoke={askRevoke}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("adminInvites.accepted", { count: accepted.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accepted.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t("adminInvites.emptyAccepted")}
                </p>
              ) : (
                <div className="divide-y">
                  {accepted.map((inv) => (
                    <InvitationCard
                      key={inv.id}
                      inv={inv}
                      status="accepted"
                      name={nameOf(inv) ?? inv.email}
                      origin={origin}
                      onOpen={setDetail}
                      onCopy={copyLink}
                      onAskRevoke={askRevoke}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <InvitationDetailDialog
        detail={detail}
        name={detail ? (nameOf(detail) ?? "—") : "—"}
        origin={origin}
        now={now}
        onClose={() => setDetail(null)}
        onCopy={copyLink}
        onAskRevoke={askRevoke}
      />

      <AlertDialog open={!!confirmRevoke} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRevoke?.kind === "delete"
                ? t("adminInvites.confirmDeleteTitle")
                : t("adminInvites.confirmRevokeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRevoke?.kind === "delete"
                ? t("adminInvites.confirmDeleteBody", { name: confirmRevoke?.name ?? "" })
                : t("adminInvites.confirmRevokeBody", { name: confirmRevoke?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("adminInvites.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmRevoke) return;
                const { id, kind } = confirmRevoke;
                setConfirmRevoke(null);
                setDetail(null);
                await doRevoke(id, kind);
              }}
            >
              {confirmRevoke?.kind === "delete"
                ? t("adminInvites.deleteBtn")
                : t("adminInvites.revokeBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
