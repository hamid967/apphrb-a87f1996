import { t } from "@/lib/i18n";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
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
        >{t("common.retry")}</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

const CHANNEL_META_KEYS: Record<
  Channel,
  { labelKey: string; hintKey: string; icon: React.ComponentType<{ className?: string }> }
> = {
  whatsapp: {
    labelKey: "notificationSettings.channelMeta.whatsappLabel",
    hintKey: "notificationSettings.channelMeta.whatsappHint",
    icon: MessageSquare,
  },
  sms: {
    labelKey: "notificationSettings.channelMeta.smsLabel",
    hintKey: "notificationSettings.channelMeta.smsHint",
    icon: MessageSquare,
  },
  email: {
    labelKey: "notificationSettings.channelMeta.emailLabel",
    hintKey: "notificationSettings.channelMeta.emailHint",
    icon: Mail,
  },
};

function NotificationSettingsPage() {
  const { t: tt } = useTranslation();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as { id: string; name: string } | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          <Bell className="size-6 text-primary" /> {tt("notificationSettings.pageTitle")}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/settings">
            <ArrowRight className="size-4 me-1" /> {tt("notificationSettings.backToSettings")}
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
  const { t: tt } = useTranslation();
  const gate = useQuery({
    queryKey: ["can-test-send", orgId],
    queryFn: () => canTestSendNotifications({ data: { org_id: orgId } }),
  });
  const canTest = gate.data?.allowed === true;
  return (
    <>
      <TabsList>
        <TabsTrigger value="channels">{tt("notificationSettings.tabs.channels")}</TabsTrigger>
        <TabsTrigger value="templates">{tt("notificationSettings.tabs.templates")}</TabsTrigger>
        <TabsTrigger value="events">{tt("notificationSettings.tabs.events")}</TabsTrigger>
        {canTest && <TabsTrigger value="test">{tt("notificationSettings.tabs.test")}</TabsTrigger>}
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
  const { t: tt, i18n: i18nInst } = useTranslation();
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
            throw new Error(tt("notificationSettings.test.invalidJsonObject"));
          }
        } catch (e) {
          throw new Error((e as Error).message || tt("notificationSettings.test.invalidJson"));
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
      const dispatchedLabel = r.dispatched
        ? tt("notificationSettings.test.dispatchYes")
        : tt("notificationSettings.test.dispatchNo");
      const dash = t("billingSettings.dash");
      setLastResult(
        `id=${r.id ?? dash} · status=${r.status} · dispatched=${dispatchedLabel}` +
          (r.error ? ` · error=${r.error}` : ""),
      );
      if (r.dispatched) toast.success(tt("notificationSettings.test.sentToast"));
      else if (r.status === "pending_credentials")
        toast.info(tt("notificationSettings.test.pendingCredentialsToast"));
      else toast.success(tt("notificationSettings.test.queuedToast"));
      qc.invalidateQueries({ queryKey: ["test-send-history", orgId] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : tt("notificationSettings.test.sendFailed");
      toast.error(msg);
      setLastResult(msg);
    },
  });

  const recipientPlaceholder =
    channel === "email" ? "user@example.com" : "+9665XXXXXXXX";

  // suppress unused warning for locale
  void i18nInst;

  return (
    <div className="grid gap-4">
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4 text-primary" /> {tt("notificationSettings.test.cardTitle")}
        </CardTitle>
        <CardDescription>{tt("notificationSettings.test.cardDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{tt("notificationSettings.test.channelLabel")}</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="email">{tt("notificationSettings.test.optionEmail")}</option>
              <option value="whatsapp">{tt("notificationSettings.test.optionWhatsapp")}</option>
              <option value="sms">{tt("notificationSettings.test.optionSms")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>{tt("notificationSettings.test.recipientLabel")}</Label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={recipientPlaceholder}
              dir="ltr"
            />
          </div>
        </div>
        <div>
          <Label>{tt("notificationSettings.test.templateLabel")}</Label>
          <Input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="test_message"
            dir="ltr"
          />
        </div>
        <div>
          <Label>{tt("notificationSettings.test.variablesLabel")}</Label>
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
            aria-label={tt("notificationSettings.test.dispatchNowAria")}
          />
          {tt("notificationSettings.test.dispatchNow")}
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
            {tt("notificationSettings.test.sendButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
    <TestSendHistory orgId={orgId} />
    </div>
  );
}

function TestSendHistory({ orgId }: { orgId: string }) {
  const { t: tt, i18n: i18nInst } = useTranslation();
  const isAr = i18nInst.language === "ar";
  const listFn = useServerFn(listTestSendHistory);
  const q = useQuery({
    queryKey: ["test-send-history", orgId],
    queryFn: () => listFn({ data: { org_id: orgId, limit: 25 } }),
  });
  const rows = q.data ?? [];
  const channelLabel = (c: string) =>
    tt(`notificationSettings.history.channelLabels.${c}`, { defaultValue: c });
  const statusBadge = (
    s: string,
  ): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    const variantMap: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      sent: "default",
      failed: "destructive",
      dead_letter: "destructive",
      pending_credentials: "outline",
      pending: "secondary",
      skipped: "outline",
    };
    return {
      label: tt(`notificationSettings.history.statusLabels.${s}`, { defaultValue: s }),
      variant: variantMap[s] ?? "outline",
    };
  };
  const dash = tt("billingSettings.dash");
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(isAr ? "ar-SA" : "en-US", { hour12: false }) : dash;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4 text-primary" /> {tt("notificationSettings.history.title")}
        </CardTitle>
        <CardDescription>{tt("notificationSettings.history.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {tt("notificationSettings.history.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-start">
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colChannel")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colRecipient")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colTemplate")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colStatus")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colAttempts")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colCreated")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {tt("notificationSettings.history.colSent")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = statusBadge(r.status);
                  return (
                    <tr key={r.id} className="border-t align-top">
                      <td className="px-3 py-2">{channelLabel(r.channel)}</td>
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

const EXPENSE_EVENT_KEYS = [
  "expense_claim_submitted",
  "expense_batch_submitted",
  "expense_batch_approved",
  "expense_batch_rejected",
  "expense_claim_corrected",
  "expense_reimbursed",
] as const;

const APPLICATION_EVENT_KEYS = [
  "application.status_changed",
  "application.note_added",
  "application.approved",
  "application.rejected",
] as const;

const EVENT_CHANNELS: EventChannel[] = ["email", "in_app", "whatsapp", "sms", "push"];
const APPLICATION_CHANNELS: EventChannel[] = ["email", "in_app"];

function EventPrefsSection({ orgId }: { orgId: string }) {
  const { t: tt } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listUserEventPrefs);
  const saveFn = useServerFn(upsertUserEventPref);

  const q = useQuery({
    queryKey: ["user-event-prefs", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });

  const save = useMutation({
    mutationFn: (v: {
      event_key: string;
      channel: EventChannel;
      enabled?: boolean;
      frequency?: "instant" | "daily" | "weekly" | "off";
    }) => saveFn({ data: { orgId, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-event-prefs", orgId] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : tt("notificationSettings.events.saveFailedToast"),
      ),
  });

  if (q.isLoading)
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  const key = (event_key: string, ch: EventChannel) => `${event_key}::${ch}`;
  const enabledMap = new Map<string, boolean>();
  const freqMap = new Map<string, "instant" | "daily" | "weekly" | "off">();
  for (const r of q.data ?? []) {
    enabledMap.set(key(r.event_key, r.channel), r.enabled);
    freqMap.set(
      key(r.event_key, r.channel),
      (r.frequency ?? "instant") as "instant" | "daily" | "weekly" | "off",
    );
  }
  const isEnabled = (event_key: string, ch: EventChannel) =>
    enabledMap.get(key(event_key, ch)) ?? true;
  const getFreq = (event_key: string, ch: EventChannel) =>
    freqMap.get(key(event_key, ch)) ?? "instant";

  const channelLabel = (c: EventChannel) =>
    tt(`notificationSettings.events.channelLabels.${c}`);
  const freqLabel = (f: "instant" | "daily" | "weekly" | "off") =>
    tt(`notificationSettings.events.freqLabels.${f}`);

  const eventLabel = (group: "expense" | "application", k: string) =>
    tt(`notificationSettings.events.${group}.${k}.label`, { defaultValue: k });
  const eventHint = (group: "expense" | "application", k: string) =>
    tt(`notificationSettings.events.${group}.${k}.hint`, { defaultValue: "" });

  const renderTable = (
    title: string,
    description: string,
    group: "expense" | "application",
    eventKeys: readonly string[],
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
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">
                {tt("notificationSettings.events.eventCol")}
              </th>
              {channels.map((c) => (
                <th key={c} className="py-2 text-center font-medium">
                  {channelLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventKeys.map((evKey) => {
              const label = eventLabel(group, evKey);
              const hint = eventHint(group, evKey);
              return (
                <tr key={evKey} className="border-b last:border-0 align-top">
                  <td className="py-3 pe-3">
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{hint}</div>
                  </td>
                  {channels.map((ch) => {
                    const on = isEnabled(evKey, ch);
                    const freq = getFreq(evKey, ch);
                    return (
                      <td key={ch} className="py-3 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Switch
                            checked={on}
                            onCheckedChange={(next) =>
                              save.mutate({ event_key: evKey, channel: ch, enabled: next })
                            }
                            aria-label={`${label} — ${channelLabel(ch)}`}
                          />
                          <select
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                            disabled={!on}
                            value={freq}
                            onChange={(e) =>
                              save.mutate({
                                event_key: evKey,
                                channel: ch,
                                frequency: e.target.value as
                                  | "instant"
                                  | "daily"
                                  | "weekly"
                                  | "off",
                              })
                            }
                            aria-label={tt("notificationSettings.events.freqAria", {
                              event: label,
                              channel: channelLabel(ch),
                            })}
                          >
                            {(["instant", "daily", "weekly", "off"] as const).map((f) => (
                              <option key={f} value={f}>
                                {freqLabel(f)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4">
      {renderTable(
        tt("notificationSettings.events.expenseTitle"),
        tt("notificationSettings.events.expenseDesc"),
        "expense",
        EXPENSE_EVENT_KEYS as readonly string[],
        EVENT_CHANNELS,
      )}
      {renderTable(
        tt("notificationSettings.events.applicationTitle"),
        tt("notificationSettings.events.applicationDesc"),
        "application",
        APPLICATION_EVENT_KEYS as readonly string[],
        APPLICATION_CHANNELS,
      )}
    </div>
  );
}

function ChannelsSection({ orgId }: { orgId: string }) {
  const { t: tt } = useTranslation();
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
      toast.success(tt("notificationSettings.channelCard.savedToast"));
      qc.invalidateQueries({ queryKey: ["channel-settings", orgId] });
    },
    onError: (e: any) =>
      toast.error(e?.message ?? tt("notificationSettings.channelCard.saveFailedToast")),
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
        const meta = CHANNEL_META_KEYS[ch];
        const Icon = meta.icon;
        return (
          <ChannelCard
            key={ch}
            channel={ch}
            label={tt(meta.labelKey)}
            hint={tt(meta.hintKey)}
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
  const { t: tt } = useTranslation();
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
              <Badge className="bg-primary/10 text-primary">
                {tt("notificationSettings.channelCard.enabledBadge")}
              </Badge>
            ) : (
              <Badge variant="outline">
                {tt("notificationSettings.channelCard.disabledBadge")}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="mt-1">{hint}</CardDescription>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label={tt("notificationSettings.channelCard.toggleAria", { label })}
        />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>{tt("notificationSettings.channelCard.senderName")}</Label>
          <Input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder={
              channel === "email"
                ? tt("notificationSettings.channelCard.senderPlaceholderEmail")
                : tt("notificationSettings.channelCard.senderPlaceholderOther")
            }
          />
        </div>
        {channel === "email" ? (
          <div>
            <Label>{tt("notificationSettings.channelCard.replyToLabel")}</Label>
            <Input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={tt("notificationSettings.channelCard.replyToPlaceholder")}
            />
          </div>
        ) : (
          <div>
            <Label>{tt("notificationSettings.channelCard.senderIdLabel")}</Label>
            <Input
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={
                channel === "sms"
                  ? tt("notificationSettings.channelCard.smsPlaceholder")
                  : tt("notificationSettings.channelCard.accountIdPlaceholder")
              }
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
            {tt("notificationSettings.channelCard.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplatesSection({ orgId }: { orgId: string }) {
  const { t: tt } = useTranslation();
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
      toast.success(tt("notificationSettings.templates.savedToast"));
      qc.invalidateQueries({ queryKey: ["notification-templates", orgId, "auction_winner"] });
    },
    onError: (e: any) =>
      toast.error(e?.message ?? tt("notificationSettings.templates.saveFailedToast")),
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
            <Trophy className="size-4 text-primary" /> {tt("notificationSettings.templates.header")}
          </CardTitle>
          <CardDescription>
            {tt("notificationSettings.templates.description")}{" "}
            <code className="rounded bg-muted px-1 text-[11px]">
              {"{{bidder_name}} {{auction_title}} {{amount}} {{deadline}}"}
            </code>
          </CardDescription>
        </CardHeader>
      </Card>

      {channels.map((ch) => {
        const cur = byChannel.get(ch);
        const meta = CHANNEL_META_KEYS[ch];
        const Icon = meta.icon;
        return (
          <TemplateCard
            key={ch}
            channel={ch}
            label={tt(meta.labelKey)}
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
  const { t: tt } = useTranslation();
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
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label={tt("notificationSettings.templates.activateAria", { label })}
        />
      </CardHeader>
      <CardContent className="grid gap-3">
        {showSubject && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{tt("notificationSettings.templates.subjectAr")}</Label>
              <Input value={sa} onChange={(e) => setSa(e.target.value)} />
            </div>
            <div>
              <Label>{tt("notificationSettings.templates.subjectEn")}</Label>
              <Input value={se} onChange={(e) => setSe(e.target.value)} dir="ltr" />
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>{tt("notificationSettings.templates.bodyAr")}</Label>
            <Textarea rows={5} value={ba} onChange={(e) => setBa(e.target.value)} />
          </div>
          <div>
            <Label>{tt("notificationSettings.templates.bodyEn")}</Label>
            <Textarea rows={5} value={be} onChange={(e) => setBe(e.target.value)} dir="ltr" />
          </div>
        </div>
        {smsLen !== null && (
          <p className={`text-xs ${smsLen > 160 ? "text-warning" : "text-muted-foreground"}`}>
            {tt("notificationSettings.templates.smsCounter", { count: smsLen })}
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
            {tt("notificationSettings.templates.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
