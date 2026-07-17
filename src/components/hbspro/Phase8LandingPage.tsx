import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Check,
  CreditCard,
  FileText,
  HelpCircle,
  Home,
  Layers3,
  Mail,
  MessageCircle,
  ReceiptText,
  Sparkles,
  Store,
  UserRound,
  WalletCards,
  Wrench,
} from "lucide-react";

const trustItems = [
  { icon: UserRound, label: "للأفراد والمنشآت" },
  { icon: Home, label: "عقارات سكنية" },
  { icon: Store, label: "عقارات تجارية" },
  { icon: WalletCards, label: "مصاريف شخصية" },
  { icon: ReceiptText, label: "تقارير PDF" },
];

const features = [
  { icon: Building2, title: "إدارة العقارات والوحدات", text: "ملفات واضحة لكل عقار ووحدة مع حالة الإشغال والتنبيهات والوثائق." },
  { icon: CreditCard, title: "العقود والتحصيل بالسندات", text: "دفعات، متأخرات، سداد جزئي، وسندات مرقمة لكل حساب." },
  { icon: Wrench, title: "الصيانة والموردون", text: "طلبات صيانة، صور قبل/بعد، موردون، وجدولة وقائية." },
  { icon: WalletCards, title: "المصاريف العقارية والشخصية", text: "تصنيف مصاريفك وربطها بالعقار أو الميزانية الشخصية." },
  { icon: FileText, title: "تقارير PDF بهويتك", text: "قوالب تحمل شعارك وبياناتك الضريبية ومخرجات جاهزة للمشاركة." },
  { icon: BarChart3, title: "لوحة تحكم ذكية", text: "صافي الدخل، الإشغال، المتأخرات، والصيانة في واجهة واحدة." },
];

const steps = [
  { title: "سجّل", text: "اختر حساب فرد أو منشأة وأضف بياناتك الأساسية." },
  { title: "أدخل عقارك", text: "أضف العقارات والوحدات والمستأجرين والعقود." },
  { title: "صدّر تقريرك الأول", text: "اختر قالب PDF وشارك التقرير مع شعارك وبياناتك." },
];

const templates = [
  { name: "الرسمي", tone: "كحلي وجداول واضحة", color: "from-[#0A1A2F] to-[#163456]" },
  { name: "العصري", tone: "تركوازي وبطاقات ملخصة", color: "from-[#00D9C0] to-[#0A8F84]" },
  { name: "الفاخر", tone: "كحلي وذهبي للملاك", color: "from-[#0A1A2F] to-[#C9A961]" },
  { name: "المبسّط", tone: "أبيض وأسود للطباعة", color: "from-[#f8fafc] to-[#cbd5e1]" },
];

const plans = [
  {
    name: "مجاني",
    price: "0",
    period: "ر.س",
    desc: "للتجربة وبداية تنظيم أول عقار.",
    limits: ["عقار واحد", "5 وحدات", "مستخدم واحد", "قالب PDF واحد", "10 ملفات تصدير شهرياً"],
  },
  {
    name: "برو للأفراد",
    price: "49",
    period: "ر.س/شهر",
    yearly: "490 ر.س/سنة",
    badge: "الأكثر اختياراً",
    desc: "للملاك الأفراد وإدارة أكثر من عقار بسهولة.",
    limits: ["10 عقارات", "وحدات غير محدودة", "القوالب الأربعة", "تصدير غير محدود", "الميزانيات والمتكررة"],
  },
  {
    name: "منشآت",
    price: "149",
    period: "ر.س/شهر",
    yearly: "1,490 ر.س/سنة",
    desc: "للشركات والفرق التي تحتاج أدوار وصلاحيات.",
    limits: ["عقارات غير محدودة", "10 مستخدمين بالأدوار", "الملخص الضريبي", "أولوية دعم", "إدارة محفظة متقدمة"],
  },
];

