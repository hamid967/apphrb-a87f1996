## Wave 2 — ZATCA Phase-2 + جدولة الأقساط

هدف الموجة الثانية: تجهيز البنية التحتية لفواتير ZATCA (المرحلة الثانية) وربطها بالسندات (Vouchers) والعمولات، مع إنشاء محرك جدولة أقساط قابل لتوليد سندات تلقائياً.

---

### 1) بنية قاعدة البيانات (Migration واحدة)

**أ. توسيع `invoices` بأعمدة ZATCA:**
- `zatca_uuid` (uuid): معرّف فاتورة فريد لكل مستند.
- `zatca_hash` (text): SHA-256 للـ XML.
- `previous_hash` (text): ربط تسلسلي بالفاتورة السابقة (chain).
- `qr_tlv` (text): TLV الأساس (اسم البائع، الرقم الضريبي، الطابع الزمني، الإجمالي، ضريبة القيمة المضافة).
- `xml_ubl` (text): مسودة UBL 2.1 XML.
- `zatca_status` (enum: `draft | reported | cleared | rejected`).
- `zatca_reported_at` (timestamptz).
- `invoice_type` (enum: `standard | simplified`) للتمييز بين B2B/B2C.

**ب. جدول جديد `payment_schedules`:**
| العمود | النوع | الوصف |
|---|---|---|
| `contract_id` / `deal_id` / `commission_id` | uuid (nullable — مرجع واحد فقط) | المصدر |
| `installment_no` | int | ترقيم القسط |
| `due_date` | date | تاريخ الاستحقاق |
| `amount` / `vat_amount` / `total_amount` | numeric | المبالغ |
| `status` | enum (`pending | invoiced | paid | overdue | cancelled`) |
| `voucher_id` | uuid (nullable) | ربط بسند القبض عند الدفع |
| `invoice_id` | uuid (nullable) | ربط بالفاتورة الصادرة |

**ج. GRANT/RLS/Triggers:**
- RLS بحسب `org_id` (عبر العلاقة).
- Trigger لتحديث `status='overdue'` عند تجاوز `due_date` بدون دفع.
- Trigger لربط `voucher_id` تلقائياً عند إنشاء سند مقابل قسط.

---

### 2) مكتبات ZATCA (ملفات جديدة، دون تبعيات جديدة)

- `src/lib/zatca/tlv.ts` — بناء TLV بايت-بايت (Tags 1-5) وتشفيره Base64. **بدون** مكتبات خارجية.
- `src/lib/zatca/ubl.ts` — قالب UBL 2.1 XML مبسّط (نصّي)، مع placeholders للفاتورة.
- `src/lib/zatca/hash.ts` — SHA-256 عبر Web Crypto (متوفر في Cloudflare Worker).
- `src/lib/zatca/qr.ts` — توليد QR Data URI عبر مكتبة `qrcode` (تحقّق قبل الإضافة؛ إن لم تكن مثبتة نستخدم SVG يدوي بسيط).
- `src/lib/invoices.functions.ts` — Server functions:
  - `generateZatcaInvoice({ invoiceId })` — يقرأ الفاتورة، يبني UBL + TLV + hash + previous_hash، ثم يحدّث السجل.
  - `getZatcaQr({ invoiceId })` — يعيد TLV Base64 للعرض.

*ملاحظة:* الاتصال الفعلي بـ ZATCA Fatoora API خارج نطاق هذه الموجة (يتطلب شهادات إنتاج). الأساس فقط: UBL + QR + Hash Chain جاهزة للإرسال لاحقاً.

---

### 3) محرك جدولة الأقساط

- `src/lib/payment-schedules.functions.ts`:
  - `createSchedule({ sourceType, sourceId, startDate, count, frequency, amount, vatRate })` — يولّد صفوف `payment_schedules`.
  - `listSchedules({ status?, sourceType? })` — قائمة مع فلترة.
  - `markInstallmentPaid({ scheduleId, voucherId })` — يحدّث `status='paid'` ويربط السند.
  - `regenerateFromContract({ contractId })` — يعيد بناء الجدول من العقد.

