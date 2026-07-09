## هدف التطوير
إكمال الأقسام الناقصة عبر جميع طبقات التطبيق الأربع (تسويقي عام → لوحة الشركة → لوحة السوبر أدمن → بوابات المستأجر/المالك)، مع ربط كامل بالباك اند (Lovable Cloud + RLS) واستخدام مفاتيح الترجمة i18n لكل نص، والالتزام بثيم HRHBS البنفسجي للوحات والخط Almarai.

بعد فحص المشروع الحالي، الأقسام الموجودة كثيرة بالفعل. سأركّز على الفجوات الحقيقية فقط.

---

## المرحلة 1 — الموقع التسويقي العام
مسارات جديدة تُضاف تحت `src/routes/` مع `head()` مستقل لكل واحدة (SEO):
- `about.tsx` — من نحن، الرؤية، الرسالة، الفريق
- `contact.tsx` — نموذج تواصل يُخزَّن في جدول `demo_requests` (موجود)
- `faq.tsx` — أسئلة شائعة قابلة للتصفية بحسب الفئة
- `blog.index.tsx` + `blog.$slug.tsx` — مدونة (جدول `blog_posts` جديد)
- `solutions.owners.tsx` / `solutions.brokers.tsx` / `solutions.enterprises.tsx` — صفحات حلول لكل شريحة

## المرحلة 2 — لوحة تحكم الشركة (Dashboard)
إضافة الأقسام الغائبة من الـ spec:
- `dashboard.units.tsx` + `dashboard.units.$id.tsx` — إدارة الوحدات مستقلة عن العقارات
- `dashboard.owners.tsx` + `dashboard.owners.$id.tsx` — إدارة الملاك وكشوف حساباتهم (`owner_statements`)
- `dashboard.vouchers.tsx` — سندات القبض والصرف
- `dashboard.commissions.tsx` — عمولات الوسطاء (`commissions`)
- `dashboard.crm.leads.tsx` / `dashboard.crm.deals.tsx` / `dashboard.crm.meetings.tsx` — CRM مبسّط
- `dashboard.tasks.tsx` — المهام (`tasks`)
- `dashboard.documents.tsx` — إدارة المستندات مع نسخ (`documents` + `document_versions`)
- `dashboard.viewings.tsx` — مواعيد المعاينة (`property_viewings`)
- `dashboard.valuations.tsx` — تقييمات العقارات (`property_valuations`)

## المرحلة 3 — لوحة السوبر أدمن (/admin) — مسار مستقل
تحويل `/admin` من داخل `_authenticated` (كما هو الآن) إلى تجربة مكتملة بإضافة:
- `admin.plans.tsx` — إدارة الباقات (`packages`)
- `admin.support.tsx` — تذاكر الدعم (`tickets`)
- `admin.backups.tsx` — النسخ الاحتياطية (`backups`)
- `admin.email-providers.tsx` / `admin.sms-providers.tsx` — إعدادات مزودي الاتصال
- `admin.banks.tsx` — إدارة البنوك للتحويلات
- `admin.demo-requests.tsx` — طلبات العروض التوضيحية القادمة من الموقع التسويقي

## المرحلة 4 — بوابات خارجية (Portals)
`src/routes/_authenticated/portal/` جديد مع تصميم مبسّط مختلف عن Dashboard:
- `portal.tenant.index.tsx` — الرئيسية للمستأجر: عقد نشط + مدفوعات مستحقة
- `portal.tenant.payments.tsx` — كل الدفعات + رفع تحويل بنكي
- `portal.tenant.maintenance.tsx` — طلبات صيانة (فتح/متابعة)
- `portal.owner.index.tsx` — الرئيسية للمالك: ملخّص العقارات + كشف حساب
- `portal.owner.statements.tsx` — كشوف الحساب الشهرية
- التوجيه بحسب الدور من `has_role` مع صفحة `access-denied` عند التعارض

---

## الجانب التقني

### الجداول الجديدة (Migrations)
- `blog_posts(slug, title_ar, title_en, body_ar, body_en, cover_url, published_at, author_id)` مع RLS: قراءة عامة للمنشور، كتابة لدور `content_editor`
- `faq_entries(category, question_ar, question_en, answer_ar, answer_en, order_index)` قراءة عامة
- (باقي الجداول موجودة — سنستخدمها كما هي)

كل جدول جديد يتبع الأربع خطوات: CREATE → GRANT → ENABLE RLS → POLICY، مع `updated_at` trigger.

### طبقة الوصول
- كل قراءة/كتابة عبر `createServerFn` في `src/lib/*.functions.ts` مع `.middleware([requireSupabaseAuth])` للمحمي، و publishable client للقراءة العامة (المدونة/FAQ).
- استخدام TanStack Query pattern القياسي: `ensureQueryData` في الـ loader + `useSuspenseQuery` في المكوّن.

### i18n
كل النصوص عبر `t()` بمفاتيح AR+EN. تشغيل `bun run audit:i18n` بعد كل مرحلة.

### التصميم
- لوحات التحكم: ثيم HRHBS البنفسجي (Primary #7C3AED)، خط Almarai، sidebar أبيض
- الموقع التسويقي: `.theme-luxe` (كما هو)
- البوابات: تصميم مبسّط بنفس التوكنز البنفسجية لكن layout أخف

---

## الترتيب المقترح والاعتماد
سأنفّذ **المرحلة 1** كاملة في هذا الرد (5-6 مسارات + جدولين + navigation)، ثم أطلب موافقتك للانتقال للمرحلة التالية. هذا يضمن مراجعة تدريجية بدل موجة تغييرات ضخمة.

هل أبدأ بالمرحلة 1، أم تفضّل ترتيب/نطاق مختلف (مثلاً: البوابات الخارجية أولاً لأنها الأكثر إلحاحاً)؟