import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Trash2, Copy, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  listTeam,
  inviteMember,
  updateMemberRole,
  removeMember,
  revokeInvitation,
} from "@/lib/team.functions";
import type { OrgRole } from "@/lib/permissions";
import { ADMIN_ROLES } from "@/lib/permissions";
import { RequireRole } from "@/components/auth/RequireRole";
import { useCanCreate } from "@/hooks/use-can-create";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";

export const Route = createFileRoute("/_authenticated/team/")({
  component: () => (
    <RequireRole
      roles={ADMIN_ROLES}
      title="Team management restricted"
      description="Managing members, invitations and roles is limited to owners and administrators."
    >
      <TeamPage />
    </RequireRole>
  ),
});

const ROLE_OPTIONS: OrgRole[] = ["admin", "agent", "viewer"];

function TeamPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ["my-organizations", user?.id],
    queryFn: () => listMyOrganizations(),
    enabled: !!user,
  });
  const active = orgsQuery.data?.[0];
  const orgId = active?.org.id;
  const myRole = active?.role as OrgRole | undefined;
  const isAdmin = !!myRole && ADMIN_ROLES.includes(myRole);

  const teamQuery = useQuery({
    queryKey: ["team", orgId],
    queryFn: () => listTeam({ data: { orgId: orgId! } }),
    enabled: !!orgId && isAdmin,
  });

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("agent");
  const [sending, setSending] = useState(false);

  const inviteBase = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSending(true);
    try {
      const inv = await inviteMember({ data: { orgId, email, role } });
      await navigator.clipboard.writeText(`${inviteBase}/invite/${inv.token}`).catch(() => {});
      toast.success(t("team.linkCopied"));
      setEmail("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["team", orgId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setSending(false);
    }
  }

  async function changeRole(uid: string, next: OrgRole) {
    if (!orgId) return;
    try {
      await updateMemberRole({ data: { orgId, userId: uid, role: next } });
      qc.invalidateQueries({ queryKey: ["team", orgId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function doRemove(uid: string) {
    if (!orgId || !confirm(t("team.confirmRemove"))) return;
    try {
      await removeMember({ data: { orgId, userId: uid } });
      qc.invalidateQueries({ queryKey: ["team", orgId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function doRevoke(id: string) {
    if (!orgId || !confirm(t("team.confirmRevoke"))) return;
    try {
      await revokeInvitation({ data: { orgId, invitationId: id } });
      qc.invalidateQueries({ queryKey: ["team", orgId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  function copyLink(token: string) {
    navigator.clipboard
      .writeText(`${inviteBase}/invite/${token}`)
      .then(() => toast.success(t("team.linkCopied")));
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">{t("team.title")}</h1>
        <p className="mt-2 text-muted-foreground">Forbidden.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("team.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("team.subtitle")}</p>
        </div>
        <TeamInviteTrigger open={open} setOpen={setOpen} label={t("team.invite")} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("team.invite")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitInvite} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("team.email")}</label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@company.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("team.role")}</label>
                <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`team.roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={sending}>
                  {sending && <Loader2 className="size-4 me-2 animate-spin" />}
                  {t("team.send")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium">{t("team.members")}</div>
        {teamQuery.isLoading ? (
          <div className="p-6 text-center text-muted-foreground">
            <Loader2 className="mx-auto size-5 animate-spin" />
          </div>
        ) : (teamQuery.data?.members.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t("team.empty")}</div>
        ) : (
          <ul className="divide-y">
            {teamQuery.data?.members.map((m: any) => {
              const isSelf = m.user_id === user?.id;
              return (
                <li key={m.user_id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {m.profiles?.full_name ?? m.user_id.slice(0, 8)}
                      {isSelf && (
                        <Badge variant="outline" className="ms-2">
                          {t("team.you")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.role}
                      onValueChange={(v) => changeRole(m.user_id, v as OrgRole)}
                      disabled={isSelf || m.role === "owner"}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["owner", ...ROLE_OPTIONS] as OrgRole[]).map((r) => (
                          <SelectItem key={r} value={r} disabled={r === "owner"}>
                            {t(`team.roles.${r}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isSelf && m.role !== "owner" && (
                      <Button size="icon" variant="ghost" onClick={() => doRemove(m.user_id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3 text-sm font-medium">{t("team.pendingInvites")}</div>
        {(teamQuery.data?.invitations.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t("team.noInvites")}</div>
        ) : (
          <ul className="divide-y">
            {teamQuery.data?.invitations.map((inv: any) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">
                    <Mail className="size-4 text-muted-foreground" /> {inv.email}
                    <Badge variant="secondary">{t(`team.roles.${inv.role}`)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("team.expires", {
                      when: formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true }),
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                    <Copy className="size-4 me-2" />
                    {t("team.copyLink")}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => doRevoke(inv.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TeamInviteTrigger({
  open,
  setOpen,
  label,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  label: string;
}) {
  const gate = useCanCreate("user");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          if (!gate.allowed) {
            setUpgradeOpen(true);
            return;
          }
          setOpen(!open);
        }}
      >
        <UserPlus className="size-4 me-2" />
        {label}
      </Button>
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        label={gate.label}
        used={gate.used}
        max={gate.max}
        planName={gate.planName}
      />
    </>
  );
}
