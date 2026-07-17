import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminResetUserPassword,
  listUsersForApproval,
  approveUserTrial,
  rejectUserAccount,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, XCircle, Clock, Users } from "lucide-react";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => sectionHead({ section: "admin", entityAr: "المستخدمون", entityEn: "Users", path: "/admin/users" }),
  component: AdminUsersPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function AdminUsersPage() {
  const resetPwd = useServerFn(adminResetUserPassword);
  const listFn = useServerFn(listUsersForApproval);
  const approveFn = useServerFn(approveUserTrial);
  const rejectFn = useServerFn(rejectUserAccount);
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["admin-users-approval"],
    queryFn: () => listFn(),
  });

  const approveM = useMutation({
    mutationFn: (userId: string) => approveFn({ data: { userId, days: 7 } }),
    onSuccess: () => {
      toast.success("Trial approved (7 days)");
      qc.invalidateQueries({ queryKey: ["admin-users-approval"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });

  const rejectM = useMutation({
    mutationFn: (userId: string) => rejectFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("User rejected");
      qc.invalidateQueries({ queryKey: ["admin-users-approval"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reject"),
  });

  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await resetPwd({ data: { email: email.trim(), newPassword: pwd } });
      toast.success(`Password updated for ${email}`);
      setPwd("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User Management</h1>
        <p className="text-muted-foreground text-sm">
          Admin-only tools for managing user accounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Trial approvals
          </CardTitle>
          <CardDescription>
            Approve a 7-day trial or reject the account. Trial end date is shown once approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading users…</p>
          ) : usersQ.error ? (
            <p className="text-sm text-destructive">
              {(usersQ.error as any)?.message ?? "Failed to load"}
            </p>
          ) : (
            <div className="divide-y">
              {(usersQ.data ?? []).map((u: any) => {
                const status = u.approval_status ?? "pending";
                const trialEnds = u.trial_ends_at ? new Date(u.trial_ends_at) : null;
                const expired = trialEnds ? trialEnds.getTime() < Date.now() : false;
                return (
                  <div key={u.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-medium">{u.full_name || u.email || u.id}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === "approved" && (
                        <Badge variant={expired ? "destructive" : "default"} className="gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {expired ? "Expired" : "Approved"}
                        </Badge>
                      )}
                      {status === "pending" && (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="w-3 h-3" /> Pending
                        </Badge>
                      )}
                      {status === "rejected" && (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="w-3 h-3" /> Rejected
                        </Badge>
                      )}
                      {trialEnds && (
                        <span className="text-xs text-muted-foreground">
                          Trial ends: {trialEnds.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveM.mutate(u.id)}
                        disabled={approveM.isPending || rejectM.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Approve 7-day trial
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectM.mutate(u.id)}
                        disabled={approveM.isPending || rejectM.isPending}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
              {(usersQ.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-4">No users found.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Reset user password
          </CardTitle>
          <CardDescription>
            Sets a new password for the target user. The action is audit-logged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">User email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd">New password</Label>
              <Input
                id="pwd"
                type="text"
                required
                minLength={8}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
