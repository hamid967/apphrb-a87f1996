import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileText, Users, Gavel, BarChart3, ArrowLeft } from "lucide-react";

/**
 * Emerald / Gold luxury split hero — chosen design direction for the home page.
 * RTL, deep emerald #043927 brand panel + cream #fdfcfb feature grid.
 * Typography: Tajawal (Arabic body), DM Serif Display (accent italic), Fira Sans (Latin chip).
 */
export function EmeraldSplitHero() {
  const features = [
    {
      icon: FileText,
      title: "فواتير ZATCA",
      desc: "متوافق بالكامل مع متطلبات هيئة الزكاة والضريبة والجمارك للفوترة الإلكترونية.",
    },
    {
      icon: Users,
      title: "إدارة العملاء CRM",
      desc: "تتبع مسار مبيعاتك وإدارة علاقات المستأجرين والملاك في لوحة تحكم واحدة.",
    },
    {
      icon: Gavel,
      title: "مزادات عقارية",
      desc: "نظام مزادات إلكتروني شفاف يتيح المزايدة الفورية والتقارير المباشرة.",
    },
    {
      icon: BarChart3,
      title: "تقارير ذكية",
      desc: "تحليلات بيانية دقيقة لمعدلات الإشغال، التحصيل، والعائد على الاستثمار.",
    },
  ];

  return (
    <section
      dir="rtl"
      className="w-full bg-[#fdfcfb] flex items-center justify-center p-6 lg:p-12"
      style={{ fontFamily: "'Tajawal', 'IBM Plex Sans Arabic', sans-serif" }}
    >
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-[2.5rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(4,57,39,0.15)]">
        {/* Brand panel (right in RTL) */}
        <div className="lg:col-span-5 bg-[#043927] p-10 lg:p-16 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <pattern
                  id="emerald-grid"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 20 0 L 0 0 0 20"
                    fill="none"
                    stroke="#C5A059"
                    strokeWidth="0.5"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#emerald-grid)" />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="inline-block px-4 py-1.5 rounded-full border border-[#C5A059]/30 bg-[#C5A059]/10 mb-8">
              <span
                className="text-[#C5A059] text-sm font-medium tracking-wide uppercase"
                style={{ fontFamily: "'Fira Sans', sans-serif" }}
              >
                HBSpro
              </span>
            </div>

            <h1 className="text-4xl lg:text-6xl font-bold text-white leading-tight mb-6">
              مستقبل{" "}
              <span
                className="italic text-[#C5A059] block lg:inline-block"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                الاستثمار
              </span>{" "}
              العقاري الذكي
            </h1>

            <p className="text-[#a8c6ba] text-lg lg:text-xl leading-relaxed mb-10 max-w-xl">
              المنصة السعودية المتكاملة لإدارة الأملاك، العقود الموثقة، وفواتير الزكاة والدخل بنظام
              CRM متطور.
            </p>

            <div className="flex flex-wrap gap-4">
              <motion.div
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
              >
                <Link
                  to="/auth"
                  search={{ mode: "signup" } as never}
                  className="px-8 py-4 bg-[#C5A059] text-[#043927] font-bold rounded-xl shadow-lg hover:shadow-[#C5A059]/30 inline-flex items-center gap-2"
                >
                  ابدأ تجربتك المجانية
                </Link>
              </motion.div>
              <motion.a
                href="#features"
                whileHover={{ y: -2, backgroundColor: "rgba(255,255,255,0.06)" }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="px-8 py-4 border border-white/20 text-white font-medium rounded-xl inline-flex items-center gap-2"
              >
                عرض المزايا
                <ArrowLeft className="w-4 h-4" />
              </motion.a>
            </div>

            <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-2 gap-6 max-w-md">
              <div>
                <div
                  className="text-3xl text-[#C5A059] font-bold"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  +2.5K
                </div>
                <div className="text-xs text-white/60 mt-1">وحدة مُدارة</div>
              </div>
              <div>
                <div
                  className="text-3xl text-[#C5A059] font-bold"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  ZATCA
                </div>
                <div className="text-xs text-white/60 mt-1">متوافق مع المرحلة الثانية</div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature grid (left in RTL) */}
        <div id="features" className="lg:col-span-7 bg-white p-10 lg:p-16 flex items-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
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
                  className="group p-8 rounded-3xl border border-stone-100 bg-stone-50/50 hover:bg-white hover:border-[#C5A059]/30 cursor-pointer"
                >
                  <motion.div
                    whileHover={{ rotate: -6, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    className="w-12 h-12 bg-[#043927] rounded-xl flex items-center justify-center mb-6"
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
    </section>
  );
}
