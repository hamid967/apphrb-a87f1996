import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAppSettings,
  saveAppSettings,
  testSlackWebhook,
  testAlertEmail,
} from "@/lib/admin-settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import { toast } from "sonner";
import {
  Settings2,
  Landmark,
  Clock,
  Loader2,
  Save,
  Bell,
  Slack,
  Mail,
  PlugZap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => sectionHead({ section: "admin", entityAr: "إعدادات النظام", entityEn: "System Settings", path: "/admin/settings" }),
  component: AdminSettingsPage,
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
          إعادة المحاولة
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">غير موجود</div>,
});

function AdminSettingsPage() {
  const list = useServerFn(listAppSettings);
  const save = useServerFn(saveAppSettings);
  const testSlack = useServerFn(testSlackWebhook);
  const testEmail = useServerFn(testAlertEmail);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => list() });
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (q.data) setForm({ ...q.data });
  }, [q.data]);

  const bind = (k: string) => ({
    value: form[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const bindSwitch = (k: string, defaultOn = true) => ({
    checked: (form[k] ?? "") === "" ? defaultOn : form[k] === "true" || form[k] === "1",
    onCheckedChange: (v: boolean) => setForm((f) => ({ ...f, [k]: v ? "true" : "false" })),
  });

  const saveMut = useMutation({
    mutationFn: () => save({ data: { values: form } }),
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحفظ"),
  });

  const testSlackMut = useMutation({
    mutationFn: () => testSlack({ data: { url: form["alerts.slack_webhook_url"] ?? "" } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("تم إرسال رسالة اختبار إلى Slack");
      else {
        const detail = r.error ?? (r as { status?: number }).status ?? "";
        toast.error(`فشل الاختبار: ${detail}`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "رابط webhook غير صالح"),
  });

  const testEmailMut = useMutation({
    mutationFn: () => testEmail({ data: { to: form["alerts.email_to"] ?? "" } }),
    onSuccess: () => toast.success("عنوان البريد صالح — سيستخدم للتنبيهات"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "بريد غير صالح"),
  });

  if (q.isLoading) {
    return (
      <AdminPageLoading
        ar="إعدادات النظام"
        en="System Settings"
        icon={Settings2}
        descriptionAr="إعدادات الاشتراك والتحويل البنكي والتنبيهات على مستوى المنصّة."
        descriptionEn="Subscription, bank-transfer and notification settings for the whole platform."
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <AdminPageHeader
        ar="إعدادات النظام"
        en="System Settings"
        icon={Settings2}
        descriptionAr="إعدادات الاشتراك والتحويل البنكي والتنبيهات على مستوى المنصّة."
        descriptionEn="Subscription, bank-transfer and notification settings for the whole platform."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            الاشتراك والتجربة
          </CardTitle>
          <CardDescription>مدد التجربة والمهلة والتنبيهات (بالأيام).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div>
            <Label>مدة التجربة</Label>
            <Input type="number" min={0} {...bind("subscription.trial_days")} />
          </div>
          <div>
            <Label>فترة السماح</Label>
            <Input type="number" min={0} {...bind("subscription.grace_period_days")} />
          </div>
          <div>
            <Label>أيام التحذير</Label>
            <Input type="number" min={0} {...bind("subscription.warning_days")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-4" />
            تفاصيل التحويل البنكي
          </CardTitle>
          <CardDescription>تظهر للعملاء في صفحة الفوترة عند دفع اشتراكهم يدويًا.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label>اسم البنك</Label>
            <Input {...bind("bank.name")} />
          </div>
          <div>
            <Label>اسم المستفيد</Label>
            <Input {...bind("bank.account_name")} />
          </div>
          <div className="col-span-2">
            <Label>IBAN</Label>
            <Input dir="ltr" {...bind("bank.iban")} />
          </div>
          <div className="col-span-2">
            <Label>SWIFT / BIC</Label>
            <Input dir="ltr" {...bind("bank.swift")} />
          </div>
          <div className="col-span-2">
            <Label>ملاحظات</Label>
            <Textarea rows={3} {...bind("bank.notes")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            تنبيهات النظام
          </CardTitle>
          <CardDescription>
            تُرسل تنبيهات فورية عند أخطاء واجهة الإدارة (<code>render_error</code>) وتفعيل تجاوز
            AAL2 (<code>aal2_bypass</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Slack className="size-4" /> Slack Webhook
              </Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>مفعّل</span>
                <Switch {...bindSwitch("alerts.slack_enabled", true)} />
              </div>
            </div>
            <Input
              dir="ltr"
              placeholder="https://hooks.slack.com/services/T…/B…/…"
              {...bind("alerts.slack_webhook_url")}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testSlackMut.mutate()}
                disabled={testSlackMut.isPending || !form["alerts.slack_webhook_url"]}
              >
                {testSlackMut.isPending ? (
                  <Loader2 className="me-2 size-4 animate-spin" />
                ) : (
                  <PlugZap className="me-2 size-4" />
                )}
                اختبار الآن
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Mail className="size-4" /> بريد التنبيهات
              </Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>مفعّل</span>
                <Switch {...bindSwitch("alerts.email_enabled", false)} />
              </div>
            </div>
            <Input
              dir="ltr"
              type="email"
              placeholder="ops@example.com"
              {...bind("alerts.email_to")}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testEmailMut.mutate()}
                disabled={testEmailMut.isPending || !form["alerts.email_to"]}
              >
                {testEmailMut.isPending ? (
                  <Loader2 className="me-2 size-4 animate-spin" />
                ) : (
                  <PlugZap className="me-2 size-4" />
                )}
                تحقّق من العنوان
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? (
            <Loader2 className="me-2 size-4 animate-spin" />
          ) : (
            <Save className="me-2 size-4" />
          )}
          حفظ التغييرات
        </Button>
      </div>
    </div>
  );
}
