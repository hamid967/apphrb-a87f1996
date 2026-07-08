import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/portal/settings/notifications")({
  head: () => portalHead({ titleAr: 'إعدادات الإشعارات', titleEn: 'Notification Settings', descAr: 'تحكّم في قنوات الإشعارات وتفضيلاتها.', path: '/portal/settings/notifications' }),
  component: NotifSettings,
});

function NotifSettings() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const channels = [
    { key: "push", ar: "إشعارات المتصفح", en: "Browser push" },
    { key: "email", ar: "البريد الإلكتروني", en: "Email" },
    { key: "sms", ar: "الرسائل النصية", en: "SMS" },
    { key: "whatsapp", ar: "واتساب", en: "WhatsApp" },
  ];
  const types = [
    { key: "expiry", ar: "تنبيهات الانتهاء", en: "Expiry alerts" },
    { key: "payment", ar: "الفواتير والمدفوعات", en: "Payments" },
    { key: "task", ar: "المهام والطلبات", en: "Tasks & requests" },
    { key: "system", ar: "أخبار النظام", en: "System news" },
  ];
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    push: true,
    email: true,
    sms: false,
    whatsapp: true,
    expiry: true,
    payment: true,
    task: true,
    system: false,
  });
  const toggle = (k: string) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold">{isAr ? "قنوات الإرسال" : "Channels"}</h2>
        <div className="mt-3 divide-y divide-border/60">
          {channels.map((c) => (
            <Row
              key={c.key}
              label={isAr ? c.ar : c.en}
              on={prefs[c.key]}
              onToggle={() => toggle(c.key)}
            />
          ))}
        </div>
      </section>
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold">{isAr ? "أنواع التنبيهات" : "Notification types"}</h2>
        <div className="mt-3 divide-y divide-border/60">
          {types.map((c) => (
            <Row
              key={c.key}
              label={isAr ? c.ar : c.en}
              on={prefs[c.key]}
              onToggle={() => toggle(c.key)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={"relative h-6 w-11 rounded-full transition " + (on ? "bg-primary" : "bg-muted")}
      >
        <span
          className={
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition " +
            (on ? "left-[22px]" : "left-0.5")
          }
        />
      </button>
    </div>
  );
}
