import { useEffect, useState } from "react";

export type ReminderCategory =
  | "review"
  | "receipt"
  | "rejected"
  | "draft"
  | "approved"
  | "slow";

export type ReminderFrequency = "realtime" | "5min" | "15min" | "hourly" | "off";

export type ReminderPreferences = {
  enabled: Record<ReminderCategory, boolean>;
  frequency: ReminderFrequency;
};

export const REMINDER_CATEGORIES: ReminderCategory[] = [
  "review",
  "receipt",
  "rejected",
  "draft",
  "approved",
  "slow",
];

export const CATEGORY_LABELS: Record<
  ReminderCategory,
  { ar: string; en: string; descAr: string; descEn: string }
> = {
  review: {
    ar: "تقارير قيد المراجعة",
    en: "Under review",
    descAr: "تنبيه عندما تكون مطالبتك قيد المراجعة.",
    descEn: "When a claim is being reviewed.",
  },
  receipt: {
    ar: "إثبات إضافي مطلوب",
    en: "Missing receipts",
    descAr: "تنبيه عند إرسال مطالبة بدون إيصال.",
    descEn: "When a submitted claim has no receipt.",
  },
  rejected: {
    ar: "المطالبات المرفوضة",
    en: "Rejected claims",
    descAr: "تنبيه عند رفض مطالبتك لتصحيحها.",
    descEn: "When your claim was rejected.",
  },
  draft: {
    ar: "مسودات لم تُرسل",
    en: "Unsubmitted drafts",
    descAr: "تذكير بالمسودات التي لم تُرسل بعد.",
    descEn: "Drafts still waiting to be submitted.",
  },
  approved: {
    ar: "الموافقات الأخيرة",
    en: "Recent approvals",
    descAr: "إشعار عند اعتماد مطالبتك خلال 3 أيام.",
    descEn: "When a claim was approved recently.",
  },
  slow: {
    ar: "مراجعات متأخرة",
    en: "Overdue reviews",
    descAr: "تنبيه عندما تتجاوز المراجعة 5 أيام.",
    descEn: "When a review has been pending over 5 days.",
  },
};

export const FREQUENCY_OPTIONS: {
  value: ReminderFrequency;
  ar: string;
  en: string;
  ms: number | null;
}[] = [
  { value: "realtime", ar: "فوري (كل 30 ثانية)", en: "Realtime (30s)", ms: 30_000 },
  { value: "5min", ar: "كل 5 دقائق", en: "Every 5 minutes", ms: 5 * 60_000 },
  { value: "15min", ar: "كل 15 دقيقة", en: "Every 15 minutes", ms: 15 * 60_000 },
  { value: "hourly", ar: "كل ساعة", en: "Hourly", ms: 60 * 60_000 },
  { value: "off", ar: "إيقاف التحديث التلقائي", en: "Paused (manual only)", ms: null },
];

export const DEFAULT_PREFERENCES: ReminderPreferences = {
  enabled: {
    review: true,
    receipt: true,
    rejected: true,
    draft: true,
    approved: true,
    slow: true,
  },
  frequency: "realtime",
};

const STORAGE_KEY = (userId: string | undefined) =>
  `aqari:reminder-prefs:${userId ?? "anon"}`;
const EVENT_NAME = "aqari:reminder-prefs-changed";

export function loadReminderPreferences(
  userId: string | undefined,
): ReminderPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(userId));
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ReminderPreferences>;
    return {
      enabled: { ...DEFAULT_PREFERENCES.enabled, ...(parsed.enabled ?? {}) },
      frequency: parsed.frequency ?? DEFAULT_PREFERENCES.frequency,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveReminderPreferences(
  userId: string | undefined,
  prefs: ReminderPreferences,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { userId } }));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Reactive hook — reads the current preferences and updates immediately
 * when they change in this tab (via `saveReminderPreferences`) or another
 * tab (via the native `storage` event).
 */
export function useReminderPreferences(userId: string | undefined) {
  const [prefs, setPrefs] = useState<ReminderPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(loadReminderPreferences(userId));
    const onChanged = () => setPrefs(loadReminderPreferences(userId));
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY(userId)) setPrefs(loadReminderPreferences(userId));
    };
    window.addEventListener(EVENT_NAME, onChanged as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChanged as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  return prefs;
}

export function frequencyToMs(freq: ReminderFrequency): number | null {
  return FREQUENCY_OPTIONS.find((o) => o.value === freq)?.ms ?? null;
}

export function categoryFromReminderId(id: string): ReminderCategory | null {
  const prefix = id.split("-", 1)[0];
  if (
    prefix === "review" ||
    prefix === "receipt" ||
    prefix === "rejected" ||
    prefix === "draft" ||
    prefix === "approved" ||
    prefix === "slow"
  ) {
    return prefix;
  }
  return null;
}
