## Sprint 2 — CSR + XAdES + Fatoora Submission (ZATCA Phase 2)

### الهدف
تمكين المؤسسات من إتمام تسجيل ZATCA وتوقيع الفواتير وإرسالها إلى بوابة Fatoora مباشرة من داخل التطبيق، دون الحاجة لأدوات خارجية أو إدخال يدوي للـ CSID.

### النطاق
1. توليد CSR (Certificate Signing Request) داخل التطبيق باستخدام مفاتيح `secp256k1` / ECDSA.
2. طلب Compliance CSID ثم Production CSID من ZATCA (Sandbox أولاً ثم Production).
3. تعديل UBL 2.1 XML الحالي ليتضمن `UBLExtensions` لـ XAdES-BES (SignedInfo + KeyInfo + QualifyingProperties).
4. حساب `InvoiceHash`، `PIH` (previous invoice hash)، `QRCode` TLV مع التوقيع، و`SignedProperties` hash وفق مواصفة ZATCA.
5. إرسال الفاتورة إلى `/invoices/clearance/single` (Standard) أو `/invoices/reporting/single` (Simplified).
6. تخزين نتيجة المقاصة (Cleared XML + QR + Warnings) في `invoices` وأرشفتها مع `sealZatcaInvoice`.
7. واجهة إدارية جديدة لتتبع حالة كل فاتورة (Draft → Signed → Cleared/Reported/Rejected).

### القرارات التقنية
- **العملة التشفيرية:** `secp256k1` عبر مكتبة `@noble/curves` (نقية JS، بدون WASM، متوافقة مع Cloudflare Workers). SHA-256 عبر WebCrypto المتاح في Workers.
- **CSR/ASN.1:** بناء الـ CSR يدوياً باستخدام `@peculiar/asn1-schema` + `@peculiar/x509` (نقية JS، تعمل في Workers) — أو ترميز DER يدوي إذا اقتضى الأمر لتقليل الاعتماديات.
- **XML/XAdES:** استخدام `xmldom` + `xpath` + تنفيذ يدوي لـ Canonical XML 1.0 (C14N) لأن `xml-crypto` غير متوافق مع Workers. نستفيد من مواصفة ZATCA التي تحدد بالضبط أي عناصر تُوقّع.
- **تخزين المفاتيح:** المفتاح الخاص يُشفَّر بـ AES-GCM باستخدام مفتاح رئيسي في `secrets` (`ZATCA_KEY_ENCRYPTION_KEY`) ثم يُحفظ في `zatca_csid.private_key_encrypted` (base64). لن يُعاد المفتاح للواجهة أبداً.
- **بيئة Fatoora:**
  - Sandbox: `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/`
  - Simulation: `https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/`
  - Production: `https://gw-fatoora.zatca.gov.sa/e-invoicing/core/`

### التسليمات

#### 1) Migration
- تعديل `zatca_csid`: إضافة `private_key_encrypted` (text), `public_key` (text), `csr` (text), `otp_used` (text), `compliance_status` (text). الاحتفاظ بالسياسات الحالية.
- جدول جديد `zatca_invoice_signatures`: `invoice_id` (fk), `signed_xml` (text), `invoice_hash` (text), `qr_code` (text), `zatca_uuid` (text), `submission_status` (enum: pending/cleared/reported/rejected/warnings), `warnings` (jsonb), `errors` (jsonb).

#### 2) مكتبات
```
bun add @noble/curves @noble/hashes @peculiar/asn1-schema @peculiar/asn1-x509 @peculiar/x509 xmldom xpath fast-xml-parser
```

#### 3) أدوات التشفير (`src/lib/zatca/crypto.server.ts`)
- `generateEcKeyPair()` → `{ privateKey, publicKey }` بصيغة PEM.
- `buildCsr(orgInfo, keyPair, environment)` — يولّد CSR مع الحقول المطلوبة من ZATCA (Common Name، Organization Identifier VAT، Organization Name، Country, Business Category, Invoice Type، Location، Industry).
- `encryptPrivateKey(pem)` / `decryptPrivateKey(cipher)` باستخدام `ZATCA_KEY_ENCRYPTION_KEY`.

#### 4) عميل Fatoora (`src/lib/zatca/fatoora-client.server.ts`)
- `requestComplianceCsid({ csr, otp, environment })` → POST `/compliance`.
- `requestProductionCsid({ complianceRequestId, environment })` → POST `/production/csids`.
- `submitComplianceInvoice({ signedXml, invoiceHash, uuid, csid })` — فحص أنواع الفواتير الستة المطلوب.
- `clearanceSingle({...})` (Standard) و `reportingSingle({...})` (Simplified).

