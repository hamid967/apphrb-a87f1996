# خطة تطوير وترقية Aqari — ربع سنة (13 أسبوع)

الأولوية القصوى: **توسيع الميزات المفقودة**، مع خط موازٍ لصيانة الأمان والأداء وجودة الشيفرة.

## 1) خلاصة الوضع الحالي

- الحجم: 163 مسار محمي، 38 مسار عام، 25 مسار API، 185 هجرة، ~7.9MB مصدر، 78 ملف اختبار.
- **الأقوى**: لوحة السوبر أدمن، إدارة الشركات/الاشتراكات، صفحة اعتماد التحويلات البنكية، دفعات، عقود، صيانة، محاسبة أساسية، المساعد الذكي، أرشيف.
- **الأضعف/Stub**: السندات (vouchers)، العمولات، CRM (leads/deals/meetings)، دعم المستأجر (portal.support)، خطط ترقية ذاتية.
- **مفقود كلياً**: ZATCA Phase-2، 2FA/TOTP، تقويم هجري، تفعيل SMS/WhatsApp، جدولة أقساط، نشر الإعلانات لبوابات خارجية، توقيع رقمي.
- **الأمان (Supabase linter)**: 203 تحذير — أغلبها `SECURITY DEFINER` قابل للتنفيذ من anon/authenticated، و`Materialized View in API` واحد. لا Errors عالية.
- **الأداء**: أبطأ استعلامات مقبولة (mean < 5ms). أعلى تكلفة `organization_members` join و `properties by org_id` — تحتاج فهارس مركّبة و`select` مضيَّق.
- **Drift**: تكرار حقيقي في `owners.index` vs `dashboard.owners`، و`leads/deals/documents` top-level مقابل `dashboard.crm.*` و`dashboard.documents`.

## 2) مبادئ الخطة

- كل موجة قابلة للنشر مستقلّة (Publish-ready).
- كل ميزة جديدة تُشحن مع: هجرة SQL + GRANT + RLS + Zod input + i18n(AR/EN) + اختبار Playwright واحد على الأقل + تحديث `/admin/route-map` وصفة الاستخدام.
- لا CHECK constraints زمنية؛ استخدم triggers.
- كل جدول جديد ملتزم بـ `company_id` وRLS + `has_role`.

## 3) الموجات

```text
Wave 1 (أسابيع 1-3)  إغلاق Stubs المالية
Wave 2 (أسابيع 4-6)  ZATCA + المحاسبة + الأقساط
Wave 3 (أسابيع 7-10) CRM + التوقيع + الإشعارات
Wave 4 (أسابيع 11-13) 2FA + التوسع (نشر إعلانات) + التلميع
```

خط موازٍ في كل موجة: **Security Hardening + Perf + i18n audit + E2E budget**.

---

### Wave 1 — إغلاق Stubs المالية والدعم (أسبوع 1-3)

| # | العنصر | الحجم |
|---|--------|-------|
| 1.1 | **Vouchers CRUD كامل**: نموذج إنشاء/تعديل، ترقيم `org_sequences`، ربط بالفواتير، طباعة/CSV. | M |
| 1.2 | **Commissions أساسي**: نموذج إنشاء (وكيل/صفقة/نسبة أو مبلغ)، حالات (pending/approved/paid)، سجل مبسّط. | M |
| 1.3 | **portal.support**: نموذج إنشاء تذكرة + قائمة تذاكر المستخدم + عرض المحادثة. | S |
| 1.4 | **Hijri utility**: `src/lib/hijri.ts` بـ `Intl` (islamic-umalqura)، مكوّن `HijriDateBadge`، عرض هجري بجانب الميلادي في العقود/الدفعات/الفواتير. | S |
| 1.5 | **CRM redirect shims**: توحيد `leads/deals/documents/owners` — مسار واحد فقط لكل، والباقي redirect. | S |
| 1.6 | **Route-map metadata**: تحديث الوصف والدور لكل جديد. | S |
| **Security parallel** | تصنيف كل SECURITY DEFINER function: REVOKE EXECUTE FROM PUBLIC/anon حسب الحاجة، أو تحويلها INVOKER؛ نقل ما لا ينبغي للـ API إلى schema داخلي. | M |
| **Perf parallel** | فهرس مركّب `properties(org_id, created_at)` و`organization_members(user_id, created_at)`، وضبط PostgREST select لتفادي fetchAll غير الضروري. | S |