- **الربط مع Vouchers:** عند إنشاء سند قبض بحقل `payment_schedule_id`، الـ trigger يحدّث القسط تلقائياً.
- **الربط مع Commissions:** خيار "جدولة العمولة على دفعات" في نموذج العمولة يستدعي `createSchedule` بمصدر `commission_id`.

---

### 4) واجهات المستخدم

**أ. صفحة جديدة `/dashboard/payment-schedules`:**
- جدول للأقساط مع فلاتر (الحالة، المصدر، التاريخ، الشركة).
- شارة الاستحقاق بالتقويم الهجري (`HijriDateBadge`).
- إجراءات: إنشاء سند قبض من قسط، إعادة توليد جدول، إلغاء قسط.
- تصدير CSV.

**ب. توسيع صفحة الفاتورة (`/dashboard/invoices/$id`):**
- بطاقة ZATCA: QR code، UUID، Hash (مختصر)، الحالة، زر "توليد/إعادة توليد UBL".
- عرض `previous_hash` للتحقق من التسلسل.

**ج. توسيع نموذج العمولة:**
- Toggle "جدولة على دفعات" + عدد الدفعات + تاريخ البدء.
- عند الحفظ: إنشاء العمولة + استدعاء `createSchedule`.

**د. توسيع نموذج السند (Voucher):**
- Dropdown اختياري "مرتبط بقسط" يعرض الأقساط `pending` للعقد/العميل المحدّد.

**هـ. تحديث الشريط الجانبي:**
- إضافة "جداول الأقساط" ضمن مجموعة "العقود والمالية".

---

### 5) i18n + التوثيق + الاختبارات

- إضافة مفاتيح AR+EN لكل النصوص الجديدة (تدقيق عبر `bun run audit:i18n`).
- Playwright: سيناريو E2E لإنشاء عقد → توليد جدول → تسجيل دفعة → توليد سند → توليد فاتورة ZATCA → التحقق من QR.
- Vitest: اختبارات وحدة لـ TLV encoder + hash chain (متوقعات معروفة من مواصفات ZATCA).
- تحديث `mem://features/wave2-progress.md` وربطه بالفهرس.
- تحديث `admin.route-map.tsx` بالمسار الجديد.

---

### 6) الترتيب والتنفيذ

يُنفَّذ على **دفعتين متتاليتين** لتقليل حجم أي مراجعة واحدة:

**الدفعة أ (هذه الجولة):**
1. Migration واحدة: توسيع `invoices` + جدول `payment_schedules` + GRANT/RLS/Triggers.
2. مكتبات ZATCA (TLV, UBL, Hash) + اختبارات وحدة.
3. Server functions: `generateZatcaInvoice`, `getZatcaQr`, `createSchedule`, `markInstallmentPaid`.
4. صفحة `/dashboard/payment-schedules` (قراءة/فلترة/تصدير) + بطاقة ZATCA في صفحة الفاتورة.

**الدفعة ب (جولة تالية بعد الموافقة):**
5. تكامل نماذج Vouchers/Commissions مع الجدول.
6. سيناريو Playwright E2E الكامل.
7. i18n audit + تحديث الذاكرة والخطة.

---

### ملاحظات فنية

- كل الحساسيات (QR TLV, XML, Hash) تُبنى داخل `createServerFn` فقط — لا تسريب لأي كود ZATCA للواجهة عدا عرض QR/UUID جاهزَين.
- الـ hash chain يعتمد على `previous_hash` من آخر فاتورة `reported` لنفس المؤسسة (فهرس مركّب `(org_id, zatca_reported_at DESC)`).
- الـ GRANT لدوال ZATCA: `authenticated` فقط (مع تحقق دور محاسبي داخلي).
- لا اتصال شبكي بـ ZATCA في هذه الموجة — فقط توليد الحمولات.

هل نبدأ بالدفعة (أ)؟
