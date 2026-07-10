import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getZatcaCsidStatus,
  saveManualCsid,
  revokeCsid,
} from "@/lib/zatca-onboarding.functions";

type Env = "sandbox" | "simulation" | "production";

export function ZatcaCsidCard({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();

  const csidQ = useQuery({
    queryKey: ["zatca-csid", orgId],
    queryFn: () => getZatcaCsidStatus({ data: { orgId } }),
    enabled: !!orgId,
  });

  const revoke = useMutation({
    mutationFn: revokeCsid,
    onSuccess: () => {
      toast.success(isAr ? "تم إلغاء الشهادة" : "CSID revoked");
      qc.invalidateQueries({ queryKey: ["zatca-csid", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = csidQ.data ?? [];

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full border border-primary/40 bg-primary/10 p-2 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base">
              {isAr ? "شهادة الفوترة (CSID)" : "Fatoora Onboarding (CSID)"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "احفظ رمز الشهادة والسر الصادر من بوابة الفوترة (ZATCA) لكل بيئة."
                : "Store the binary security token & secret issued by ZATCA per environment."}
            </p>
          </div>
        </div>
        <SaveCsidDialog orgId={orgId} onSaved={() => csidQ.refetch()} />
      </CardHeader>

      <CardContent>
        {csidQ.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {isAr ? "جارٍ التحميل…" : "Loading…"}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {isAr
              ? "لم تُسجّل أي شهادة بعد. أضف واحدة عبر زر «إضافة شهادة»."
              : "No CSID registered yet. Use \"Add CSID\" to onboard."}
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="size-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {envLabel(r.environment as Env, isAr)}
                      {r.active ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                          {isAr ? "فعّالة" : "Active"}
                        </Badge>
                      ) : r.revoked_at ? (
                        <Badge variant="outline" className="border-red-500/40 text-red-600">
                          {isAr ? "ملغاة" : "Revoked"}
                        </Badge>
                      ) : r.expired ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                          {isAr ? "منتهية" : "Expired"}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {r.csid_binary_token}
                    </div>
                    {r.expires_at && (
                      <div className="text-[11px] text-muted-foreground">
                        {isAr ? "تنتهي في " : "Expires "}
                        {new Date(r.expires_at).toLocaleString(isAr ? "ar-SA" : "en")}
                      </div>
                    )}
                  </div>
                </div>
                {r.active && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate({ data: { csidId: r.id } })}
                    disabled={revoke.isPending}
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {revoke.isPending ? (
                      <Loader2 className="me-1.5 size-3.5 animate-spin" />
                    ) : (
                      <ShieldOff className="me-1.5 size-3.5" />
                    )}
                    {isAr ? "إلغاء" : "Revoke"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          {isAr
            ? "ملاحظة: تتطلب ZATCA مفاتيح ECDSA secp256k1 وتوقيع XAdES. توليد الشهادة داخل التطبيق سيصل في الموجة القادمة؛ حالياً استخدم أداة ZATCA/Fatoora الرسمية للحصول على الرمز ثم الصقه هنا."
            : "Note: ZATCA requires ECDSA secp256k1 + XAdES signing. In-app CSR generation ships in the next wave — for now, onboard once via the official ZATCA CLI/Fatoora Postman collection and paste the token here."}
        </p>
      </CardContent>
    </Card>
  );
}

function envLabel(env: Env, isAr: boolean) {
  if (env === "sandbox") return isAr ? "تجريبية (Sandbox)" : "Sandbox";
  if (env === "simulation") return isAr ? "محاكاة (Simulation)" : "Simulation";
  return isAr ? "إنتاج (Production)" : "Production";
}

function SaveCsidDialog({ orgId, onSaved }: { orgId: string; onSaved: () => void }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState<Env>("sandbox");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [requestId, setRequestId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const save = useMutation({
    mutationFn: saveManualCsid,
    onSuccess: () => {
      toast.success(isAr ? "تم حفظ الشهادة" : "CSID saved");
      setOpen(false);
      setToken("");
      setSecret("");
      setRequestId("");
      setExpiresAt("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRound className="me-1.5 size-3.5" />
          {isAr ? "إضافة شهادة" : "Add CSID"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAr ? "حفظ شهادة ZATCA" : "Save ZATCA CSID"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "الصق الحقول القادمة من رد بوابة الفوترة على /compliance أو /production/csids."
              : "Paste the values returned by Fatoora /compliance or /production/csids."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{isAr ? "البيئة" : "Environment"}</Label>
            <Select value={env} onValueChange={(v) => setEnv(v as Env)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="simulation">Simulation</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Binary Security Token</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="TUlJQ..."
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Secret</Label>
            <Input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type="password"
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Request ID</Label>
              <Input
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                placeholder={isAr ? "اختياري" : "optional"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{isAr ? "تاريخ الانتهاء" : "Expires at"}</Label>
              <Input
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                type="datetime-local"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            disabled={save.isPending || !token || !secret}
            onClick={() =>
              save.mutate({
                data: {
                  orgId,
                  environment: env,
                  csidBinaryToken: token.trim(),
                  csidSecret: secret.trim(),
                  requestId: requestId.trim() || undefined,
                  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                },
              })
            }
          >
            {save.isPending ? (
              <Loader2 className="me-1.5 size-4 animate-spin" />
            ) : (
              <Trash2 className="me-1.5 size-4 hidden" />
            )}
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
