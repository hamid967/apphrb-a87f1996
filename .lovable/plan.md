# الموجة الثالثة (Wave 3)

بناءً على ما تبقّى من Wave 2، هذه هي البنود الأربعة المستهدفة، مرتبة حسب الأولوية والاعتماديات.

## 1. ZATCA Fatoora — Onboarding + CSID (أولوية قصوى)

**الهدف:** تسجيل كل مؤسسة في بوابة الفوترة السعودية والحصول على شهادة CSID للتوقيع.

**المكونات:**
- جدول جديد: `zatca_csid` — يخزّن `org_id`, `csid_binary_token`, `csid_secret` (مشفّرة), `production` (bool), `issued_at`, `expires_at`. RLS: `is_org_admin(org_id)` فقط.
- Server fn `requestComplianceCsid`: يستقبل OTP من المستخدم، ينشئ CSR (RSA-2048 + attributes ZATCA)، ويستدعي `/compliance` في Fatoora sandbox أولاً.
- Server fn `requestProductionCsid`: يستدعي `/production/csids` بعد نجاح الاختبارات.
- شاشة `/dashboard/settings/zatca`: زر "Onboard"، حقل OTP، عرض حالة الشهادة وتاريخ الانتهاء.

## 2. XAdES Signing + Fatoora Clearance

**الهدف:** توقيع فواتير UBL وإرسالها للمقاصة (B2B) أو الإبلاغ (B2C).

**المكونات:**
- إضافة توقيع XAdES-BES إلى `src/lib/zatca/`: canonicalization C14N، UBL Extensions block، `SignedProperties`، `ds:Signature`.
- Server fn `submitInvoiceToFatoora(invoiceId)`:
  - يجلب CSID للمؤسسة.
  - يوقّع الـ UBL بمفتاح CSID.
  - يستدعي `/invoices/clearance/single` أو `/invoices/reporting/single`.
  - يخزّن رد المقاصة (QR الرسمي، `clearance_status`, `clearance_uuid`) في `invoices`.
- ترقية `sealZatcaInvoice` ليُستدعى تلقائياً بعد نجاح المقاصة (بدل الإجراء اليدوي الحالي).
- شارة حالة في UI الفاتورة: `Pending` / `Cleared` / `Reported` / `Rejected` مع نص الخطأ من ZATCA.

## 3. ربط جهات الاتصال بمصادر الفواتير

**Commission source:** حالياً `buyer_contact_id` = NULL. سنضيف اختيار جهة الاتصال أثناء إنشاء عمولة (dropdown من `crm_contacts`)، ونمرّرها إلى الفاتورة الناتجة.

**Contract source:** المخطط يفتقر لـ `tenants.contact_id`. Migration:
- إضافة عمود `contact_id uuid references crm_contacts(id)` على `tenants`.
- backfill يدوي عبر واجهة تشغيلية (مطابقة بالاسم/الجوال) — بدون إعادة كتابة تلقائية للبيانات القديمة.
- عند إنشاء فاتورة من عقد، استخدم `tenant.contact_id`؛ إن كانت NULL أطلق تنبيهاً للمستخدم.

## 4. Fatoora Retry Queue

**الهدف:** أي فاتورة تفشل في المقاصة (شبكة، تحقق، …) لا تُفقد.

- جدول `zatca_submission_attempts(invoice_id, attempt_no, status, response_body, retried_at)`.
- Cron server fn `retryFailedFatooraSubmissions`: يُشغَّل كل 15 دقيقة، حد أقصى 5 محاولات مع backoff.
- تنبيه للمشرف بعد فشل المحاولة الخامسة.

## الترتيب المقترح للتنفيذ

```text
Sprint 1: CSID onboarding + شاشة الإعدادات
Sprint 2: XAdES signing + submitInvoiceToFatoora (sandbox)
Sprint 3: sealZatcaInvoice الآلي + شارات UI + retry queue
Sprint 4: contact_id للعقود والعمولات + backfill UI
Sprint 5: التبديل من sandbox إلى production + مراقبة
```

## تفاصيل تقنية

- CSR: OpenSSL WASM في server fn (متوفر على runtime Cloudflare)، أو استدعاء مكتبة `node-forge`.
- تشفير `csid_secret`: نستخدم `pgsodium` (متوفر في Lovable Cloud) أو AES-GCM بمفتاح من Secrets.
- Sandbox base URL: `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal`.
- Production base URL: `https://gw-fatoora.zatca.gov.sa/e-invoicing/core`.

## خارج النطاق

- التبديل الآلي بين sandbox وproduction (يظل يدوياً بموافقة المشرف).
- تصدير XML يدوياً — البوابة تخزّن نسخة رسمية.
- Simplified vs Standard invoice routing — كلاهما مدعوم لكن اختيار النوع يعتمد على قواعد ZATCA وسنُبقيه كما هو محدد في Wave 2.

---
هل نبدأ بـ Sprint 1 (CSID onboarding) أم تفضّل ترتيباً مختلفاً؟