const faqs = [
  {
    q: "هل بياناتي معزولة؟",
    a: "نعم. صممت المنصة بعزل بيانات الحسابات، وكل حساب يرى بياناته فقط حسب الصلاحيات والأدوار.",
  },
  {
    q: "هل الفواتير معتمدة لدى ZATCA؟",
    a: "مستندات HBSpro إدارية ومحاسبية مساعدة، وتدعم حقول الفاتورة المبسطة وQR عند توفر البيانات. لكنها ليست بديلاً عن مزود فوترة إلكترونية معتمد لدى ZATCA.",
  },
  {
    q: "هل يدعم أكثر من مستخدم؟",
    a: "نعم في باقة المنشآت، مع أدوار مثل المالك، المحاسب، مدير المالية، مشرف الصيانة، والمشاهد.",
  },
  {
    q: "هل يمكن إلغاء الاشتراك؟",
    a: "نعم. يمكن إيقاف التفعيل اليدوي أو الرجوع للباقة المجانية مع بقاء البيانات محفوظة وفق السياسات.",
  },
  {
    q: "ما نوع الدعم؟",
    a: "تتوفر قنوات تواصل للدعم، وباقة المنشآت تحصل على أولوية في المتابعة والتفعيل.",
  },
  {
    q: "هل يمكن تصدير التقارير؟",
    a: "نعم. التصدير متاح حسب حدود الباقة، وتشمل الباقات المدفوعة قوالب PDF متعددة وتصديراً أوسع.",
  },
];

