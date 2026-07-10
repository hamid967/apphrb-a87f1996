import { useEffect, useState } from "react";

export type HamidGender = "male" | "female";

export type HamidVoiceSettings = {
  gender: HamidGender;
  /** OpenAI TTS voice id (used by the server route) */
  serverVoice: string;
  /** Playback speed (0.7 – 1.3) */
  rate: number;
  /** Pitch multiplier for the browser SpeechSynthesis fallback (0.5 – 1.5) */
  pitch: number;
};

export const HAMID_VOICE_STORAGE_KEY = "hamid.voice.settings.v1";

export const DEFAULT_HAMID_VOICE: HamidVoiceSettings = {
  gender: "male",
  serverVoice: "onyx",
  rate: 0.95,
  pitch: 0.9,
};

/** Preset OpenAI TTS voices grouped by perceived gender. */
export const HAMID_VOICE_PRESETS: Record<
  HamidGender,
  Array<{ id: string; label: string }>
> = {
  male: [
    { id: "onyx", label: "أونيكس — عميق ودافئ" },
    { id: "ash", label: "آش — هادئ وواضح" },
    { id: "verse", label: "فيرس — نبرة متوازنة" },
    { id: "echo", label: "إيكو — سردي" },
  ],
  female: [
    { id: "nova", label: "نوفا — مشرقة" },
    { id: "shimmer", label: "شيمر — ناعمة" },
    { id: "coral", label: "كورال — ودودة" },
    { id: "sage", label: "سيج — رزينة" },
  ],
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeVoiceSettings(
  raw: Partial<HamidVoiceSettings> | null | undefined,
): HamidVoiceSettings {
  if (!raw) return DEFAULT_HAMID_VOICE;
  const gender: HamidGender = raw.gender === "female" ? "female" : "male";
  const presets = HAMID_VOICE_PRESETS[gender];
  const serverVoice =
    raw.serverVoice && presets.some((p) => p.id === raw.serverVoice)
      ? raw.serverVoice
      : presets[0].id;
  return {
    gender,
    serverVoice,
    rate: clamp(Number(raw.rate ?? DEFAULT_HAMID_VOICE.rate), 0.7, 1.3),
    pitch: clamp(Number(raw.pitch ?? DEFAULT_HAMID_VOICE.pitch), 0.5, 1.5),
  };
}

function readFromStorage(): HamidVoiceSettings {
  if (typeof window === "undefined") return DEFAULT_HAMID_VOICE;
  try {
    const raw = window.localStorage.getItem(HAMID_VOICE_STORAGE_KEY);
    if (!raw) return DEFAULT_HAMID_VOICE;
    return normalizeVoiceSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_HAMID_VOICE;
  }
}

/**
 * Hydration-safe hook: starts with defaults on the server and first client
 * render, then loads the persisted value in an effect to avoid SSR mismatch.
 */
export function useHamidVoiceSettings(): {
  settings: HamidVoiceSettings;
  update: (patch: Partial<HamidVoiceSettings>) => void;
  reset: () => void;
  hydrated: boolean;
} {
  const [settings, setSettings] = useState<HamidVoiceSettings>(DEFAULT_HAMID_VOICE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(readFromStorage());
    setHydrated(true);
  }, []);

  const persist = (next: HamidVoiceSettings) => {
    setSettings(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(HAMID_VOICE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / privacy errors
      }
    }
  };

  const update = (patch: Partial<HamidVoiceSettings>) => {
    persist(normalizeVoiceSettings({ ...settings, ...patch }));
  };

  const reset = () => persist(DEFAULT_HAMID_VOICE);

  return { settings, update, reset, hydrated };
}
