import { lazy, Suspense } from "react";
import { Link, ClientOnly } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, Building2, Sparkles, ShieldCheck, Wand2 } from "lucide-react";

const HeroCanvas = lazy(() => import("./HeroCanvas"));

const proof = [
  "إدارة أملاك وعقود",
  "تحصيل وصيانة وتقارير",
  "مساعد حامد داخل اللوحة",
];

export function CinematicIntro() {
  return (
    <section
      dir="rtl"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-[#031f17] px-4 pb-12 pt-28 text-[#f5f0e0] sm:px-6 lg:px-10 studio-noise"
      aria-label="HBSpro cinematic intro"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(197,160,89,0.18),transparent_34%),radial-gradient(circle_at_10%_90%,rgba(13,122,95,0.28),transparent_34%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(245,240,224,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(245,240,224,0.5)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="absolute inset-0 z-0">
        <ClientOnly fallback={<div className="h-full w-full bg-[#043927]" />}>
          <Suspense fallback={<div className="h-full w-full bg-[#043927]" />}>
            <HeroCanvas />
          </Suspense>
        </ClientOnly>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-48 bg-gradient-to-t from-[#043927] via-[#043927]/80 to-transparent" />

      <div className="relative z-20 mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C5A059]/35 bg-[#C5A059]/10 px-4 py-2 text-sm font-bold text-[#E8D9A6] backdrop-blur-xl">
            <Sparkles className="h-4 w-4" />
            انترو سينمائي ثلاثي الأبعاد · HBSpro 2030
          </div>

          <h1 className="text-balance text-4xl font-black leading-tight text-white sm:text-6xl lg:text-7xl">
            نظام تشغيل عقاري
            <span className="mt-2 block text-[#C5A059]">يتحرك مع قراراتك</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#c9ddd4] sm:text-xl">
            منصة واحدة تجمع المحافظ، العقود، التحصيل، الصيانة، التقارير، وحامد المساعد الذكي في تجربة مصممة للسوق السعودي.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {proof.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-[#E8D9A6] backdrop-blur-xl"
              >
                <ShieldCheck className="h-4 w-4 text-[#C5A059]" />
                {item}
              </span>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              className="inline-flex items-center justify-center rounded-2xl bg-[#C5A059] px-7 py-4 text-sm font-black text-[#043927] shadow-[0_20px_50px_-22px_rgba(197,160,89,0.85)] transition hover:-translate-y-0.5"
            >
              ابدأ تجربتك المجانية
            </Link>
            <a
              href="#portfolio-command"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-7 py-4 text-sm font-bold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
            >
              شاهد مركز القيادة
              <ArrowLeft className="h-4 w-4" />
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
          className="hidden lg:block"
          aria-hidden="true"
        >
          <div className="studio-card-lg ms-auto w-full max-w-md p-5 text-[#043927] backdrop-blur-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#C5A059]">مركز قيادة حي</div>
                <div className="mt-1 text-xl font-black">محفظة الرياض وجدة والدمام</div>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#043927] text-[#C5A059]">
                <Building2 className="h-6 w-6" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["تحصيل الشهر", "2.84M"],
                ["الإشغال", "96.4%"],
                ["عقود قريبة", "42"],
                ["بلاغات مفتوحة", "23"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-[#043927]/10 bg-white p-4">
                  <div className="text-2xl font-black text-[#043927]">{value}</div>
                  <div className="mt-1 text-xs text-[#547064]">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-[#C5A059]/25 bg-[#C5A059]/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#043927]">
                <Wand2 className="h-4 w-4 text-[#C5A059]" /> توصية حامد
              </div>
              <p className="text-sm leading-6 text-[#486357]">
                ابدأ اليوم بمتابعة المتأخرات عالية المخاطر، ثم جهّز عروض الوحدات الشاغرة قبل نهاية الأسبوع.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