export function Phase8LandingPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#071729] text-white">
      <Hero />
      <TrustBar />
      <Features />
      <HowItWorks />
      <PdfTemplates />
      <Pricing />
      <FAQ />
      <LandingFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_16%,rgba(0,217,192,0.20),transparent_34%),radial-gradient(circle_at_18%_82%,rgba(201,169,97,0.16),transparent_38%),linear-gradient(135deg,#071729_0%,#0A1A2F_55%,#03101f_100%)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00D9C0]/25 bg-[#00D9C0]/10 px-4 py-2 text-sm font-black text-[#00D9C0]">
            <Sparkles className="size-4" />
            HBSpro لإدارة الأملاك
          </div>
          <h1 className="text-balance text-5xl font-black leading-tight sm:text-7xl">
            أملاكك ومصاريفك وصيانتك — في منصة واحدة
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-9 text-slate-300">
            منصة سعودية عربية لإدارة العقارات والوحدات والعقود والتحصيل والمصاريف والصيانة.
            صدّر تقارير PDF احترافية تحمل شعارك وبياناتك الضريبية دون إدخال مزدوج.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth" search={{ mode: "signup" } as never} className="rounded-2xl bg-[#00D9C0] px-7 py-4 text-sm font-black text-[#071729] shadow-[0_18px_52px_-24px_rgba(0,217,192,0.9)] transition hover:-translate-y-0.5">
              ابدأ مجاناً
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-7 py-4 text-sm font-bold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.1]">
              شاهد المزايا
              <ArrowLeft className="size-4" />
            </a>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.75, delay: 0.1 }} className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-4 shadow-[0_40px_140px_-76px_rgba(0,217,192,0.95)] backdrop-blur-2xl">
          <div className="rounded-[1.5rem] bg-[#0A1A2F] p-5">
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#C9A961]">Live Dashboard</p>
                <h2 className="mt-2 text-2xl font-black">لوحة تحكم المحفظة</h2>
              </div>
              <div className="grid size-12 place-items-center rounded-2xl bg-[#00D9C0]/15 text-[#00D9C0]"><Layers3 className="size-6" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["صافي الدخل", "الإشغال", "المتأخرات"].map((label, index) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <div className="text-2xl font-black">{["84K", "96%", "12"][index]}</div>
                  <div className="mt-1 text-xs text-slate-400">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 h-48 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(0,217,192,0.16),rgba(201,169,97,0.12))] p-5">
              <div className="flex h-full items-end gap-3">
                {[38, 54, 42, 76, 64, 88, 72, 94].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-xl bg-[#00D9C0]/80" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <section className="border-y border-white/10 bg-white/[0.04] px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3">
        {trustItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-slate-200">
              <Icon className="size-4 text-[#00D9C0]" />
              {item.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 lg:px-10">
      <SectionTitle eyebrow="المزايا" title="ست وحدات أساسية تدير دورة الأملاك كاملة" />
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl">
              <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#00D9C0]/15 text-[#00D9C0]"><Icon className="size-6" /></div>
              <h3 className="text-xl font-black">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{feature.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="bg-[#0A1A2F] px-4 py-24 sm:px-6 lg:px-10">
      <SectionTitle eyebrow="كيف تعمل" title="ثلاث خطوات من التسجيل إلى أول تقرير" />
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-6">
            <div className="mb-6 grid size-12 place-items-center rounded-full bg-[#C9A961]/15 text-xl font-black text-[#C9A961]">{index + 1}</div>
            <h3 className="text-2xl font-black">{step.title}</h3>
            <p className="mt-3 leading-7 text-slate-300">{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PdfTemplates() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-10">
      <SectionTitle eyebrow="قوالب PDF" title="أربعة قوالب جاهزة لهوية مختلفة" />
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
        {templates.map((template) => (
          <div key={template.name} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.055]">
            <div className={`h-36 bg-gradient-to-br ${template.color}`} />
            <div className="p-5">
              <h3 className="text-xl font-black">{template.name}</h3>
              <p className="mt-2 text-sm text-slate-300">{template.tone}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-[#0A1A2F] px-4 py-24 sm:px-6 lg:px-10">
      <SectionTitle eyebrow="الأسعار" title="باقات واضحة وشاملة الضريبة" sub="الدفع الإلكتروني لاحقاً؛ زر الترقية يفتح تواصلاً للتفعيل اليدوي." />
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.name} className={`relative rounded-[2rem] border p-6 ${plan.badge ? "border-[#00D9C0] bg-[#00D9C0]/10" : "border-white/10 bg-white/[0.055]"}`}>
            {plan.badge && <div className="absolute -top-3 right-6 rounded-full bg-[#00D9C0] px-4 py-1 text-xs font-black text-[#071729]">{plan.badge}</div>}
            <h3 className="text-2xl font-black">{plan.name}</h3>
            <p className="mt-2 text-sm text-slate-300">{plan.desc}</p>
            <div className="mt-6 flex items-end gap-2"><span className="text-5xl font-black">{plan.price}</span><span className="pb-2 text-slate-300">{plan.period}</span></div>
            {plan.yearly && <p className="mt-1 text-sm text-[#C9A961]">{plan.yearly}</p>}
            <p className="mt-3 text-xs text-slate-400">شامل الضريبة</p>
            <ul className="mt-6 space-y-3">
              {plan.limits.map((limit) => (
                <li key={limit} className="flex items-center gap-3 text-sm text-slate-200"><Check className="size-4 text-[#00D9C0]" />{limit}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-10">
      <SectionTitle eyebrow="الأسئلة الشائعة" title="إجابات واضحة قبل الاشتراك" />
      <div className="mx-auto grid max-w-5xl gap-4">
        {faqs.map((faq) => (
          <article key={faq.q} className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-6">
            <h3 className="flex items-center gap-3 text-xl font-black"><HelpCircle className="size-5 text-[#00D9C0]" />{faq.q}</h3>
            <p className="mt-3 leading-8 text-slate-300">{faq.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#03101f] px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-black">HBSpro</div>
          <p className="mt-2 text-sm text-slate-400">منصة إدارة الأملاك والمصاريف والصيانة.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-slate-300">
          <a href="/privacy" className="hover:text-white">سياسة الخصوصية</a>
          <a href="/terms" className="hover:text-white">الشروط</a>
          <a href="mailto:app@hrhbs.com" className="inline-flex items-center gap-1 hover:text-white"><Mail className="size-4" /> app@hrhbs.com</a>
          <a href="https://wa.me/966555208213" className="inline-flex items-center gap-1 hover:text-white"><MessageCircle className="size-4" /> واتساب</a>
        </div>
      </div>
    </footer>
  );
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <p className="text-sm font-black uppercase tracking-[0.28em] text-[#00D9C0]">{eyebrow}</p>
      <h2 className="mt-4 text-balance text-4xl font-black leading-tight sm:text-5xl">{title}</h2>
      {sub && <p className="mt-4 text-slate-300">{sub}</p>}
    </div>
  );
}