### Wave 2 — ZATCA + المحاسبة + جدولة الأقساط (أسبوع 4-6)

| # | العنصر | الحجم |
|---|--------|-------|
| 2.1 | **ZATCA Phase-2 Foundations**: هجرة أعمدة (`zatca_uuid`, `xml_hash`, `previous_hash`, `qr_tlv_b64`, `clearance_status`, `clearance_response`)، وسلسلة hash عبر trigger. | L |
| 2.2 | **UBL 2.1 XML generator + QR TLV** كـ server function pure-TS + مصادقة رقمية عبر مفاتيح ZATCA. عرض QR في `accounting.index` وطباعة الفاتورة. | L |
| 2.3 | **ZATCA API client**: submit (clearance) + reporting mode + إعادة المحاولة + تخزين استجابة. Feature-flag per company. | M |
| 2.4 | **Installment/Rent Schedule Engine**: جدول `payment_schedules` مولَّد من العقد (شهري/ربعي/سنوي)، aging buckets، تنبيهات تلقائية. تبويب داخل `dashboard.payments.tsx`. | M |
| 2.5 | **VAT quarterly close**: قفل فترة (period lock)، تقرير Excel/CSV جاهز لتقديم ZATCA. | S |
| **Security parallel** | مراجعة سياسات `invoices`/`payments`/`subscription_payments` بشكل مستقل لكل company_id، وحذف anon reads غير الضرورية. | M |
| **Perf parallel** | Materialized view للتقارير المالية مع سياسة عدم كشفه على PostgREST (يُقرأ فقط عبر server functions). | S |

### Wave 3 — CRM Kanban + التوقيع الرقمي + إشعارات SMS/WA (أسبوع 7-10)

| # | العنصر | الحجم |
|---|--------|-------|
| 3.1 | **CRM Pipeline Kanban** لـ leads/deals عبر `@dnd-kit`، مراحل قابلة للتخصيص لكل شركة، جدول `deal_stages` و`activity_timeline`، lead scoring rules أساسية. | L |
| 3.2 | **Auto-match leads → listings** حسب الميزانية/الحي/النوع، اقتراحات في تفاصيل العميل. | M |
| 3.3 | **Digital Signature للعقود**: توليد PDF عبر `pdf-lib` (WASM-safe للـ Worker)، حقول توقيع، رابط توقيع خارجي للمستأجر، سجل تدقيق التوقيع، معلومات جهاز التوقيع. | L |
| 3.4 | **Notifications gateway**: `lib/notifications.functions.ts` موحّد يستدعي مزوّد SMS المُهيّأ + WhatsApp Cloud API، مع قوالب في `admin.sms-providers.tsx`، طابور تسليم + retry، وسجل في `notification_log`. | M |
| 3.5 | **ربط الأحداث**: توقيع عقد، دفعة مستلمة/متأخرة، تذكرة صيانة، دعوة portal → إشعار SMS/WA/بريد بحسب تفضيلات المستخدم. | M |
| **Security parallel** | فرض `has_role` على كل server function حساسة (تدقيق شامل)، إضافة اختبار E2E ينفذ محاولات وصول غير مصرحة ويؤكد 401/403. | M |
| **Perf parallel** | ميزانية bundle لكل صفحة CRM/Contracts؛ Suspense + code-split لعارض PDF ولـ dnd-kit. | S |

### Wave 4 — 2FA + نشر الإعلانات + تلميع (أسبوع 11-13)

