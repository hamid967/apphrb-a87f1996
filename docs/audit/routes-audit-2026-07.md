# تدقيق المسارات المحمية — يوليو 2026

**العدد الكلّي:** 108 مسارًا محميًا تحت `src/routes/_authenticated/` موزّعة على 24 وحدة.

الهدف من هذا التقرير: تحديد المسارات المكرّرة، المتقادمة، والقابلة للدمج قبل تنفيذ أي حذف. **لا تُحذف أي صفحة قبل موافقتك.**

---

## 1. تكرارات واضحة (نفس الوظيفة على مسارين)

### 1.1 العقود (Contracts)

| المسار | الحالة المقترحة | السبب |
|---|---|---|
| `contracts.$id.tsx` | **يُدمج** | نسخة مستقلّة خارج dashboard |
| `dashboard.contracts.$id.tsx` | **يُبقى (القانوني)** | ضمن shell الـ dashboard الموحّد |
| `dashboard.contracts.index.tsx` | يُبقى | قائمة العقود الرئيسية |
| `dashboard.contracts.new.tsx` | يُبقى | إنشاء عقد جديد |

**الإجراء:** توجيه `/contracts/$id` → `/dashboard/contracts/$id` بـ redirect دائم، ثم حذف الملف.

### 1.2 العقارات (Properties)

| المسار | الحالة المقترحة |
|---|---|
| `properties.$id.tsx` | **يُدمج** → `/dashboard/properties/$id` |
| `properties.index.tsx` | **يُدمج** → `/dashboard/properties` |
| `properties.new.tsx` | **يُدمج** → `/dashboard/properties/new` |
| `dashboard.properties.*` (3 ملفات) | **يُبقى (القانوني)** |

### 1.3 الصيانة (Maintenance) — 3 مسارات لنفس الشيء

| المسار | الحالة | ملاحظة |
|---|---|---|
| `maintenance.tsx` + `maintenance.index.tsx` | **يُدمجان** | Layout + Index خارج dashboard |
| `dashboard.maintenance.tsx` | **يُبقى (القانوني)** | ضمن shell الـ dashboard |
| `maintenance.technicians.tsx` | ينقل لـ `dashboard.maintenance.technicians` | لتوحيد المسار |
| `portal.tenant.maintenance.tsx` | يُبقى | بوابة المستأجر — سياق مختلف |

### 1.4 بوابات المالك والمستأجر — الفوضى الأكبر

توجد **ثلاث بوابات متوازية** لنفس المستخدمين:

| مجموعة | الملفات | الحالة |
|---|---|---|
| `owner.portal.*` | `owner.portal.tsx`, `owner.portal.index.tsx`, `owner.portal.statements.$id.tsx` | **يُدمج** ضمن `/portal/owner/*` |
| `tenant.portal.*` | `tenant.portal.tsx`, `tenant.portal.index.tsx`, `tenant.portal.maintenance.tsx` | **يُدمج** ضمن `/portal/tenant/*` |
| `portal.*` (19 ملفًا) | `portal.owner`, `portal.tenant.*`, وباقي البوابة الموحّدة | **يُبقى (القانوني)** |

**الإجراء المقترح:** توحيد كل شيء تحت `/portal/*` مع redirects من المسارات القديمة. يوفّر هذا وحده **6 ملفات مكرّرة**.

### 1.5 المساعد الذكي (Assistant)

| المسار | الحالة |
|---|---|
| `assistant.tsx` (layout) + `assistant.index.tsx` | يُبقى |
| `assistant.$threadId.tsx` | يُبقى |
| `assistant.audit.tsx` | يُبقى (لوحة تدقيق منفصلة) |
| `assistant.scripts.tsx` | **تحت المراجعة** — هل يستخدم؟ |
| `portal.assistant.tsx` | يُبقى (نسخة مبسّطة للبوابة) |

---

## 2. صفحات مشكوك في استخدامها (تحتاج قرار المنتج)

| المسار | التوصية | السبب |
|---|---|---|
| `admin.systest.tsx` | **حذف** | أداة اختبار داخلية لا تخص المستخدم |
| `admin.seed.tsx` | **إخفاء خلف feature flag** | إدخال بيانات تجريبية — خطر في الإنتاج |
| `dashboard.expenses.claim.correct.preview.tsx` | **حذف** | نسخة معاينة زائدة |
| `dashboard.expenses.claim.correct.tsx` | يُبقى | تصحيح المطالبة الفعلي |
| `dashboard.auto.tsx` | **تحت المراجعة** | غير واضح الغرض |
| `dashboard.renew.tsx` | **تحت المراجعة** | ربما تجديد اشتراك — يُدمج مع `dashboard.settings.billing` |
| `settings.import.tsx` | ينقل لـ `dashboard.settings.import` | تناسق المسارات |
| `register-company.tsx` | **يُدمج مع onboarding.wizard** | Onboarding الجديد يغطيه |
| `members.index.tsx` vs `team.index.tsx` | **يُدمج** أحدهما | نفس المفهوم (أعضاء الفريق) |
| `contacts.index.tsx` | يُبقى | لا يوجد `contacts.tsx` — لا تعارض |
| `leads.index.tsx` | يُبقى | مشابه للسابق |

---

## 3. تباين في نمط التسمية (يستحق التوحيد لاحقًا)

- بعض الوحدات لها `<module>.tsx` (layout) + `<module>.index.tsx` (leaf)، وبعضها فقط `<module>.index.tsx` بدون layout — غير متّسق.
- `owners.$id.tsx` و`owners.$id.ledger.tsx` و`owners.contracts.tsx` خارج dashboard، بينما التسلسل النظير للـ tenants داخل `dashboard.tenants.tsx` فقط.
- `reports.*` (6 مسارات) خارج dashboard مع أن `dashboard.reports.tsx` موجود.

---

## 4. ملخّص التأثير المتوقّع

| فئة | العدد | الأثر |
|---|---|---|
| للحذف الفوري (تجريبي/زائد) | 3 | تخفيض ضجيج المستخدم |
| للدمج مع redirects | ~12 | -12 ملف، تبسيط IA |
| للنقل داخل dashboard | ~7 | توحيد الـ shell |
| للإبقاء كما هو | ~86 | لا تغيير |

**الصافي المتوقّع:** من 108 → **~93 مسارًا** مع تحسين واضح في UX وIA.

---

## 5. الخطوات التالية (تحتاج موافقتك)

1. **مصادقة القائمة**: راجع كل صف "للحذف" و"للدمج" — أخبرني بما تريد الإبقاء عليه.
2. **جولة redirects آمنة**: إنشاء ملفات redirect بدلًا من الحذف المباشر في الجولة الأولى (صفر مخاطر SEO/روابط مكسورة).
3. **حذف نهائي بعد 30 يومًا**: بعد التأكّد من عدم وجود traffic على المسارات القديمة (عبر analytics).
4. **توحيد نمط التسمية**: قاعدة واحدة — كل ميزة داخل مستخدم مسجّل = تحت `/dashboard/*`؛ كل بوابة عملاء = تحت `/portal/*`؛ لا مسارات جذر داخل `_authenticated/` إلا للاستثناءات المبرَّرة.

ابدأ بالنقطة 1: أخبرني بأي صف تريد تغييره قبل أن أنفّذ الجولة الأولى من redirects.