# خطة الإصلاح والتطوير — بعد جولة كاملة داخل التطبيق

جولة آلية على 38 صفحة (تسويقية + لوحة تحكم + بوابات + إدارة + onboarding) بحساب super-admin على `id-preview…lovable.app` كشفت 4 مشاكل متكررة عالية الأولوية، وعدة تحسينات ذات أثر مباشر. لا صفحة أعادت 404، لكن 20 صفحة من 38 سجّلت أخطاء console.

---

## 1) إصلاحات عاجلة (Blockers)

### أ. مفاتيح مكررة داخل قائمة/شريط مشترك (يظهر في كل `/admin/*` و`/onboarding/wizard`)
- الخطأ: `Encountered two children with the same key` مرتين في كل صفحة إدارة.
- الأثر: React يُسقط عناصر أو يعيد تركيبها بلا داعٍ ⇒ اهتزاز في القوائم.
- الإصلاح: تتبّع المصدر داخل `AdminSidebar` / `AdminBreadcrumbs` / `command-palette` — الأرجح أن مصفوفة روابط تكرّر نفس المفتاح. إضافة اختبار Vitest يفرض تفرّد المفاتيح لكل مصفوفة تنقل.

### ب. `TypeError: Failed to fetch` من `supabase/client.ts:17`
- ظاهر على: `/about`, `/dashboard/maintenance`, `/dashboard/expenses`, `/onboarding/wizard`.
- السبب المرجّح: استدعاء `supabase.auth.getSession()` أو query داخل SSR/hook قبل الترطيب على صفحات لا تحتاجه.
- الإصلاح: تأخير أي استعلام Supabase حتى `useEffect` أو حصر الاستدعاء بالمسارات المحمية فقط، وتغليف الفشل بـ`try/catch` صامت في hook الترطيب لتجنّب تلطيخ console للزوار المجهولين.

### ج. Hydration mismatches على كل الصفحات التسويقية
- ظاهر على: `/`, `/about`, `/services`, `/pricing`, `/solutions/*`, `/compare`, `/docs/api`.
- السبب المرجّح: قراءة `localStorage` (theme, locale, dir) داخل `useState` initializer، أو تنسيق تواريخ بلغة المتصفح.
- الإصلاح: قراءة كل مصادر تخزين المتصفح داخل `useEffect` أو خلف `useHydrated()` حسب قاعدة `tanstack-execution-model`، وتوحيد تنسيق التاريخ خادميًا بـ`Intl` ثابت اللغة.

### د. `Encountered two children with the same key` + `Failed to fetch` على `/onboarding/wizard`
- ينتج تجربة onboarding مهتزّة لأول مستخدم. أولوية عالية.
- بعد إصلاح (أ) و(ب) يُعاد فحص المسار.

---

## 2) تحسينات جودة قصيرة الأمد

- **/auth بطيء الترطيب** (تجاوز 4s قبل networkidle): مراجعة استيرادات ثقيلة (recharts, r3f, tiptap) وعزلها بـ`lazyRouteComponent` — المسار عام ولا يحتاج مكتبات الداشبورد.
- **/docs/api** يُعيد التوجيه إلى hash تلقائيًا؛ تأكّد أن ذلك مقصود (rapidoc/redoc) وأنه لا يُفشل SEO للصفحة الأصلية.
- **اختبار key uniqueness**: Vitest يمر على كل ملف يحتوي `.map(...=>` داخل `src/components/{admin,portal,dashboard}` ويتحقق من وجود `key=` صريح فريد.
- **CI**: إضافة `admin-perf.spec.py` و`admin-route-map.spec.py` (الجديدَين) إلى workflow `admin-routes-signed-in.yml` بحيث ينبّهان على الانحدار.

## 3) تنظيف المسارات (استكمال `docs/audit/routes-audit-2026-07.md`)

القرار مؤجَّل بموافقتك، والاقتراح جاهز:

- دمج `contracts.$id`, `properties.*`, `maintenance.*` تحت `/dashboard/*` مع 301 redirects.
- توحيد `owner.portal.*` و`tenant.portal.*` تحت `/portal/*` (يوفّر 6 ملفات).
- حذف `admin.systest` و`dashboard.expenses.claim.correct.preview` (اختبار داخلي + معاينة زائدة).
- إخفاء `admin.seed` خلف feature flag لأنه خطر في الإنتاج.

## 4) تطوير قصير الأمد (من `.lovable/plan.md`)

- **الدفعة القادمة (UI موحّد)**: `PageHeader` + Empty States + Skeletons عبر جميع صفحات `_authenticated/*`.
- **الأداء**: fine-tune `staleTime`/`gcTime` للاستعلامات المتكررة (companies, profile, roles) + preload لصورة hero الرئيسية.
- **a11y**: `aria-label` لكل زر أيقوني، `<main>` واحد لكل صفحة، `h-dvh` بدل `h-screen`، تباين WCAG AA.
- **i18n**: إكمال ترجمة `dashboard.auctions.*` و`dashboard.audit.*` (CSV/PDF/Excel/Not found) وتشغيل `bun run audit:i18n` في CI.

## 5) خطة التنفيذ (بالترتيب)

1. إصلاح المفاتيح المكررة + hydration + supabase fetch (البنود 1أ–1د). PR واحد قابل للمراجعة.
2. اختبار Vitest لتفرّد مفاتيح القوائم + دمج `admin-perf` و`admin-route-map` في CI.
3. جلسة تنظيف المسارات (بعد موافقتك على الجدول).
4. الدفعة 1 من UI الموحّد (PageHeader/EmptyStates/Skeletons).
5. جولة أداء (bundle audit + lazy routes + query cache).

بعد كل خطوة: `tsgo --noEmit` + إعادة تشغيل الجولة الآلية للتأكد من صفر console errors على الصفحات المُصلَحة.

## تفاصيل تقنية

- كل الإصلاحات في code التقديم/العرض؛ لا تعديل على schema أو RLS أو منطق أعمال.
- لا تعديل على `src/routeTree.gen.ts` أو `src/integrations/supabase/*` المولّدة.
- الحفاظ على theme `.theme-tech` للداشبورد و`.theme-luxe` للتسويق.
- كل PR يبقى بحجم قابل للمراجعة (< 400 سطر تقريبًا).
- سكربت الجولة محفوظ في `/tmp/browser/appwalk/walk.py` لإعادة الاستخدام بعد كل دفعة.
