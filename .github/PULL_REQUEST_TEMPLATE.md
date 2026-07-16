<!--
قالب وصف الـ PR القياسي لـ HBSpro.
املأ كل قسم — اترك السطر فارغاً بدل حذفه إن كان غير منطبق واكتب "لا ينطبق".
المراجع سيستخدم `pr-risk-audit` قبل الدمج؛ الوصف الجيد يقصّر وقت المراجعة كثيراً.
-->

## 🎯 النطاق (Scope)

**ماذا يفعل هذا الـ PR في جملة واحدة؟**
<!-- مثال: يضيف توليد فواتير PDF متوافقة مع ZATCA Phase-2 لوحدة المالية. -->

**Issue / Spec المرتبط:** <!-- #NNN أو رابط spec -->

**نوع التغيير:** <!-- feature / fix / refactor / migration / docs / chore -->

---

## 📦 التغييرات (Changes)

<!-- نقاط مختصرة، مجموعة حسب المجال. لا تنسخ diff. -->

**قاعدة البيانات:**
- <!-- جداول/دوال/سياسات جديدة، أو "لا تغييرات على DB" -->

**الواجهة / المسارات:**
- <!-- مسارات TanStack جديدة، مكوّنات رئيسية -->

**Server Functions / API:**
- <!-- createServerFn جديدة، endpoints عامة -->

**Infra / CI:**
- <!-- workflows، secrets مطلوبة، تبعيات جديدة -->

---

## ⚠️ المخاطر (Risk Assessment)

| البُعد | التقييم | ملاحظة |
|---|---|---|
| كسر توافق | منخفض / متوسط / عالٍ | |
| أمان / RLS | لا يمس / يعدّل / جديد | |
| بيانات موجودة | لا يلمس / migration آمن / يتطلّب backup | |
| super_admin access | محفوظ / مُختبر | |
| Multi-tenant isolation (`company_id`) | محفوظ / مُختبر | |
| أداء | لا تأثير / تحسين / يتطلّب فهرس | |

**نقاط التراجع (Rollback plan):**
<!-- كيف نرجع لو انفجر شيء في الإنتاج؟ هجرة عكسية؟ feature flag؟ -->

---

## 🧪 الاختبار (Testing)

**اختُبر يدوياً على:**
- [ ] بيئة Lovable Preview
- [ ] Chromium desktop
- [ ] موبايل (RTL عربي)
- [ ] حساب super_admin
- [ ] حساب مستخدم عادي في org

**CI checks متوقّع نجاحها:**
- [ ] typecheck
- [ ] lint
- [ ] i18n-audit
- [ ] radix-ssr-guard
- [ ] admin-routes-signed-in
- [ ] admin-e2e
- [ ] E2E (WebView-simulated redirects)
- [ ] verify-core-system

**إن كان أي check أحمر — اشرح السبب هنا:**
<!-- مثال: admin-routes-signed-in فاشل مسبقاً على hrbapp بسبب أسرار مفقودة — ليس من صنع هذا الـ PR. -->

---

## 🗄️ Migrations Checklist

<!-- احذف القسم كاملاً لو لا توجد هجرة SQL. -->

- [ ] كل `CREATE TABLE public.*` متبوعة بـ `GRANT` قبل `ENABLE RLS` وقبل `CREATE POLICY`
- [ ] `GRANT ALL ... TO service_role` لكل جدول جديد
- [ ] كل الـ policies تحترم `super_admin` (مباشرة أو عبر helper موحّد)
- [ ] لا FKs إلى `auth.users` — استخدم `profiles`
- [ ] كل دالة `SECURITY DEFINER` تضبط `SET search_path = public` وتفحص الصلاحيات
- [ ] لا `CHECK` constraints تستخدم `now()` أو دوال volatile (استخدم trigger)
- [ ] كل دالة يُشار إليها في policy موجودة فعلاً في DB
- [ ] الاستعلامات الشائعة مدعومة بفهارس مناسبة

---

## 🔐 Security Checklist

- [ ] لا أسرار في الكود (`process.env` تُقرأ داخل handlers فقط)
- [ ] `createServerFn` غير العامة تستخدم `.middleware([requireSupabaseAuth])`
- [ ] `supabaseAdmin` مستورد فقط عبر `await import(...)` داخل الـ handler، وبعد فحص صلاحية المستدعي
- [ ] endpoints تحت `/api/public/*` تتحقّق من HMAC / signature / secret
- [ ] لا PII في logs أو responses عامة
- [ ] Zod validation على كل input خارجي

---

## 🌐 i18n & Accessibility

- [ ] كل نص UI مُمرَّر عبر `t()` مع مفاتيح AR + EN
- [ ] `bun run audit:i18n` أخضر
- [ ] RTL يعمل (اختُبر بصرياً)
- [ ] Semantic tokens فقط — لا ألوان hard-coded (`text-white`, `#hex`)

---

## 📸 لقطات / فيديو

<!-- إن كان تغييراً بصرياً، أرفق قبل/بعد. للـ backend، أرفق نتيجة استعلام أو curl. -->

---

## 📝 ملاحظات للمراجع

<!-- ما الذي يجب أن يفحصه المراجع بعناية أكبر؟ ما الافتراضات التي بنيتها؟ -->

---

## ✅ قبل طلب المراجعة

- [ ] الفرع rebased على `hrbapp` (أو الـ base الصحيح) — ليس diverged
- [ ] لا تعارضات
- [ ] العنوان يصف التغيير (ليس "wip" أو "updates")
- [ ] الـ commits مرتّبة ومنطقية (أو `Squash on merge` مفعّل)
