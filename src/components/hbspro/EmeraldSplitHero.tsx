import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BarChart3,
  ArrowLeft,
  Building2,
  Clock3,
  Wrench,
  CreditCard,
  Sparkles,
  BellRing,
  TrendingUp,
} from "lucide-react";

/**
 * Emerald / Gold luxury split hero — chosen design direction for the home page.
 * RTL, deep emerald #043927 brand panel + cream #fdfcfb feature grid.
 * Typography: Tajawal (Arabic body), DM Serif Display (accent italic), Fira Sans (Latin chip).
 */
export function EmeraldSplitHero() {
  const features = [
    {
      icon: Building2,
      title: "إدارة المحافظ والوحدات",
      desc: "صورة موحدة لكل أصل ووحدة: الحالة، الإشغال، العائد، العقود، والمخاطر التشغيلية.",
    },
    {
      icon: CreditCard,
      title: "التحصيل والمتأخرات",
      desc: "متابعة تلقائية للدفعات، المتأخرين، التذكيرات، وسجل التحصيل لكل مستأجر ومالك.",
    },
    {
      icon: Wrench,
      title: "الصيانة والتذاكر",
      desc: "بلاغات موثقة، أولويات واضحة، تعيين فنيين، وتتبع وقت المعالجة حتى الإغلاق.",
    },
    {
      icon: BarChart3,
      title: "تقارير تنفيذية ذكية",
      desc: "مؤشرات إشغال، إيرادات، شغور، عقود منتهية، وقرارات مقترحة من المساعد الذكي.",
    },
  ];

  const proof = [
    { label: "إشغال المحفظة", value: "96.4%" },
    { label: "تحصيل الشهر", value: "2.84M" },
    { label: "تنبيهات مبكرة", value: "24/7" },
  ];

  return (
    <section
      dir="rtl"
      className="w-full bg-[#fdfcfb] flex items-center justify-center p-4 sm:p-6 lg:p-12"
      style={{ fontFamily: "'Tajawal', 'IBM Plex Sans Arabic', sans-serif" }}
    >
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-[2rem] lg:rounded-[2.5rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(4,57,39,0.15)]">
        <div className="lg:col-span-5 bg-[#043927] p-8 sm:p-10 lg:p-16 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <pattern id="emerald-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#C5A059" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#emerald-grid)" />
            </svg>
          </div>
          <div className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-[#C5A059]/10 blur-3xl" />
          <div className="absolute -bottom-28 right-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#C5A059]/30 bg-[#C5A059]/10 px-4 py-1.5">
              <Sparkles className="h-4 w-4 text-[#C5A059]" />
              <span className="text-[#C5A059] text-sm font-medium tracking-wide uppercase" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
                HBSpro 2030
              </span>
            </div>

            <h1 className="text-4xl lg:text-6xl font-bold text-white leading-tight mb-6">
              مركز قيادة ذكي
              <span className="italic text-[#C5A059] block" style={{ fontFamily: "'DM Serif Display', serif" }}>
                لمحفظتك العقارية
              </span>
            </h1>

            <p className="text-[#c9ddd4] text-lg lg:text-xl leading-relaxed mb-8 max-w-xl">
              HBSpro يجمع الأملاك، العقود، التحصيل، الصيانة، التقارير، والمساعد الذكي في منصة واحدة مصممة للسوق السعودي.
            </p>

            <div className="mb-10 grid grid-cols-3 gap-3 max-w-xl">
              {proof.map((p) => (
                <div key={p.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-2xl font-bold text-[#C5A059]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    {p.value}
                  </div>
                  <div className="mt-1 text-[11px] text-white/65">{p.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4">
              <motion.div whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}>
                <Link
                  to="/auth"
                  search={{ mode: "signup" } as never}
                  className="px-8 py-4 bg-[#C5A059] text-[#043927] font-bold rounded-xl shadow-lg hover:shadow-[#C5A059]/30 inline-flex items-center gap-2"
                >
                  ابدأ تجربتك المجانية
                </Link>
              </motion.div>
              <motion.a
                href="#portfolio-command"
                whileHover={{ y: -2, backgroundColor: "rgba(255,255,255,0.06)" }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="px-8 py-4 border border-white/20 text-white font-medium rounded-xl inline-flex items-center gap-2"
              >
                شاهد لوحة التحكم
                <ArrowLeft className="w-4 h-4" />
              </motion.a>
            </div>
          </div>
        </div>

        <div id="features" className="lg:col-span-7 bg-white p-8 sm:p-10 lg:p-16 flex items-center">
          <div className="w-full">
            <div className="mb-8 max-w-2xl">
              <div className="mb-3 text-sm font-bold text-[#C5A059]">من منصة إدارة إلى نظام تشغيل عقاري</div>
              <h2 className="text-3xl font-bold text-[#043927] lg:text-4xl">كل ما يحتاجه مدير المحفظة في شاشة واحدة</h2>
              <p className="mt-3 text-stone-500 leading-relaxed">
                صممنا الواجهة لتكشف الثغرات التشغيلية قبل أن تتحول إلى فاقد مالي: شغور، تأخر تحصيل، عقود قاربت الانتهاء، وبلاغات صيانة متوقفة.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
                    whileHover={{ y: -6, boxShadow: "0 24px 60px -30px rgba(4,57,39,0.35)" }}
                    whileTap={{ scale: 0.98 }}
                    className="group p-6 rounded-3xl border border-stone-100 bg-stone-50/70 hover:bg-white hover:border-[#C5A059]/40 cursor-pointer"
                  >
                    <motion.div
                      whileHover={{ rotate: -6, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="w-12 h-12 bg-[#043927] rounded-xl flex items-center justify-center mb-5"
                    >
                      <Icon className="w-6 h-6 text-[#C5A059]" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-[#043927] mb-3">{f.title}</h3>
                    <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PortfolioCommandCenter() {
  const cards = [
    { icon: TrendingUp, title: "إيرادات الشهر", value: "2.84M SAR", note: "+12% عن الشهر السابق", tone: "good" },
    { icon: Building2, title: "وحدات شاغرة", value: "18", note: "7 تحتاج تسويقاً فورياً", tone: "warn" },
    { icon: Clock3, title: "عقود تنتهي قريباً", value: "42", note: "خلال 30 يوماً", tone: "warn" },
    { icon: Wrench, title: "بلاغات صيانة مفتوحة", value: "23", note: "5 عالية الأولوية", tone: "danger" },
  ];
  const actions = [
    "إرسال تذكير تلقائي للمتأخرين",
    "اقتراح سعر تسويق للوحدات الشاغرة",
    "تجهيز قائمة عقود قابلة للتجديد",
    "تصعيد بلاغات الصيانة المتأخرة",
  ];

  return (
    <section id="portfolio-command" dir="rtl" className="relative py-16 md:py-24 bg-[#043927]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(197,160,89,0.16),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mb-10 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C5A059]/25 bg-[#C5A059]/10 px-4 py-2 text-sm text-[#E8D9A6]">
            <BellRing className="h-4 w-4" /> لوحة صباح مدير المحفظة
          </div>
          <h2 className="text-3xl font-bold text-white sm:text-5xl">اعرف ما يحتاج قراراً قبل بداية اليوم</h2>
          <p className="mt-4 text-base leading-relaxed text-[#a8c6ba]">
            بدلاً من البحث في الجداول والمكالمات، يجمع HBSpro أهم المؤشرات والإجراءات المقترحة في شاشة تنفيذية واحدة.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-[#C5A059]/20 bg-white/[0.04] p-5 backdrop-blur-xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-[#a8c6ba]">نظرة تشغيلية مباشرة</div>
                <div className="text-xl font-bold text-white">محفظة الرياض وجدة والدمام</div>
              </div>
              <span className="rounded-full bg-[#C5A059]/15 px-3 py-1 text-xs font-semibold text-[#E8D9A6]">Live</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {cards.map((card, i) => {
                const Icon = card.icon;
                const color = card.tone === "good" ? "#7dd3a8" : card.tone === "danger" ? "#fca5a5" : "#E8D9A6";
                return (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-2xl border border-white/10 bg-[#062f22]/70 p-5"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="text-sm text-[#a8c6ba]">{card.title}</span>
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06]" style={{ color }}>
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-white">{card.value}</div>
                    <div className="mt-2 text-sm" style={{ color }}>{card.note}</div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-[#C5A059]/20 bg-[#fdfcfb] p-6 text-[#043927] shadow-[0_28px_80px_-40px_rgba(0,0,0,0.6)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#C5A059]">
              <Sparkles className="h-4 w-4" /> توصيات حامد الذكية
            </div>
            <h3 className="text-2xl font-bold">إجراءات مقترحة الآن</h3>
            <div className="mt-5 space-y-3">
              {actions.map((action, i) => (
                <motion.div
                  key={action}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-3 rounded-2xl border border-[#043927]/10 bg-white p-4"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#043927] text-sm font-bold text-[#C5A059]">{i + 1}</span>
                  <span className="text-sm font-medium">{action}</span>
                </motion.div>
              ))}
            </div>
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#043927] px-5 py-3 text-sm font-bold text-[#E8D9A6]"
            >
              جرّب المساعد داخل حسابك
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
