import { createFileRoute, ErrorComponent, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, ShieldOff, KeyRound, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/security/mfa")({
  head: () => ({
    meta: [
      { title: "المصادقة الثنائية 2FA | Aqari" },
      {
        name: "description",
        content: "تفعيل/إيقاف المصادقة الثنائية عبر TOTP وإدارة رموز الاسترداد",
      },
    ],
  }),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
  component: MfaPage,
});

type Factor = { id: string; friendly_name?: string | null; factor_type: string; status: string };

function generateRecoveryCodes(n = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = (len: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(len)))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return Array.from({ length: n }, () => `${rand(4)}-${rand(4)}-${rand(4)}`);
}

function MfaPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(
    null,
  );
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const totp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast.error(error.message);
    else setFactors([...(data?.totp ?? [])] as Factor[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Clean up any lingering unverified factors
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.totp ?? []) as Factor[]) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `TOTP ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      const ch = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (ch.error) throw ch.error;
      setChallengeId(ch.data.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enroll || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId,
        code: code.trim(),
      });
      if (error) throw error;
      toast.success("تم تفعيل المصادقة الثنائية");
      setRecovery(generateRecoveryCodes());
      setEnroll(null);
      setChallengeId(null);
      setCode("");
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId }).catch(() => {});
    setEnroll(null);
    setChallengeId(null);
    setCode("");
  };

  const disable = async (id: string) => {
    if (!confirm("سيتم إيقاف المصادقة الثنائية. متابعة؟")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast.success("تم إيقاف المصادقة الثنائية");
      setRecovery(null);
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const regenerateRecovery = () => {
    if (!totp) return toast.error("فعّل المصادقة الثنائية أولاً");
    setRecovery(generateRecoveryCodes());
    toast.success("تم توليد رموز جديدة — احتفظ بها في مكان آمن");
  };

  const downloadRecovery = () => {
    if (!recovery) return;
    const blob = new Blob(
      [
        `Aqari — رموز الاسترداد\nتاريخ: ${new Date().toLocaleString("ar-SA")}\n\n${recovery.join("\n")}\n\nاحتفظ بهذه الرموز في مكان آمن.\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hbspro-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">المصادقة الثنائية (2FA)</h1>
          <p className="text-sm text-muted-foreground">
            حماية إضافية لحسابك باستخدام تطبيقات TOTP مثل Google Authenticator أو Authy.
          </p>
        </div>
        <div className="ms-auto">
          <Link to="/security/sessions" className="text-sm text-primary underline">
            الجلسات والأجهزة →
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            الحالة
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : totp ? (
              <Badge variant="secondary">مفعّلة</Badge>
            ) : (
              <Badge variant="destructive">غير مفعّلة</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loading && !totp && !enroll && (
            <Button onClick={startEnroll} disabled={busy}>
              <KeyRound className="h-4 w-4 ml-2" /> بدء التفعيل
            </Button>
          )}

          {enroll && (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  امسح رمز QR بتطبيق المصادقة، ثم أدخل الرمز المكوّن من 6 أرقام لإكمال التفعيل.
                </AlertDescription>
              </Alert>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <img src={enroll.qr} alt="QR" className="w-48 h-48 bg-white p-2 rounded border" />
                <div className="flex-1 space-y-2 w-full">
                  <div className="text-xs text-muted-foreground">السر (للإدخال اليدوي):</div>
                  <code className="block p-2 bg-muted rounded text-xs break-all">
                    {enroll.secret}
                  </code>
                  <Input
                    placeholder="123456"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                  <div className="flex gap-2">
                    <Button onClick={verifyEnroll} disabled={busy || code.length !== 6}>
                      تأكيد
                    </Button>
                    <Button variant="outline" onClick={cancelEnroll} disabled={busy}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {totp && (
            <div className="flex items-center justify-between gap-4 p-3 rounded border">
              <div>
                <div className="font-medium">{totp.friendly_name || "TOTP"}</div>
                <div className="text-xs text-muted-foreground">تم التفعيل — حسابك محمي بـ 2FA</div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => disable(totp.id)}
                disabled={busy}
              >
                <ShieldOff className="h-4 w-4 ml-1" /> إيقاف
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {totp && (
        <Card>
          <CardHeader>
            <CardTitle>رموز الاسترداد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              استخدم هذه الرموز لدخول حسابك إذا فقدت جهاز المصادقة. كل رمز يُستخدم مرة واحدة — احتفظ
              بها في مكان آمن.
            </p>
            {recovery ? (
              <>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {recovery.map((c) => (
                    <code key={c} className="p-2 bg-muted rounded text-center">
                      {c}
                    </code>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={downloadRecovery}>
                    <Download className="h-4 w-4 ml-1" /> تنزيل
                  </Button>
                  <Button variant="outline" onClick={regenerateRecovery}>
                    توليد رموز جديدة
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="outline" onClick={regenerateRecovery}>
                توليد رموز الاسترداد
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
