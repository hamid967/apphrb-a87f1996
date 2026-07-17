import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const INTRO_DURATION_MS = 20_000;
const SCENE_DURATION_MS = 4_000;

const scenes = [
  {
    eyebrow: "AMLAK HBSH",
    title: "HBSpro",
    subtitle: "منصة سعودية لإدارة الأملاك والمصاريف والصيانة",
    bullets: ["عقارات ووحدات", "عقود وتحصيل", "تقارير PDF احترافية"],
    metric: "01",
  },
  {
    eyebrow: "كل شيء في مكان واحد",
    title: "من العقار إلى العقد",
    subtitle: "أدر الوحدات والمستأجرين والتنبيهات دون فوضى تشغيلية",
    bullets: ["ملفات عقارية واضحة", "تنبيهات انتهاء العقود", "بوابة عملاء منظمة"],
    metric: "02",
  },
  {
    eyebrow: "مالية دقيقة",
    title: "تحصيل ومصاريف وميزانيات",
    subtitle: "أرقام قابلة للمراجعة مع ضريبة محسوبة وسندات مرقمة",
    bullets: ["سداد كلي وجزئي", "مصروفات عقارية وشخصية", "مصدر كل قيد محفوظ"],
    metric: "03",
  },
  {
    eyebrow: "صيانة ذكية",
    title: "طلبات وموردون وجدولة وقائية",
    subtitle: "تابع البلاغات والصور والتكلفة حتى الإغلاق",
    bullets: ["كانبان للطلبات", "موردون وتقييمات", "مصاريف صيانة تلقائية"],
    metric: "04",
  },
  {
    eyebrow: "تصدير فاخر",
    title: "PDF يحمل هوية العميل",
    subtitle: "فواتير وسندات وكشوف وتقارير أداء بقوالب متعددة",
    bullets: ["شعار وبيانات ضريبية", "QR للفواتير المبسطة", "تقارير جاهزة للمشاركة"],
    metric: "05",
  },
];

