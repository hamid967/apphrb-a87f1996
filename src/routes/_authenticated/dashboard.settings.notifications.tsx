import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  Loader2,
  Mail,
  MessageSquare,
  Save,
  Send,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  listChannelSettings,
  upsertChannelSetting,
  listNotificationTemplates,
  upsertNotificationTemplate,
} from "@/lib/notification-settings.functions";
import {
  sendTestNotification,
  canTestSendNotifications,
  listTestSendHistory,
} from "@/lib/notifications.functions";
import {
  listUserEventPrefs,
  upsertUserEventPref,
  type EventChannel,
} from "@/lib/notification-event-prefs.functions";

import { sectionHead } from "@/lib/section-og-head";
type Channel = "whatsapp" | "sms" | "email";

export const Route = createFileRoute("/_authenticated/dashboard/settings/notifications")({
  head: () => sectionHead({ section: "dashboard", entityAr: "إعدادات الإشعارات", entityEn: "Notification Settings", path: "/dashboard/settings/notifications" }),
  component: NotificationSettingsPage,
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

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }
> = {
  whatsapp: {
    label: "واتساب",
    icon: MessageSquare,
    hint: "مطلوب مفتاح Meta Cloud API معدّ من قبل المشرف العام.",
  },
  sms: {
    label: "رسائل SMS",
    icon: MessageSquare,
    hint: "يتطلّب إعداد مزوّد SMS في الإعدادات العامة.",
  },
  email: {
    label: "البريد الإلكتروني",
    icon: Mail,
    hint: "يعمل تلقائيًا عبر خط أنابيب البريد المدار.",
  },
};

function NotificationSettingsPage() {
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as { id: string; name: string } | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          <Bell className="size-6 text-primary" /> إعدادات الإشعارات
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/settings">
            <ArrowRight className="size-4 me-1" /> رجوع للإعدادات
          </Link>
        </Button>
      </div>

      {!org ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="channels">
          <NotificationTabs orgId={org.id} />
        </Tabs>
      )}
    </div>
  );
}

function NotificationTabs({ orgId }: { orgId: string }) {
  // Gate the "اختبار الإرسال" tab: only super_admin or org owner/admin may
  // trigger test sends. Regular members should not see the tab at all —
  // the server enforces the same rule, this just hides a button that would
  // 403.
  const gate = useQuery({
    queryKey: ["can-test-send", orgId],
    queryFn: () => canTestSendNotifications({ data: { org_id: orgId } }),
  });
  const canTest = gate.data?.allowed === true;
  return (
    <>
      <TabsList>
        <TabsTrigger value="channels">القنوات</TabsTrigger>
        <TabsTrigger value="templates">قوالب فوز المزاد</TabsTrigger>
        <TabsTrigger value="events">أحداثي</TabsTrigger>
        {canTest && <TabsTrigger value="test">اختبار الإرسال</TabsTrigger>}
      </TabsList>
      <TabsContent value="channels" className="mt-4">
        <ChannelsSection orgId={orgId} />
      </TabsContent>
      <TabsContent value="templates" className="mt-4">
        <TemplatesSection orgId={orgId} />
      </TabsContent>
      <TabsContent value="events" className="mt-4">
        <EventPrefsSection orgId={orgId} />
      </TabsContent>
      {canTest && (
        <TabsContent value="test" className="mt-4">
          <TestSendSection orgId={orgId} />
        </TabsContent>
      )}
    </>
  );
}

