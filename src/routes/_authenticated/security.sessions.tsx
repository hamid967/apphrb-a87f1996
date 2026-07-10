import { createFileRoute, ErrorComponent, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense } from "react";
import {
  listDevices,
  listLoginEvents,
  setDeviceTrust,
  revokeDevice,
} from "@/lib/sessions.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Shield, Monitor, LogOut, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

export const Route = createFileRoute("/_authenticated/security/sessions")({
  head: () => ({
    meta: [
      { title: "الجلسات والأجهزة | HBSpro" },
      { name: "description", content: "إدارة الجلسات والأجهزة الموثوقة وسجل الدخول" },
    ],
  }),
  loader: async ({ context }) => {
    const [devices, events] = await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["devices"], queryFn: () => listDevices() }),
      context.queryClient.ensureQueryData({
        queryKey: ["login-events"],
        queryFn: () => listLoginEvents(),
      }),
    ]);
    return { devices, events };
  },
  errorComponent: ({ error, reset }) => <ErrorComponent error={error} />,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
  component: SessionsPageShell,
});

function SessionsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
      <div className="h-24 rounded-lg border bg-muted/40 animate-pulse" />
    </div>
  );
}

function SessionsPageShell() {
  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">الجلسات والأجهزة</h1>
          <p className="text-sm text-muted-foreground">
            إدارة الأجهزة الموثوقة وسجل الدخول وحماية الحساب
          </p>
        </div>
      </div>
      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsPage />
      </Suspense>
    </div>
  );
}

function SessionsPage() {
  const qc = useQueryClient();
  const devicesQ = useSuspenseQuery({ queryKey: ["devices"], queryFn: () => listDevices() });
  const eventsQ = useSuspenseQuery({
    queryKey: ["login-events"],
    queryFn: () => listLoginEvents(),
  });
  const trust = useServerFn(setDeviceTrust);
  const revoke = useServerFn(revokeDevice);
  const currentFp = typeof window !== "undefined" ? getDeviceFingerprint() : "";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["devices"] });
    qc.invalidateQueries({ queryKey: ["login-events"] });
  };

  const onTrust = async (id: string, trusted: boolean) => {
    try {
      await trust({ data: { id, trusted } });
      toast.success(trusted ? "تم اعتماد الجهاز" : "أُلغي الاعتماد");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const onRevoke = async (id: string) => {
    try {
      await revoke({ data: { id } });
      toast.success("تم إلغاء الجهاز");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const failedLast15 = eventsQ.data.filter(
    (e: any) =>
      ["failed", "blocked", "rate_limited"].includes(e.status) &&
      Date.now() - new Date(e.created_at).getTime() < 15 * 60 * 1000,
  ).length;

  return (
    <>
      {/* header is rendered by the shell above; data-dependent UI starts here */}

      {failedLast15 >= 3 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="text-sm">
              رُصدت <strong>{failedLast15}</strong> محاولة دخول فاشلة خلال آخر 15 دقيقة. سيتم تفعيل
              الحد الأقصى للمحاولات (rate limit) تلقائياً.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" /> الأجهزة ({devicesQ.data.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {devicesQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد أجهزة مسجّلة بعد.</p>
          )}
          {devicesQ.data.map((d: any) => {
            const isCurrent = d.device_fingerprint === currentFp;
            const revoked = !!d.revoked_at;
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {d.device_name || d.user_agent?.slice(0, 60) || "جهاز"}
                    </span>
                    {isCurrent && <Badge variant="default">هذا الجهاز</Badge>}
                    {d.trusted && (
                      <Badge variant="secondary">
                        <CheckCircle2 className="h-3 w-3 ml-1" />
                        موثوق
                      </Badge>
                    )}
                    {revoked && <Badge variant="destructive">مُلغى</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span>
                      <Clock className="h-3 w-3 inline ml-1" />
                      آخر ظهور: {formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true })}
                    </span>
                    {d.ip_address && <span>IP: {d.ip_address}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span>موثوق</span>
                    <Switch
                      checked={d.trusted}
                      onCheckedChange={(v) => onTrust(d.id, v)}
                      disabled={revoked}
                    />
                  </div>
                  {!revoked && (
                    <Button size="sm" variant="outline" onClick={() => onRevoke(d.id)}>
                      <LogOut className="h-4 w-4 ml-1" /> إلغاء
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سجل الدخول (آخر 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">لا يوجد نشاط دخول بعد.</p>
          )}
          <div className="space-y-2">
            {eventsQ.data.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-md border text-sm">
                {e.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="flex-1 truncate">{e.email || "—"}</span>
                <Badge variant={e.status === "success" ? "secondary" : "destructive"}>
                  {e.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
