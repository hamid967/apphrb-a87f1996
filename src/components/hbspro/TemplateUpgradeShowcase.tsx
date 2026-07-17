import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Gauge,
  LayoutDashboard,
  MonitorSmartphone,
  Palette,
  Sparkles,
  Wand2,
} from "lucide-react";
import { openDemoModal } from "./sections";

const designPillars = [
  {
    icon: Palette,
    title: "هوية بصرية فاخرة",
    text: "كحلي عميق، تركوازي ذكي، وذهبي هادئ مع خطوط عربية واضحة ومساحات تنفس واسعة.",
  },
  {
    icon: LayoutDashboard,
    title: "لوحات قيادة حقيقية",
    text: "واجهة تعرض المال، العقود، الصيانة، والتنبيهات كمنظومة قرار واحدة لا كصفحات متفرقة.",
  },
  {
    icon: MonitorSmartphone,
    title: "تجربة جوال أولاً",
    text: "كل البطاقات والنماذج والقوائم مصممة لتعمل بسلاسة على الجوال قبل سطح المكتب.",
  },
];

const roadmap = [
  "إعادة بناء الهيرو حول الانترو ومركز القيادة",
  "اختصار صفحات العملاء إلى المسارات المفيدة فقط",
  "تنظيف لوحة الأدمن وإخفاء التشخيص عن الاستخدام اليومي",
  "إظهار خدمات المنصة كرحلة: عقار، عقد، تحصيل، صيانة، تقرير",
  "توحيد الأزرار، البطاقات، الجداول، الحالات الفارغة، والتنبيهات",
];

const modules = [
  { label: "العقارات", value: "أصول ووحدات", icon: Building2 },
  { label: "المالية", value: "تحصيل ومصاريف", icon: Gauge },
  { label: "التقارير", value: "PDF وهوية", icon: BadgeCheck },
];

export function TemplateUpgradeShowcase() {
  return (
    <section
      id="template-upgrade"
      dir="rtl"
      className="relative isolate overflow-hidden bg-[#071729] px-4 py-24 text-white sm:px-6 lg:px-10"
      aria-labelledby="template-upgrade-title"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(0,217,192,0.18),transparent_34%),radial-gradient(circle_at_18%_78%,rgba(201,169,97,0.14),transparent_36%)]" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00D9C0]/25 bg-[#00D9C0]/10 px-4 py-2 text-sm font-black text-[#00D9C0]">
            <Sparkles className="size-4" />
            قالب HBSpro المطور
          </div>
          <h2 id="template-upgrade-title" className="text-balance text-4xl font-black leading-tight sm:text-6xl">
            واجهة عالمية تشبه منتج SaaS فاخر، لا مجرد صفحة تعريفية.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-300">
            بعد الانترو، يدخل الزائر مباشرة إلى قصة المنتج: كيف تتحول الأملاك والعقود والتحصيل والصيانة إلى مركز قيادة واضح وسهل الاستخدام.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openDemoModal}
              className="inline-flex items-center justify-center rounded-2xl bg-[#00D9C0] px-6 py-3 text-sm font-black text-[#071729] shadow-[0_18px_52px_-24px_rgba(0,217,192,0.9)] transition hover:-translate-y-0.5"
            >
              احجز عرضاً للتصميم
            </button>
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-bold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.1]"
            >
              ابدأ التجربة
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.65, ease: "easeOut", delay: 0.1 }}
          className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-4 shadow-[0_34px_130px_-72px_rgba(0,217,192,0.85)] backdrop-blur-2xl sm:p-6"
        >
          <div className="rounded-[1.5rem] border border-white/10 bg-[#0A1A2F]/80 p-5">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[#C9A961]">Design Command</p>
                <h3 className="mt-2 text-2xl font-black">خطة تطوير القالب</h3>
              </div>
              <div className="grid size-12 place-items-center rounded-2xl bg-[#00D9C0]/15 text-[#00D9C0]">
                <Wand2 className="size-6" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {modules.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <Icon className="mb-4 size-5 text-[#00D9C0]" />
                    <div className="text-lg font-black">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.value}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3">
              {roadmap.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#00D9C0]/15 text-xs font-black text-[#00D9C0]">
                    {index + 1}
                  </span>
                  <span className="text-sm font-bold text-slate-100">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="relative mx-auto mt-12 grid max-w-7xl gap-4 md:grid-cols-3">
        {designPillars.map((pillar, index) => {
          const Icon = pillar.icon;
          return (
            <motion.article
              key={pillar.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 0.55, ease: "easeOut", delay: index * 0.08 }}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl"
            >
              <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#C9A961]/15 text-[#C9A961]">
                <Icon className="size-6" />
              </div>
              <h3 className="text-xl font-black">{pillar.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{pillar.text}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
