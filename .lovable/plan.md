## نطاق التطوير: تحسينات UI/UX + الأداء

الهوية البصرية ثابتة (بنفسجي HRHBS + Almarai) — العمل تحسين الجودة والسرعة داخل نفس النظام، لا إعادة تصميم.

## 1) تحسينات UI/UX

**أ. الصفحة الرئيسية (Landing)**
- تنقيح الـ Hero: إيقاع طباعي أوضح، فراغ أكبر، CTA بارز واحد، شارة الثقة تحت الفولد.
- توحيد البطاقات (مزايا/باقات/شهادات) على نظام spacing واحد + ظل موحّد (`--shadow-elegant`).
- تأثيرات دخول خفيفة عبر `animate-fade-in` + `hover-scale` بدلاً من الحركات الثقيلة.

**ب. لوحات التحكم (Dashboard / Portal)**
- توحيد `PageHeader` (عنوان + وصف + أزرار) عبر جميع صفحات `_authenticated/*`.
- بطاقات KPI بمقاسات وأيقونات موحّدة، أرقام بخط tabular، حالات فارغة (Empty States) مصممة.
- جداول: sticky header، truncate آمن للـ RTL، badges موحّدة للحالات (نشط/معلّق/مرفوض).
- Skeletons بدل spinners في القوائم الطويلة.

**ج. Sidebar & Navigation**
- تفعيل حالة `active` واضحة (pill بنفسجي فاتح)، حالة مطوية بأيقونات فقط.
- Breadcrumbs في رأس الصفحات الفرعية.

**د. الوصولية (a11y)**
- `aria-label` لكل زر أيقوني، `<main>` واحد لكل صفحة، `h-dvh` بدل `h-screen`.
- تباين ألوان مطابق لـ WCAG AA على النصوص الثانوية.

**هـ. RTL & i18n**
- مراجعة flex/gap/space-x على المسارات المتأثرة، ترجمة نصوص `dashboard.auctions.*` و`dashboard.audit.*` المتبقية (CSV/PDF/Excel/Not found).

## 2) تحسينات الأداء

- **Route-level code splitting**: التأكد أن كل route ثقيل (assistant, admin, auctions) يستخدم lazy component عبر `createFileRoute` + `component: lazyRouteComponent(...)` حيث يلزم.
- **TanStack Query**: مراجعة `staleTime` و `gcTime` للاستعلامات المتكررة (companies, profile, roles) لتقليل requests.
- **Images**: `loading="lazy"` + `decoding="async"` على كل img غير LCP، preload لصورة hero.
- **Bundle audit**: تشغيل `bun run build` وقياس أكبر chunks؛ فصل مكتبات ثقيلة (recharts, r3f) عبر dynamic import.
- **Fonts**: التأكد من تحميل Almarai بـ `font-display: swap` وpreload للـ weights المستخدمة فقط.
- **Realtime/subscriptions**: مراجعة أن كل `.channel()` يُنظَّف في cleanup لتفادي تسريبات ذاكرة.

## 3) خطة التنفيذ (على دفعات)

1. **دفعة 1 — أساسيات مشتركة**: `PageHeader`, Empty States, Skeletons, tokens (`--shadow-elegant`, animations).
2. **دفعة 2 — Dashboard/Admin**: تطبيق المكونات الجديدة على أهم 6-8 صفحات.
3. **دفعة 3 — a11y + i18n**: aria-labels، ترجمة النصوص المتبقية.
4. **دفعة 4 — الأداء**: lazy routes, query cache tuning, image lazy, bundle audit + تقرير.
5. **دفعة 5 — Landing polish**: تنقيح الهيرو والأقسام التسويقية.

بعد كل دفعة: `tsgo --noEmit` + جولة بصرية سريعة.

## تفاصيل تقنية

- لا تعديل على `src/routeTree.gen.ts` (auto-generated).
- الحفاظ على `mem://` (بنفسجي #7C3AED، Almarai، semantic tokens فقط).
- لا تغيير في منطق الأعمال أو RLS أو المخطط — تحسينات عرض + أداء فقط.
- كل دفعة PR-sized: تعديلات مركّزة قابلة للمراجعة.