export function LuxuryIntroOverlay() {
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);

  const stopIntroSound = useCallback(() => {
    if (typeof window !== "undefined") {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    }
    timersRef.current = [];
    audioRef.current?.close().catch(() => {});
    audioRef.current = null;
  }, []);

  const closeIntro = useCallback(() => {
    stopIntroSound();
    setVisible(false);
  }, [stopIntroSound]);

  const startIntroSound = useCallback(() => {
    if (typeof window === "undefined") return;
    stopIntroSound();
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    const audio = new AudioCtor();
    audioRef.current = audio;
    const master = audio.createGain();
    master.gain.value = 0.045;
    master.connect(audio.destination);

    const notes = [82, 123, 164, 246, 329, 440];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(index < 3 ? 0.22 : 0.08, audio.currentTime + 1.2 + index * 0.2);
      gain.gain.linearRampToValueAtTime(0.01, audio.currentTime + 19.4);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(audio.currentTime + index * 0.12);
      oscillator.stop(audio.currentTime + 20);
    });

    const timeout = window.setTimeout(() => setSoundOn(false), INTRO_DURATION_MS);
    timersRef.current.push(timeout);
  }, [stopIntroSound]);

  const toggleSound = useCallback(() => {
    if (soundOn) {
      stopIntroSound();
      setSoundOn(false);
      return;
    }
    startIntroSound();
    setSoundOn(true);
  }, [soundOn, startIntroSound, stopIntroSound]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    setElapsed(0);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const nextElapsed = Date.now() - startedAt;
      setElapsed(Math.min(nextElapsed, INTRO_DURATION_MS));
      if (nextElapsed >= INTRO_DURATION_MS) closeIntro();
    }, 120);
    return () => window.clearInterval(interval);
  }, [closeIntro, visible]);

  useEffect(() => {
    return () => stopIntroSound();
  }, [stopIntroSound]);

  const sceneIndex = Math.min(scenes.length - 1, Math.floor(elapsed / SCENE_DURATION_MS));
  const scene = scenes[sceneIndex];
  const progress = Math.min(100, (elapsed / INTRO_DURATION_MS) * 100);
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => i), []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          dir="rtl"
          className="fixed inset-0 z-[1000] overflow-hidden bg-[#071729] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          aria-label="انترو HBSpro الفاخر"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(0,217,192,0.26),transparent_32%),radial-gradient(circle_at_12%_90%,rgba(201,169,97,0.18),transparent_34%),linear-gradient(135deg,#071729_0%,#0A1A2F_55%,#03101f_100%)]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:56px_56px]" />

          {particles.map((particle) => (
            <motion.span
              key={particle}
              className="absolute h-1.5 w-1.5 rounded-full bg-[#00D9C0]/70 shadow-[0_0_24px_rgba(0,217,192,0.65)]"
              style={{
                right: `${8 + ((particle * 17) % 84)}%`,
                top: `${10 + ((particle * 23) % 78)}%`,
              }}
              animate={{ y: [-10, 14, -10], opacity: [0.25, 0.9, 0.25], scale: [0.8, 1.25, 0.8] }}
              transition={{ duration: 5 + (particle % 5), repeat: Infinity, ease: "easeInOut" }}
            />
          ))}

          <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3 sm:left-6 sm:right-6 sm:top-6">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-[#00D9C0]" style={{ width: `${progress}%` }} />
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/15"
              aria-label={soundOn ? "إيقاف صوت الانترو" : "تشغيل صوت الانترو"}
            >
              {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              type="button"
              onClick={closeIntro}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-xs font-bold text-white backdrop-blur-xl transition hover:bg-white/15"
            >
              تخطي
              <X className="size-4" />
            </button>
          </div>

          <div className="relative z-10 mx-auto grid min-h-svh w-full max-w-7xl items-center gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={scene.title}
                initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="max-w-4xl"
              >
                <p className="text-sm font-black uppercase tracking-[0.32em] text-[#00D9C0] sm:text-base">
                  {scene.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-5xl font-black leading-tight text-white sm:text-7xl lg:text-8xl">
                  {scene.title}
                </h1>
                <p className="mt-6 max-w-3xl text-pretty text-xl leading-9 text-slate-200 sm:text-3xl">
                  {scene.subtitle}
                </p>
                <div className="mt-10 grid gap-4 sm:max-w-2xl">
                  {scene.bullets.map((bullet, index) => (
                    <motion.div
                      key={bullet}
                      className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 text-lg font-bold text-white shadow-2xl backdrop-blur-2xl"
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.45, delay: index * 0.12 }}
                    >
                      <span className="size-2.5 rounded-full bg-[#00D9C0] shadow-[0_0_22px_rgba(0,217,192,0.85)]" />
                      {bullet}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="relative hidden min-h-[560px] lg:block" aria-hidden="true">
              <motion.div
                className="absolute inset-x-0 top-8 rounded-[2.25rem] border border-white/10 bg-white/[0.08] p-8 shadow-[0_40px_140px_-70px_rgba(0,217,192,0.9)] backdrop-blur-2xl"
                animate={{ y: [0, -12, 0], rotate: [0, 0.7, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="text-xs font-black uppercase tracking-[0.32em] text-slate-300">Luxury Intro</div>
                <div className="mt-4 text-8xl font-black text-white">{scene.metric}</div>
                <div className="mt-4 text-lg font-bold text-[#00D9C0]">AMLAK HBSH</div>
              </motion.div>
              <motion.div
                className="absolute bottom-14 left-10 right-10 rounded-[2rem] border border-[#C9A961]/25 bg-[#C9A961]/10 p-8 text-center shadow-2xl backdrop-blur-2xl"
                animate={{ y: [10, -6, 10] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                <div className="text-lg text-slate-300">1920 x 1080</div>
                <div className="mt-2 text-5xl font-black text-white">20 SEC</div>
              </motion.div>
            </div>
          </div>

          <motion.div
            className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4 sm:bottom-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <button
              type="button"
              onClick={closeIntro}
              aria-label="تخطي الإنترو والانتقال إلى المحتوى"
              className="pointer-events-auto group inline-flex items-center gap-3 rounded-full border border-[#00D9C0]/40 bg-[#00D9C0]/15 px-7 py-3.5 text-sm font-black text-white shadow-[0_18px_60px_-24px_rgba(0,217,192,0.9)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#00D9C0]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9C0]"
            >
              تخطي الإنترو
              <ChevronDown className="size-4 animate-bounce text-[#00D9C0] transition-transform group-hover:translate-y-0.5" aria-hidden />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
