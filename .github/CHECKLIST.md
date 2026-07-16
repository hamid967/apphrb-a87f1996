# ✅ PR Review Checklist (سريع)

مطابق 1-إلى-1 لـ [`.github/PULL_REQUEST_TEMPLATE.md`](./PULL_REQUEST_TEMPLATE.md).
استخدمه كقائمة تحقّق سريعة قبل طلب المراجعة أو أثناء المراجعة — لا يغني عن ملء القالب.

---

## 🎯 النطاق
- [ ] جملة واحدة واضحة تصف ما يفعله الـ PR
- [ ] Issue / Spec مربوط
- [ ] نوع التغيير محدّد (feature / fix / refactor / migration / docs / chore)

## 📦 التغييرات
- [ ] نقاط مجمّعة (DB / UI / Server Fns / Infra) — لا نسخ diff
- [ ] لا خلط بين هجرة SQL وميزة UI غير مرتبطة في نفس الـ PR

## ⚠️ المخاطر
- [ ] جدول المخاطر مملوء (توافق / RLS / بيانات / super_admin / multi-tenant / أداء)
- [ ] خطة تراجع (rollback) مكتوبة

## 🧪 الاختبار
- [ ] اختُبر على Preview + Chromium desktop + موبايل RTL
- [ ] اختُبر بحساب super_admin وحساب عادي
- [ ] كل CI checks خضراء — أو سبب الفشل موثّق

## 🗄️ Migrations
- [ ] كل `CREATE TABLE public.*` → `GRANT` → `ENABLE RLS` → `CREATE POLICY` (بالترتيب)
- [ ] `GRANT ALL ... TO service_role` لكل جدول جديد
- [ ] كل policy تحترم `super_admin` (مباشرة أو عبر `hbspro_has_org_role_text`)
- [ ] لا FKs إلى `auth.users` — استخدم `profiles`
- [ ] كل `SECURITY DEFINER` تضبط `SET search_path = public` وتفحص الصلاحيات
- [ ] كل دالة مذكورة في policy موجودة فعلاً في DB
- [ ] لا `CHECK` تستخدم `now()` أو دوال volatile

## 🔐 Security
- [ ] لا أسرار في الكود (`process.env` داخل handlers فقط)
- [ ] `createServerFn` غير العامة تستخدم `.middleware([requireSupabaseAuth])`
- [ ] `supabaseAdmin` مستورد فقط عبر `await import(...)` داخل الـ handler
- [ ] `/api/public/*` تتحقّق من HMAC / signature / secret
- [ ] لا PII في logs أو responses عامة
- [ ] Zod validation على كل input خارجي

## 🌐 i18n & A11y
- [ ] كل نص عبر `t()` (AR + EN)
- [ ] `bun run audit:i18n` أخضر
- [ ] RTL يعمل بصرياً
- [ ] Semantic tokens فقط — لا ألوان hard-coded

## ✅ قبل طلب المراجعة
- [ ] الفرع rebased على `hrbapp` — ليس diverged
- [ ] لا تعارضات
- [ ] العنوان وصفي (ليس `wip` / `updates`)
- [ ] الـ commits مرتّبة أو `Squash on merge` مفعّل
- [ ] وصف الـ PR يمرّر `pr-description-check` CI

---

> **للمراجع:** إن فشل أي بند بلوكر (RLS، super_admin، FK إلى `auth.users`، سرّ في الكود) — لا تدمج. شغّل `/skill:pr-risk-audit <رقم>` للمراجعة الشاملة.
