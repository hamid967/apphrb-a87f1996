import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BellRing, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import {
  CATEGORY_LABELS,
  DEFAULT_PREFERENCES,
  FREQUENCY_OPTIONS,
  REMINDER_CATEGORIES,
  type ReminderCategory,
  type ReminderFrequency,
  type ReminderPreferences,
  loadReminderPreferences,
  saveReminderPreferences,
} from "@/lib/reminder-preferences";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/dashboard/settings/reminders")({
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "إعدادات التذكيرات الذكية",
      entityEn: "Smart reminder settings",
      path: "/dashboard/settings/reminders",
    }),
  component: RemindersSettingsPage,
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
          إعادة المحاولة — Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found — غير موجود</div>,
});

function RemindersSettingsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { user } = useAuth();

  const [prefs, setPrefs] = useState<ReminderPreferences>(DEFAULT_PREFERENCES);
  const [initial, setInitial] = useState<ReminderPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const loaded = loadReminderPreferences(user?.id);
    setPrefs(loaded);
    setInitial(loaded);
  }, [user?.id]);

  const dirty = useMemo(
    () => JSON.stringify(prefs) !== JSON.stringify(initial),
    [prefs, initial],
  );

  const toggleCategory = (cat: ReminderCategory) =>
    setPrefs((p) => ({ ...p, enabled: { ...p.enabled, [cat]: !p.enabled[cat] } }));

  const setFrequency = (freq: ReminderFrequency) =>
    setPrefs((p) => ({ ...p, frequency: freq }));

  const onSave = () => {
    saveReminderPreferences(user?.id, prefs);
    setInitial(prefs);
    toast.success(isAr ? "تم حفظ التفضيلات" : "Preferences saved");
  };

  const onReset = () => {
    setPrefs(DEFAULT_PREFERENCES);
  };

  const enabledCount = REMINDER_CATEGORIES.filter((c) => prefs.enabled[c]).length;
  const Arrow = isAr ? ArrowRight : ArrowLeft;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to="/dashboard/settings"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Arrow className="size-3.5" />
              {isAr ? "الإعدادات" : "Settings"}
            </Link>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BellRing className="size-5 text-primary" />
            {isAr ? "التذكيرات الذكية" : "Smart reminders"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "فعِّل أو عطِّل أنواع التذكيرات واختر تكرار التحديث المناسب لك."
              : "Enable or disable reminder types and choose how often they refresh."}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 self-start rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {enabledCount}/{REMINDER_CATEGORIES.length}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "أنواع التذكيرات" : "Reminder types"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "اختر التنبيهات التي تريد رؤيتها على لوحة التحكم."
              : "Pick the notifications you want to see on the dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {REMINDER_CATEGORIES.map((cat) => {
            const l = CATEGORY_LABELS[cat];
            const id = `rem-${cat}`;
            return (
              <div
                key={cat}
                className="flex items-start justify-between gap-4 rounded-lg border border-transparent p-3 hover:border-border/60 hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <Label htmlFor={id} className="text-sm font-semibold">
                    {isAr ? l.ar : l.en}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isAr ? l.descAr : l.descEn}
                  </p>
                </div>
                <Switch
                  id={id}
                  checked={prefs.enabled[cat]}
                  onCheckedChange={() => toggleCategory(cat)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "تكرار التنبيهات" : "Alert frequency"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "حدّد كل كم من الوقت تُحدَّث لوحة التذكيرات تلقائياً."
              : "Choose how often the reminders panel refreshes automatically."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={prefs.frequency}
            onValueChange={(v) => setFrequency(v as ReminderFrequency)}
            className="space-y-2"
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`freq-${opt.value}`}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition ${
                  prefs.frequency === opt.value
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/60 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem id={`freq-${opt.value}`} value={opt.value} />
                  <span className="text-sm font-medium">{isAr ? opt.ar : opt.en}</span>
                </div>
                {opt.value === "off" && (
                  <span className="text-[11px] text-muted-foreground">
                    {isAr ? "يدوي فقط" : "manual only"}
                  </span>
                )}
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={onReset}>
          <RotateCcw className="me-2 size-4" />
          {isAr ? "استعادة الافتراضي" : "Reset defaults"}
        </Button>
        <Button onClick={onSave} disabled={!dirty}>
          <Save className="me-2 size-4" />
          {isAr ? "حفظ التفضيلات" : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}