#### 5) XAdES Signer (`src/lib/zatca/xades-signer.server.ts`)
- `buildUblExtensions(unsignedXml, csidCert, privateKey, invoiceCounter, pih)`.
- حساب `InvoiceHash` (SHA-256 لـ canonicalized XML بعد إزالة العناصر المحددة).
- بناء `SignedInfo` و`SignedProperties` وتوقيعهما.
- إعادة الـ XML الموقّع + `qrCode` (TLV base64) + `invoiceHash`.

#### 6) Server Functions (`src/lib/zatca-onboarding.functions.ts`)
- `generateCsr(environment)` — يولّد المفتاح، يبني CSR، يخزّن مؤقتاً، ويعيد نص CSR للـ UI.
- `requestComplianceCsid({ csr, otp, environment })` — يستدعي Fatoora ويخزّن CSID.
- `runComplianceChecks(environment)` — يرسل الفواتير الستة الإلزامية.
- `requestProductionCsid(environment)` — بعد نجاح الفحص.

- ملف جديد `src/lib/zatca-submission.functions.ts`:
  - `signAndSubmitInvoice({ invoiceId })` — يجلب الفاتورة، يبني UBL، يوقّع، يرسل، يخزّن النتيجة، ويستدعي `sealZatcaInvoice` عند النجاح.
  - `retryFailedSubmission({ invoiceId })`.

#### 7) UI
- تحديث `src/components/zatca/ZatcaCsidCard.tsx`:
  - زر "توليد CSR" → يعرض النص للنسخ + حقل OTP + زر "طلب CSID تجريبي".
  - بعد نجاح Compliance: زر "تشغيل فحوصات الامتثال" → يعرض تقدم الفحوصات الستة.
  - بعد نجاح جميع الفحوصات: زر "طلب CSID الإنتاج".
- شارة حالة على قائمة الفواتير `src/routes/_authenticated/dashboard.invoices.*.tsx`:
  - Draft / Signed / Cleared ✓ / Reported ✓ / Warnings ⚠ / Rejected ✗.
- تعديل صفحة تفاصيل الفاتورة: زر "توقيع وإرسال إلى فاتورة" + عرض QR + تحذيرات ZATCA.

#### 8) Secrets مطلوبة
- `ZATCA_KEY_ENCRYPTION_KEY` (يُولَّد تلقائياً عبر `generate_secret`, 64 char).

#### 9) اختبارات ذكية
- Golden test vector: فاتورة نموذجية من مستندات ZATCA + hash متوقع.
- تشغيل `signAndSubmitInvoice` ضد Sandbox من داخل CI/dev قبل الترقية للإنتاج.

### الترتيب التنفيذي (5 خطوات مرقمة)
1. **Foundations:** Migration + install libs + `crypto.server.ts` + توليد `ZATCA_KEY_ENCRYPTION_KEY`.
2. **CSR + Compliance CSID:** `generateCsr` + `requestComplianceCsid` + تحديث UI.
3. **XAdES + QR + InvoiceHash:** `xades-signer.server.ts` + اختبارات vs ZATCA vectors.
4. **Fatoora client + submission flow:** `fatoora-client.server.ts` + `signAndSubmitInvoice` + دمج مع `sealZatcaInvoice`.
5. **Compliance checks + Production CSID + UI حالات:** الفحوصات الستة + الترقية للإنتاج + شارات الفواتير.

### مخاطر معروفة
- **`secp256k1` ECDSA في Workers:** `@noble/curves` يعمل — تم التحقق. لا حاجة لـ WebCrypto.
- **C14N XML الدقيق:** أي فرق في المسافات البيضاء يفسد الـ hash. سنتّبع مواصفة ZATCA حرفياً واستخدام golden vectors.
- **ترتيب `UBLExtensions` قبل `Signature`:** حساس. تم توثيقه في تعليقات الكود.
- **حجم CSR:** بعض حقول ZATCA (Invoice Type 4-digit) يجب أن تطابق بالضبط `1100` للفواتير الضريبية.

### خارج النطاق (Sprint 3)
- طابور إعادة المحاولة التلقائي (`zatca_submission_attempts` retry cron).
- شاشة إعدادات "التقارير الشهرية Reporting Summary".
- ربط `contact_id` بالفاتورة (يبقى Sprint 4).

هل أبدأ من الخطوة 1 (Foundations)؟