function TestSendSection({ orgId }: { orgId: string }) {
  const sendFn = useServerFn(sendTestNotification);
  const qc = useQueryClient();
  const [channel, setChannel] = useState<Channel>("email");
  const [recipient, setRecipient] = useState("");
  const [template, setTemplate] = useState("test_message");
  const [variablesJson, setVariablesJson] = useState('{\n  "name": "Test User"\n}');
  const [dispatchNow, setDispatchNow] = useState(true);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      let variables: Record<string, string | number | boolean | null> = {};
      const trimmed = variablesJson.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            variables = parsed;
          } else {
            throw new Error("متغيرات يجب أن تكون كائن JSON");
          }
        } catch (e) {
          throw new Error((e as Error).message || "تعذّر تحليل JSON");
        }
      }
      return sendFn({
        data: {
          org_id: orgId,
          channel,
          recipient: recipient.trim(),
          template: template.trim(),
          variables,
          dispatch_now: dispatchNow,
        },
      });
    },
    onSuccess: (r) => {
      setLastResult(
        `id=${r.id ?? "—"} · status=${r.status} · dispatched=${r.dispatched ? "نعم" : "لا"}` +
          (r.error ? ` · error=${r.error}` : ""),
      );
      if (r.dispatched) toast.success("تم الإرسال");
      else if (r.status === "pending_credentials") toast.info("لا توجد بيانات اعتماد — تم وضعه في الانتظار");
      else toast.success("تمت الإضافة للطابور");
      qc.invalidateQueries({ queryKey: ["test-send-history", orgId] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "فشل الإرسال";
      toast.error(msg);
      setLastResult(msg);
    },
  });

  const recipientPlaceholder =
    channel === "email"
      ? "user@example.com"
      : channel === "whatsapp"
        ? "+9665XXXXXXXX"
        : "+9665XXXXXXXX";

  return (
    <div className="grid gap-4">
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4 text-primary" /> إرسال إشعار تجريبي
        </CardTitle>
        <CardDescription>
          يُرسل رسالة عبر <code className="rounded bg-muted px-1 text-[11px]">enqueueNotification</code>{" "}
          للتحقق من إعدادات القناة قبل ربطها بأي تدفّق فعلي. لا يتأثر أي عميل.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>القناة</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="email">البريد الإلكتروني</option>
              <option value="whatsapp">واتساب</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>المستلم</Label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={recipientPlaceholder}
              dir="ltr"
            />
          </div>
        </div>
        <div>
          <Label>مفتاح القالب</Label>
          <Input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="test_message"
            dir="ltr"
          />
        </div>
        <div>
          <Label>المتغيرات (JSON)</Label>
          <Textarea
            rows={6}
            value={variablesJson}
            onChange={(e) => setVariablesJson(e.target.value)}
            dir="ltr"
            className="font-mono text-xs"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={dispatchNow}
            onCheckedChange={setDispatchNow}
            aria-label="إرسال فوري"
          />
          إرسال فوري (dispatch_now)
        </label>
        {lastResult && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs" dir="ltr">
            {lastResult}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !recipient.trim() || !template.trim()}
          >
            {send.isPending ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Send className="me-2 size-4" />
            )}
            إرسال تجريبي
          </Button>
        </div>
      </CardContent>
    </Card>
    <TestSendHistory orgId={orgId} />
    </div>
  );
}

