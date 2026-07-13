## نطاق العمل

إعادة تصميم واجهة لوحة المستخدم المسجّل بالكامل (Home + Shell) بأسلوب SaaS فاخر (Linear/Stripe/Vercel/Notion) — **بدون أي مساس بالـ backend أو الـ routing أو الأعمال أو الصلاحيات**. تعديلات presentational فقط.

الملفات الحالية المستهدفة:
- `src/routes/_authenticated.tsx` — Shell (Sidebar + Topbar + Outlet)
- `src/routes/_authenticated/dashboard.index.tsx` — الصفحة الرئيسية
- `src/components/dashboard/DashboardSidebar.tsx`
- `src/components/dashboard/DashboardTopbar.tsx`
- `src/components/dashboard/DashboardHero.tsx`
- `src/components/dashboard/KpiGrid.tsx`
- `src/components/dashboard/ServicesGrid.tsx`
- `src/components/dashboard/AnalyticsPanels.tsx`
- `src/components/dashboard/AIRecommendations.tsx`
- `src/components/dashboard/SaudiMap.tsx` (إطار فقط)
- ملفات جديدة صغيرة عند الحاجة تحت `src/components/dashboard/v2/`

---

## القيود المُلزمة (لن أكسرها)

- لا تعديل على أي server function، migration، RLS، ملف تحت `src/integrations/`، أو منطق الجلب (React Query hooks).
- لا تغيير مسارات (`createFileRoute`)، ولا loaders، ولا guards، ولا `_authenticated/route.tsx` (integration-managed).
- الحفاظ على كل الترجمات الحالية (`t(...)`) — أضيف مفاتيح جديدة فقط ولا أحذف.
- الحفاظ على مبدّل ثيم لوحة التحكم الحالي (Emerald Prestige ↔ Luxe) — التصميم الجديد يعيش داخل `theme-tech` كطبقة presentational.
- ما زال المكدّس **TanStack Start** (ليس Next.js 15)؛ الاستفادة من `@tanstack/react-router` كما هي.

---

## نظام التصميم (Design tokens جديدة)

يضاف داخل `src/styles.css` بلوك `.theme-tech` **بدون لمس الثيمات الأخرى**:

```
--background: #F7F9FB          Light premium canvas
--card: #FFFFFF                خالٍ من التدرجات الثقيلة
--border: #E7ECF2              hairline
--foreground: #0F172A
--muted-foreground: #64748B
--primary: #0F5132             HRHBS deep emerald
--secondary: #10B981
--accent: #34D399
--success: #16A34A / --warning: #F59E0B / --destructive: #EF4444
--radius: 22px                 (rounded-2xl الافتراضي)
--shadow-elegant: 0 10px 40px -18px rgba(15,81,50,.18)
--gradient-primary: linear-gradient(135deg, #0F5132 0%, #10B981 55%, #34D399 100%)
--gradient-canvas: radial-gradient(1200px 600px at 100% -10%, rgba(16,185,129,.06), transparent 60%)
```

الخط: **IBM Plex Sans Arabic** يُحمَّل عبر `<link>` في `__root.tsx` head (Tailwind v4 لا يقبل `@import` remote داخل styles.css).

Utilities جديدة عبر `@utility`:
- `glass-card` — سطح أبيض مع border hairline و shadow ناعم و backdrop-blur خفيف
- `kpi-tile` — بطاقة KPI مضغوطة بارتفاع موحّد
- `hover-lift` — رفع + shadow deepen بحركة 200ms
- `sparkline-fade` — mask gradient للطرفين

---

## البنية الجديدة (Shell)

```
┌─────────────────────────────────────────────────────┐
│  Topbar 72px (glass, sticky)                        │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │  Content max-w-[1700px]                  │
│ 288px    │  padding 32px, gap 24px                  │
│ (72px    │                                          │
│  when    │  ┌──────────────────────────────────┐    │
│  mini)   │  │ Welcome + right-side date/time  │    │
│          │  ├──────────────────────────────────┤    │
│          │  │ Quick Actions row (6 tiles)      │    │
│          │  ├──────────────────────────────────┤    │
│          │  │ KPI grid (4 cols → 2 → 1)        │    │
│          │  ├──────────────────────────────────┤    │
│          │  │ Services launcher (search+pin)   │    │
│          │  ├──────────────────┬───────────────┤    │
│          │  │ Charts (2/3)     │ AI Assistant  │    │
│          │  ├──────────────────┴───────────────┤    │
│          │  │ Map (full width)                 │    │
│          │  ├──────────────────┬───────────────┤    │
│          │  │ Activity timeline│ Tasks kanban  │    │
│          │  └──────────────────┴───────────────┘    │
└──────────┴──────────────────────────────────────────┘
```

---

## التعديلات لكل ملف

### 1. `src/routes/__root.tsx`
- إضافة `<link>` لـ IBM Plex Sans Arabic (400/500/600/700).

### 2. `src/styles.css`
- كتلة جديدة داخل `.theme-tech` بالتوكنز أعلاه.
- `@utility glass-card`, `hover-lift`, `kpi-tile`, `sparkline-fade`.
- ضبط `--radius` إلى 22px فقط داخل theme-tech.

### 3. `DashboardSidebar.tsx` — إعادة كتابة presentational
- عرض 288px موسّع / 72px مصغّر مع toggle، مؤشر نشط عائم (`motion.div layoutId`)، أيقونات Lucide موحّدة.
- المجموعات كما هي في الكود الحالي (Dashboard/Services/Employees/Companies/Licenses/Government/Contracts/Invoices/Payments/Reports/Analytics/AI/Documents/Settings/Support/Logout) — روابط `Link` كما هي.
- Hover: خلفية `bg-primary/6` + انزلاق الأيقونة بـ 2px.