| # | العنصر | الحجم |
|---|--------|-------|
| 4.1 | **TOTP 2FA**: enrollment (QR + secret)، تحدٍّ عند الدخول، backup codes مشفّرة، جدول `user_totp_secrets`، فرض 2FA على `super_admin` و`manager`. توسيع `security.sessions.tsx`. | M |
| 4.2 | **WebAuthn/Passkeys (اختياري)** إن سمح الوقت — مكتبة `@simplewebauthn/browser` + server. | M |
| 4.3 | **Listing syndication**: publish/unpublish لبوابة واحدة على الأقل (Aqar.fm أو Bayut KSA)، حالات مزامنة، cron في route `/api/public/cron/syndication` مع HMAC. | L |
| 4.4 | **E-Archive OCR + retention**: OCR عبر Lovable AI Gateway (Gemini) لملفات PDF/صور، سياسة احتفاظ (7 سنوات ZATCA)، bulk ZIP export. | M |
| 4.5 | **Self-service plan upgrade/downgrade** مع proration وإصدار فاتورة معدَّلة. | M |
| 4.6 | **UX/i18n polish**: تدقيق `bun run audit:i18n`، مراجعة تدفقات onboarding، توحيد `theme-tech` على جميع الصفحات المحمية. | S |
| **Security parallel** | تشغيل `security--run_security_scan` النهائي حتى صفر تحذيرات عالية، توثيق memory security. | S |
| **Perf parallel** | ميزانيات Playwright نهائية عبر mobile/tablet/desktop مع تقرير HTML قابل للتحميل مربوط بـ CI. | S |

---

## 4) تفاصيل تقنية مهمة

- **ZATCA**: كل شيفرة توليد UBL + QR TLV + hash chaining داخل `createServerFn` و`await import('@/integrations/supabase/client.server')` داخل الـ handler فقط، لأن الشيفرات في `*.functions.ts` تصل إلى client bundle.
- **Notifications**: أسرار المزودين تُضاف عبر `add_secret`؛ لا مفاتيح داخل الشيفرة.
- **SECURITY DEFINER cleanup**: لكل دالة، حدّد `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated` ثم `GRANT EXECUTE TO service_role` أو الأدوار المقصودة فقط. الدوال التي يجب أن يستدعيها anon (مثل `has_role`) تبقى مكشوفة عمداً وتوثَّق في memory.
- **Materialized View in API**: `mv_refresh_log` — نقل إلى schema `private` أو REVOKE من API roles.
- **Perf indexes** (Wave 1):
  - `CREATE INDEX ON public.properties(org_id, created_at DESC);`
  - `CREATE INDEX ON public.organization_members(user_id, created_at DESC);`
- **Hijri**: بدون تبعية خارجية — `Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {dateStyle:'long'})`.
- **PDF**: `pdf-lib` يعمل داخل Cloudflare Worker (pure ES). لا `puppeteer/sharp`.
- **dnd-kit**: `@dnd-kit/core` + `@dnd-kit/sortable` بدون CJS-only libs.

## 5) تقسيم النطاقات والاختبارات

- كل موجة تنتهي بـ:
  1. اجتياز `bun run audit:i18n` بدون مفاتيح مفقودة.
  2. اجتياز `tests/e2e/admin-perf.spec.py` تحت ميزانيات mobile/tablet/desktop.
  3. اجتياز اختبار E2E جديد لكل ميزة (create → list → detail → RBAC negative).
  4. تحديث `/admin/route-map` تلقائياً من الميتاداتا.
  5. تشغيل `security--run_security_scan` وإغلاق ما ينشأ من تحذيرات جديدة.

## 6) مخاطر رئيسية

- **ZATCA API keys/شهادات** — يجب طلبها من العميل قبل بدء Wave 2 (Task 2.3). اقتراح: بدء 2.1 و2.2 مبكراً بدون API.
- **WhatsApp Business API** يحتاج مراجعة Meta — بديل: SMS أولاً في Wave 3 و WA لاحقاً في نفس الموجة إن تأخر الاعتماد.
- **دوال SECURITY DEFINER كثيرة** — تدقيقها يدوياً مكلف؛ تُقسَّم على الموجات لا موجة واحدة.

## 7) بعد الربع

- بنية دفعات Sadad/STC Pay وربطها.
- تكامل Ejar الحقيقي (استيراد/تصدير).
- تطبيق موبايل (React Native/Expo) لسير الصيانة الميداني.
- Data warehouse للتقارير التنفيذية.