function TestSendHistory({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listTestSendHistory);
  const q = useQuery({
    queryKey: ["test-send-history", orgId],
    queryFn: () => listFn({ data: { org_id: orgId, limit: 25 } }),
  });
  const rows = q.data ?? [];
  const CHANNEL_LABEL: Record<string, string> = {
    email: "بريد",
    whatsapp: "واتساب",
    sms: "SMS",
  };
  const statusBadge = (s: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    if (s === "sent") return { label: "أُرسل", variant: "default" };
    if (s === "failed") return { label: "فشل", variant: "destructive" };
    if (s === "dead_letter") return { label: "متوقّف", variant: "destructive" };
    if (s === "pending_credentials") return { label: "بانتظار الاعتماد", variant: "outline" };
    if (s === "pending") return { label: "بالانتظار", variant: "secondary" };
    if (s === "skipped") return { label: "تم التخطّي", variant: "outline" };
    return { label: s, variant: "outline" };
  };
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ar-SA", { hour12: false }) : "—";
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4 text-primary" /> سجل الاختبارات الأخيرة
        </CardTitle>
        <CardDescription>
          آخر 25 محاولة إرسال تجريبي قمت بها في هذه المنظمة — القناة، المستلم، الوقت والنتيجة.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد اختبارات إرسال بعد.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-start">
                  <th className="px-3 py-2 text-start font-medium">القناة</th>
                  <th className="px-3 py-2 text-start font-medium">المستلم</th>
                  <th className="px-3 py-2 text-start font-medium">القالب</th>
                  <th className="px-3 py-2 text-start font-medium">الحالة</th>
                  <th className="px-3 py-2 text-start font-medium">المحاولات</th>
                  <th className="px-3 py-2 text-start font-medium">أُنشئ</th>
                  <th className="px-3 py-2 text-start font-medium">أُرسل</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = statusBadge(r.status);
                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="px-3 py-2">{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
                      <td className="px-3 py-2" dir="ltr">{r.recipient}</td>
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">{r.template}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <Badge variant={b.variant}>{b.label}</Badge>
                          {r.last_error && (
                            <span className="text-[11px] text-destructive" dir="ltr" title={r.last_error}>
                              {r.last_error.length > 60 ? r.last_error.slice(0, 60) + "…" : r.last_error}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.attempts ?? 0}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">{fmt(r.created_at)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">{fmt(r.sent_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const EXPENSE_EVENTS: Array<{ key: string; label: string; hint: string }> = [
  { key: "expense_claim_submitted", label: "إرسال طلب مصروفات", hint: "عند إرسال مطالبة جديدة" },
  { key: "expense_batch_submitted", label: "إرسال دفعة مصروفات", hint: "عند رفع دفعة للاعتماد" },
  { key: "expense_batch_approved", label: "اعتماد الدفعة", hint: "بعد موافقة المشرف" },
  { key: "expense_batch_rejected", label: "رفض الدفعة", hint: "عند رفض المشرف" },
  { key: "expense_claim_corrected", label: "تصحيح طلب سابق", hint: "بعد رفع نسخة مصحّحة" },
  { key: "expense_reimbursed", label: "صرف التعويض", hint: "عند تحويل المبلغ للموظّف" },
];

const APPLICATION_EVENTS: Array<{ key: string; label: string; hint: string }> = [
  { key: "application.status_changed", label: "تغيّر حالة طلب إيجار", hint: "عند تعديل حالة أي طلب" },
  { key: "application.note_added", label: "إضافة ملاحظة على طلب", hint: "عند كتابة ملاحظة داخلية للطلب" },
  { key: "application.approved", label: "قبول طلب إيجار", hint: "عند اعتماد الطلب وتحويله لعقد" },
  { key: "application.rejected", label: "رفض طلب إيجار", hint: "عند رفض الطلب مع السبب" },
];

const EVENT_CHANNELS: EventChannel[] = ["email", "in_app", "whatsapp", "sms", "push"];
// Applications only support email (to applicant) and in-app (to reviewers).
const APPLICATION_CHANNELS: EventChannel[] = ["email", "in_app"];
const EVENT_CHANNEL_LABEL: Record<EventChannel, string> = {
  email: "بريد",
  whatsapp: "واتساب",
  sms: "SMS",
  push: "متصفح",
  in_app: "داخل التطبيق",
};

function EventPrefsSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listUserEventPrefs);
  const saveFn = useServerFn(upsertUserEventPref);

  const q = useQuery({
    queryKey: ["user-event-prefs", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });

  const save = useMutation({
    mutationFn: (v: { event_key: string; channel: EventChannel; enabled: boolean }) =>
      saveFn({ data: { orgId, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-event-prefs", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "فشل الحفظ"),
  });

  if (q.isLoading)
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  const key = (event_key: string, ch: EventChannel) => `${event_key}::${ch}`;
  const map = new Map<string, boolean>();
  for (const r of q.data ?? []) map.set(key(r.event_key, r.channel), r.enabled);
  const isEnabled = (event_key: string, ch: EventChannel) => map.get(key(event_key, ch)) ?? true;

  const renderTable = (
    title: string,
    description: string,
    events: Array<{ key: string; label: string; hint: string }>,
    channels: EventChannel[],
  ) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4 text-primary" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">الحدث</th>
              {channels.map((c) => (
                <th key={c} className="py-2 text-center font-medium">
                  {EVENT_CHANNEL_LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.key} className="border-b last:border-0">
                <td className="py-3 pe-3">
                  <div className="font-medium">{ev.label}</div>
                  <div className="text-xs text-muted-foreground">{ev.hint}</div>
                </td>
                {channels.map((ch) => {
                  const on = isEnabled(ev.key, ch);
                  return (
                    <td key={ch} className="py-3 text-center">
                      <Switch
                        checked={on}
                        onCheckedChange={(next) =>
                          save.mutate({ event_key: ev.key, channel: ch, enabled: next })
                        }
                        aria-label={`${ev.label} — ${EVENT_CHANNEL_LABEL[ch]}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4">
      {renderTable(
        "أحداث المصروفات",
        'فعّل أو عطّل استلامك لكل حدث حسب القناة. القيمة الافتراضية "مفعّل"، ولن يُرسل النظام إشعارًا لأي قناة عطّلتها هنا حتى لو كانت القناة نفسها مفعّلة على مستوى المؤسسة.',
        EXPENSE_EVENTS,
        EVENT_CHANNELS,
      )}
      {renderTable(
        "أحداث طلبات الإيجار",
        "تحكّم في وصول تحديثات طلبات الإيجار: بريد إلكتروني للمتقدم وإشعار داخل التطبيق للمراجعين. القيمة الافتراضية مفعّلة.",
        APPLICATION_EVENTS,
        APPLICATION_CHANNELS,
      )}
    </div>
  );
}

function ChannelsSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listChannelSettings);
  const saveFn = useServerFn(upsertChannelSetting);

  const q = useQuery({
    queryKey: ["channel-settings", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });

  const save = useMutation({
    mutationFn: (v: {
      channel: Channel;
      enabled: boolean;
      sender_name: string | null;
      reply_to: string | null;
    }) => saveFn({ data: { orgId, ...v } }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["channel-settings", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading)
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  const byChannel = new Map((q.data ?? []).map((r) => [r.channel as Channel, r]));
  const channels: Channel[] = ["whatsapp", "sms", "email"];

  return (
    <div className="grid gap-4">
      {channels.map((ch) => {
        const cur = byChannel.get(ch);
        const meta = CHANNEL_META[ch];
        const Icon = meta.icon;
        return (
          <ChannelCard
            key={ch}
            channel={ch}
            label={meta.label}
            hint={meta.hint}
            Icon={Icon}
            initial={{
              enabled: cur?.enabled ?? true,
              sender_name: cur?.sender_name ?? "",
              reply_to: cur?.reply_to ?? "",
            }}
            onSave={(v) => save.mutate({ channel: ch, ...v })}
            saving={save.isPending}
          />
        );
      })}
    </div>
  );
}

function ChannelCard({
  channel,
  label,
  hint,
  Icon,
  initial,
  onSave,
  saving,
}: {
  channel: Channel;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
  initial: { enabled: boolean; sender_name: string; reply_to: string };
  onSave: (v: { enabled: boolean; sender_name: string | null; reply_to: string | null }) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [senderName, setSenderName] = useState(initial.sender_name);
  const [replyTo, setReplyTo] = useState(initial.reply_to);
  useEffect(() => {
    setEnabled(initial.enabled);
    setSenderName(initial.sender_name);
    setReplyTo(initial.reply_to);
  }, [initial.enabled, initial.sender_name, initial.reply_to]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-primary" /> {label}
            {enabled ? (
              <Badge className="bg-primary/10 text-primary">مفعّل</Badge>
            ) : (
              <Badge variant="outline">متوقف</Badge>
            )}
          </CardTitle>
          <CardDescription className="mt-1">{hint}</CardDescription>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`تفعيل ${label}`} />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>اسم المرسل</Label>
          <Input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder={channel === "email" ? "Aqari Notifications" : "اسم يظهر للمستلم"}
          />
        </div>
        {channel === "email" ? (
          <div>
            <Label>عنوان الرد (Reply-To)</Label>
            <Input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="support@example.com"
            />
          </div>
        ) : (
          <div>
            <Label>رقم/معرّف المرسل</Label>
            <Input
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={channel === "sms" ? "AQARI" : "معرّف الحساب"}
            />
          </div>
        )}
        <div className="md:col-span-2 flex justify-end">
          <Button
            onClick={() =>
              onSave({
                enabled,
                sender_name: senderName.trim() || null,
                reply_to: replyTo.trim() || null,
              })
            }
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Save className="me-2 size-4" />
            )}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplatesSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationTemplates);
  const saveFn = useServerFn(upsertNotificationTemplate);

  const q = useQuery({
    queryKey: ["notification-templates", orgId, "auction_winner"],
    queryFn: () => listFn({ data: { orgId, key: "auction_winner" } }),
  });

  const save = useMutation({
    mutationFn: (v: {
      channel: Channel;
      enabled: boolean;
      subject_ar: string | null;
      subject_en: string | null;
      body_ar: string;
      body_en: string;
      variables: string[];
    }) => saveFn({ data: { orgId, template_key: "auction_winner", ...v } }),
    onSuccess: () => {
      toast.success("تم حفظ القالب");
      qc.invalidateQueries({ queryKey: ["notification-templates", orgId, "auction_winner"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading)
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  const byChannel = new Map((q.data ?? []).map((r) => [r.channel as Channel, r]));
  const channels: Channel[] = ["whatsapp", "sms", "email"];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-primary" /> قالب فوز المزاد
          </CardTitle>
          <CardDescription>
            يُرسل هذا القالب تلقائيًا عند انتهاء المزاد وإعلان الفائز. المتغيرات المتاحة:{" "}
            <code className="rounded bg-muted px-1 text-[11px]">
              {"{{bidder_name}} {{auction_title}} {{amount}} {{deadline}}"}
            </code>
          </CardDescription>
        </CardHeader>
      </Card>

      {channels.map((ch) => {
        const cur = byChannel.get(ch);
        const meta = CHANNEL_META[ch];
        const Icon = meta.icon;
        return (
          <TemplateCard
            key={ch}
            channel={ch}
            label={meta.label}
            Icon={Icon}
            initial={{
              enabled: cur?.enabled ?? true,
              subject_ar: cur?.subject_ar ?? "",
              subject_en: cur?.subject_en ?? "",
              body_ar: cur?.body_ar ?? "",
              body_en: cur?.body_en ?? "",
              variables: cur?.variables ?? [],
            }}
            onSave={(v) => save.mutate({ channel: ch, ...v })}
            saving={save.isPending}
          />
        );
      })}
    </div>
  );
}

function TemplateCard({
  channel,
  label,
  Icon,
  initial,
  onSave,
  saving,
}: {
  channel: Channel;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  initial: {
    enabled: boolean;
    subject_ar: string;
    subject_en: string;
    body_ar: string;
    body_en: string;
    variables: string[];
  };
  onSave: (v: {
    enabled: boolean;
    subject_ar: string | null;
    subject_en: string | null;
    body_ar: string;
    body_en: string;
    variables: string[];
  }) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [sa, setSa] = useState(initial.subject_ar);
  const [se, setSe] = useState(initial.subject_en);
  const [ba, setBa] = useState(initial.body_ar);
  const [be, setBe] = useState(initial.body_en);
  useEffect(() => {
    setEnabled(initial.enabled);
    setSa(initial.subject_ar);
    setSe(initial.subject_en);
    setBa(initial.body_ar);
    setBe(initial.body_en);
  }, [initial.enabled, initial.subject_ar, initial.subject_en, initial.body_ar, initial.body_en]);

  const showSubject = channel === "email";
  const smsLen = channel === "sms" ? ba.length : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" /> {label}
        </CardTitle>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`تفعيل قالب ${label}`} />
      </CardHeader>
      <CardContent className="grid gap-3">
        {showSubject && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>الموضوع (عربي)</Label>
              <Input value={sa} onChange={(e) => setSa(e.target.value)} />
            </div>
            <div>
              <Label>الموضوع (إنجليزي)</Label>
              <Input value={se} onChange={(e) => setSe(e.target.value)} dir="ltr" />
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>النص (عربي)</Label>
            <Textarea rows={5} value={ba} onChange={(e) => setBa(e.target.value)} />
          </div>
          <div>
            <Label>النص (إنجليزي)</Label>
            <Textarea rows={5} value={be} onChange={(e) => setBe(e.target.value)} dir="ltr" />
          </div>
        </div>
        {smsLen !== null && (
          <p className={`text-xs ${smsLen > 160 ? "text-amber-600" : "text-muted-foreground"}`}>
            {smsLen}/160 حرف — يُقسّم إلى عدة رسائل عند تجاوز 160.
          </p>
        )}
        <div className="flex justify-end">
          <Button
            onClick={() =>
              onSave({
                enabled,
                subject_ar: showSubject ? sa.trim() || null : null,
                subject_en: showSubject ? se.trim() || null : null,
                body_ar: ba,
                body_en: be,
                variables: initial.variables,
              })
            }
            disabled={saving || !ba.trim() || !be.trim()}
          >
            {saving ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Save className="me-2 size-4" />
            )}
            حفظ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
