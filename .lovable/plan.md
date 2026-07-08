
## الهدف

بناء **خدمة تقييم وتسعير العقارات بالذكاء الاصطناعي** كأول MVP في هذه الجولة، مع تقديم خريطة طريق مرحلية للخدمات الثمانية.

---

## المرحلة 1 (الآن): تقييم/تسعير ذكي بالـ AI

### تجربة المستخدم
- زر **"تقييم ذكي"** في صفحة تفاصيل العقار (`/dashboard/properties/$id`) + إدخال عناصر إضافية (نوع التقييم: بيع/إيجار شهري/سنوي).
- صفحة مستقلة `/dashboard/valuation` للتقييم السريع بإدخال يدوي (بدون حفظ عقار).
- نتيجة على شكل بطاقة:
  - **السعر المقترح** (نطاق: min / suggested / max) بالريال.
  - **مستوى الثقة** (high/medium/low) + شارة ملوّنة.
  - **العوامل المؤثرة** (bulleted): الموقع، المساحة، الحالة، نوع العقار، السوق المحلي.
  - **مقارنات محلية** من عقارات نفس المدينة/الحي في `properties` + `listings` (top 5).
  - **توصيات** لرفع القيمة (مثل: صيانة، تحسينات).
- زر **حفظ التقييم** يخزن التقرير في جدول `property_valuations`.
- زر **مقارنة تقييمات سابقة** (timeline).

### البنية التقنية
1. جدول جديد `property_valuations` (بـ RLS + GRANT كاملة، عزل `company_id`):
   - `id, company_id, property_id (nullable), user_id, input_snapshot jsonb, suggested_price numeric, min_price, max_price, purpose (sale|rent_monthly|rent_yearly), confidence, factors jsonb, comparables jsonb, ai_notes text, created_at`.
2. Server function `valuateProperty` في `src/lib/valuation.functions.ts`:
   - `requireSupabaseAuth`.
   - يستقبل: `{ propertyId? , purpose, overrides? }`.
   - يجمع سياق: بيانات العقار + مقارنات SQL (نفس المدينة/النوع/±20% مساحة) + متوسطات سوقية.
   - يستدعي **Lovable AI Gateway** (`google/gemini-2.5-flash` — سريع ورخيص ومتعدد الوسائط) عبر `createServerFn` + `Output.object` (structured output) بمخطط Zod للنتيجة.
   - يخزن النتيجة في `property_valuations` ويعيدها.
3. Server fn `listValuations({ propertyId })` لعرض التاريخ.
4. UI:
   - `src/components/valuation/ValuationDialog.tsx` — نموذج الإدخال.
   - `src/components/valuation/ValuationReport.tsx` — عرض النتيجة.
   - `src/routes/_authenticated/dashboard.valuation.tsx` — الصفحة المستقلة.
   - زر داخل صفحة العقار الحالية.
5. تكامل مع `ServicesReportPage`: تفعيل بطاقة "تقييم AI" لتوجّه إلى `/dashboard/valuation`.

### الأمان والحدود
- RLS: القراءة/الكتابة فقط لمن ينتمي لنفس `company_id`.
- Rate limit ضمني بحفظ آخر تقييم + عرض "التقييم الأخير خلال آخر 24 ساعة" لتفادي إهدار كريديت.
- معالجة أخطاء 429/402 من الـ Gateway مع رسائل واضحة بالعربية.
- كل النصوص عبر `t()` بـ AR + EN.

---

## المرحلة 2: خريطة الطريق للخدمات المتبقية

| # | الخدمة | التقدير | الاعتماديات |
|---|--------|--------|-------------|
| 2 | **فحص وثائق المستأجرين/المالكين OCR** | متوسط | يعتمد على `receipt-ocr.functions.ts` — نوسّعه لاستخراج بيانات الهوية/السجل التجاري + تحقق تلقائي من الصلاحية. جدول `document_verifications`. |
| 3 | **سجل صيانة تفاعلي + قطع غيار وفنيين** | كبير | توسيع `maintenance_tickets` + `technicians`. جداول جديدة: `spare_parts`, `ticket_parts`, `ticket_timeline`. صفحة Timeline لكل وحدة. |
| 4 | **حجز مواعيد زيارات/جولات** | متوسط | جدول `property_viewings` + تقويم عام لكل عقار + رابط عام (بدون تسجيل) للحجز. تكامل مع `notification_queue`. |
| 5 | **توسيع بوابة المستأجر/المالك (دفع + عقود)** | كبير | إضافة دفع أونلاين للـ portal (رفع إيصال + OCR)، عرض العقود + توقيع رقمي بسيط (رسم توقيع + hash). |
| 6 | **أرشفة إلكترونية + بحث ذكي** | كبير | توسيع `documents`: OCR عربي + embeddings (`openai/text-embedding-3-small` عبر AI Gateway) + عمود `pgvector` + صفحة بحث دلالي. |
| 7 | **تقارير وتحليلات متقدمة للمحفظة** | متوسط | صفحة `/dashboard/portfolio-analytics`: ROI، معدل الإشغال، القيمة السوقية المُقدَّرة (يستفيد من تقييمات المرحلة 1)، توقعات إيرادات. |
| 8 | **إشعارات SMS + WhatsApp للدفعات والتذكيرات** | صغير | البنية موجودة بالفعل (`notifications-dispatch.server.ts` + Twilio). المطلوب فقط: قواعد أتمتة (rent reminder 3/1 أيام قبل)، وواجهة إعدادات التذكير في `notification-settings`. |

**الترتيب المقترح للتنفيذ:** 1 (الآن) → 8 (إعادة تفعيل سريع) → 4 → 2 → 7 → 3 → 5 → 6.

---

## التفاصيل التقنية (للمرجع)

**Files to create (المرحلة 1):**
- `supabase/migrations/*_property_valuations.sql`
- `src/lib/valuation.functions.ts`
- `src/components/valuation/ValuationDialog.tsx`
- `src/components/valuation/ValuationReport.tsx`
- `src/routes/_authenticated/dashboard.valuation.tsx`

**Files to edit:**
- `src/routes/_authenticated/dashboard.properties.$id.tsx` (إضافة زر التقييم)
- `src/routes/_authenticated/dashboard.services-report.tsx` (تحديث بطاقة التقييم)
- `src/components/dashboard/ServicesGrid.tsx` (إضافة رابط سريع)
- ملفات i18n (AR/EN keys).

**Model:** `google/gemini-2.5-flash` عبر `src/lib/ai-gateway.server.ts` الموجود.

**Structured output schema (Zod):**
```
{ suggested_price, min_price, max_price, confidence, factors[], recommendations[], comparables_summary }
```

---

## ما لن يُنفَّذ في هذه الجولة
- الخدمات 2–8 (تُنفَّذ لاحقاً حسب الترتيب أعلاه).
- تكامل مصادر بيانات خارجية (مثل عقاري/إيجار) — نعتمد على المقارنات الداخلية من قاعدة البيانات الحالية.