### 4. `DashboardTopbar.tsx` — إعادة كتابة
- Sticky glass header بارتفاع 72px.
- ترتيب RTL: Logo (يمين) — Search 480px — AI button — Notifications — Messages — Language — Avatar — **زر Quick Create** بارز (gradient-primary).
- Global `⌘K` / `Ctrl+K` يفتح `Command` من shadcn (نتائج فورية من عناصر التنقّل الحالية، لا استعلامات جديدة).

### 5. `DashboardHero.tsx`
- عنوان كبير `text-4xl font-bold`: «مرحباً {الاسم} 👋».
- سطر ثانوي muted.
- على اليسار: التاريخ الميلادي/الهجري + الوقت الحيّ (setInterval) + placeholder طقس (بدون طلبات شبكة الآن — أيقونة + «الرياض 32°»؛ نصّي فقط).

### 6. Quick Actions (جديد `QuickActionsRow.tsx`)
- 6 بطاقات أفقية قابلة للتمرير على الموبايل: طلب جديد / إضافة عميل / إضافة شركة / إصدار رخصة / رفع مستند / دفع فاتورة.
- كل بطاقة: أيقونة كبيرة داخل دائرة gradient + عنوان + وصف قصير + hover-lift.
- الأزرار تستخدم نفس روابط navigation الحالية.

### 7. `KpiGrid.tsx`
- بطاقات بيضاء rounded-2xl، رقم بحجم `text-3xl font-semibold` مع عدّاد framer-motion (0→value)، نسبة تغير ملوّنة، sparkline صغير (recharts موجود مسبقاً — لا مكتبات جديدة).
- شبكة 4/2/1.

### 8. `ServicesGrid.tsx`
- Command-style launcher: بحث علوي، تبويبات (المثبّتة / الأخيرة / الكل)، شبكة 4 أعمدة، بطاقات مربّعة بأيقونة كبيرة ووصف سطر، Star icon للتثبيت (يُخزَّن في localStorage فقط — لا تعديل backend).

### 9. `AnalyticsPanels.tsx`
- إعادة تنسيق بصري باستخدام recharts الموجود (Area/Bar/Radial). تأطير كل شارت داخل `glass-card` بارتفاع 340px.
- **لن أضيف Tremor** لتجنّب تبعية جديدة كبيرة؛ سأحاكي مظهر Tremor عبر tokens.

### 10. `AIRecommendations.tsx` → AI Widget
- بطاقة عمودية: header (Sparkles + «مساعدك الذكي»)، shortcut للدردشة، 3 اقتراحات اليوم، قائمة توصيات مع chevron.
- الروابط والبيانات كما هي.

### 11. SaudiMap — إطار فقط
- تغليف بحاوية `glass-card` جديدة + header + شرح؛ لا لمس لمنطق الخريطة.

### 12. Activity + Tasks + Notifications
- Activity: timeline عمودي بخطّ نقطي، شارات ملوّنة حسب النوع، أوقات نسبية (`date-fns` موجود).
- Tasks: 3 أعمدة (اليوم/قادم/مكتمل) بأسلوب mini-kanban بصريّاً فقط، بيانات كما هي.
- Notifications drawer: يعاد تنسيق داخلي فقط.

### 13. `dashboard.index.tsx`
- إعادة ترتيب المكوّنات وفق المخطط أعلاه؛ لا تغيير في hooks أو استعلامات.

---

## Animations

Framer-motion (موجود):
- Section fade+slide-up on mount (stagger 60ms).
- Hover lift على البطاقات (`whileHover={{ y: -3 }}`).
- Sidebar active pill عبر `layoutId`.
- Number counters في KPIs.
- Route transitions خفيفة في Outlet wrapper.

يُحترم `prefers-reduced-motion`.

---

## Responsive

- ≥1280px: shell كامل.
- 1024–1279: sidebar mini افتراضياً، content 2 cols.
- 768–1023: sidebar drawer (Sheet)، KPI 2 cols.
- <768: Topbar مضغوط + `MobileDashboardTabbar` الحالي (يبقى)، بطاقات عمود واحد، Quick Actions تمرير أفقي.

---

## A11y

- كل زر icon-only يأخذ `aria-label` مترجم.
- Landmark واحد `<main>` في Shell.
- تباين ≥ WCAG AA (النصوص `--foreground #0F172A` على `--background #F7F9FB` = 15.4:1؛ primary على أبيض = 9.1:1).
- Focus rings واضحة (`ring-2 ring-primary/40`).
- `⌘K` مع `role="dialog"` (Command من shadcn — جاهز).

---

## ما لن يتم في هذه الجولة

- لا Tremor (تبعية ثقيلة؛ recharts يكفي).
- لا Weather API حقيقي (placeholder نصّي فقط لتجنّب backend).
- لا إعادة كتابة صفحات الأدمن الداخلية — الشِلّ الجديد يغلّفها كلها تلقائياً.
- لا تغيير مسارات أو أسماء ملفات routes.

---

## خطة التنفيذ (3 دفعات)

1. **Tokens + Shell**: `styles.css`، `__root.tsx` (link الخط)، `DashboardSidebar`، `DashboardTopbar` + Command palette.
2. **Home widgets**: `DashboardHero`، `QuickActionsRow` (جديد)، `KpiGrid`، `ServicesGrid`، `AIRecommendations`.
3. **Data surfaces**: `AnalyticsPanels`، `SaudiMap` wrapper، Activity/Tasks presentational tweaks، ترتيب `dashboard.index.tsx`.

بعد كل دفعة أتحقّق من الـ build وألتقط لقطات موبايل/ديسكتوب.

هل أبدأ بالدفعة الأولى؟
