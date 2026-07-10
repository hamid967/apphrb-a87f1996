
INSERT INTO public.blog_posts (slug, title_ar, title_en, excerpt_ar, excerpt_en, body_ar, body_en, published_at)
VALUES (
  'ejar-integration-guide',
  'دليل تكامل عقاري Aqari مع منصة إيجار: أتمتة العقود ومزامنة البيانات',
  'HBSpro × Ejar Integration Guide: Automating Contracts & Data Sync in Saudi Arabia',
  'كيف يربط عقاري Aqari (HBSpro) إدارة العقارات بمنصة إيجار الحكومية لتسجيل العقود آلياً ومزامنة البيانات ودعم رؤية 2030.',
  'How HBSpro connects property management with Saudi Arabia''s Ejar platform for automated contract registration, real-time data sync, and Vision 2030 compliance.',
$AR$# دليل تكامل عقاري Aqari مع منصة إيجار

منصة إيجار هي النظام الرسمي لتوثيق العقود الإيجارية في المملكة العربية السعودية، وأصبحت شرطاً أساسياً لكل مدير عقارات وملّاك ووسطاء. تكامل عقاري Aqari (HBSpro) مع إيجار يحوّل عملية تسجيل العقود اليدوية إلى تدفق آلي بالكامل — من إنشاء العقد إلى توثيقه رسمياً.

## لماذا التكامل مع إيجار؟

- **الالتزام النظامي:** جميع عقود الإيجار السكنية والتجارية يجب توثيقها عبر إيجار.
- **حماية الأطراف:** العقود الموثقة قابلة للتنفيذ عبر محاكم التنفيذ مباشرة.
- **رؤية 2030:** رقمنة القطاع العقاري وشفافية السوق من ركائز الرؤية.
- **تخفيف العبء الإداري:** بدل إدخال بيانات العقد مرتين (في نظامك وفي إيجار)، تُرسل مرة واحدة تلقائياً.

## كيف يعمل التكامل داخل عقاري Aqari

1. **إعداد الربط لمرة واحدة:** يتم إدخال بيانات الوسيط/المالك المعتمد لدى إيجار في إعدادات الشركة.
2. **إنشاء العقد في Aqari:** الوحدة، المستأجر، المدة، الأجرة، جدول الدفعات، المرفقات.
3. **التحقق التلقائي:** يفحص النظام صحة البيانات (رقم الهوية، الصك، الرقم الوطني للوحدة) قبل الإرسال.
4. **الإرسال إلى إيجار:** ينشئ Aqari طلب توثيق عبر واجهة إيجار البرمجية.
5. **متابعة الحالة:** حالة العقد (قيد المراجعة، موثق، مرفوض) تُحدَّث تلقائياً في لوحة التحكم.
6. **مزامنة البيانات:** أي تعديل، تجديد، أو إنهاء يُعكس في الطرفين.

## البيانات التي تتم مزامنتها

- بيانات الوحدة والصك والرقم الوطني للعقار
- بيانات المستأجر (الهوية، الجوال، البريد)
- شروط العقد (المدة، الأجرة، طريقة الدفع، الزيادة السنوية)
- جدول الدفعات وحالة السداد
- الفواتير الضريبية المرتبطة (متوافقة مع فاتورة/ZATCA)

## فوائد للمدير العقاري

- **توفير 80% من وقت التسجيل:** لا مزيد من الدخول اليدوي على بوابة إيجار.
- **صفر أخطاء بيانات:** التحقق قبل الإرسال يمنع الرفض.
- **تقارير موحدة:** تقرير واحد يعرض كل العقود الموثقة، المعلقة، والمنتهية.
- **جاهزية للتدقيق:** أرشيف رقمي كامل بكل عقد ورقم توثيقه.

## الخطوات التالية

فعّل ربط إيجار من صفحة **الإعدادات ← التكاملات الحكومية** في لوحة تحكم عقاري Aqari، أو تواصل مع فريق الدعم لتفعيل الربط لحسابك.
$AR$,
$EN$# HBSpro × Ejar Integration Guide

Ejar is Saudi Arabia''s official rental contract registration platform, mandated for every landlord, broker, and property manager. Aqari by HRHBS (HBSpro) integrates directly with Ejar so registering a lease stops being a manual, error-prone task and becomes a one-click flow — from draft contract to officially notarized record.

## Why integrate with Ejar?

- **Regulatory compliance:** All residential and commercial leases in KSA must be registered with Ejar.
- **Legal enforceability:** Ejar-registered contracts are directly enforceable via execution courts.
- **Saudi Vision 2030:** Digitizing the real-estate sector and increasing market transparency are core Vision 2030 pillars.
- **Less admin overhead:** Instead of entering contract data twice (in your system and on Ejar), it flows through once.

## How the integration works inside Aqari

1. **One-time broker setup:** Enter your Ejar-approved broker/owner credentials under Company Settings.
2. **Create the contract in Aqari:** Unit, tenant, term, rent, payment schedule, attachments.
3. **Automatic validation:** The system checks ID numbers, deed number, and the unit''s National Property Number before submission.
4. **Submit to Ejar:** Aqari opens a notarization request through the Ejar API.
5. **Status tracking:** Contract state (under review, notarized, rejected) syncs back into your dashboard.
6. **Two-way data sync:** Amendments, renewals, and terminations reflect on both sides.

## What gets synced

- Unit details, title deed, and National Property Number
- Tenant identity (ID, mobile, email)
- Contract terms (duration, rent, payment schedule, annual escalation)
- Payment schedule and settlement status
- Linked ZATCA-compliant tax invoices

## Benefits for property managers

- **~80% less registration time** — no more manual Ejar portal entry.
- **Zero data errors** — pre-submission validation prevents rejections.
- **Unified reporting** — one dashboard for notarized, pending, and expired contracts.
- **Audit-ready** — full digital archive with each contract''s Ejar registration number.

## Next steps

Enable the Ejar connector under **Settings → Government Integrations** in Aqari, or contact support to activate it for your account.
$EN$,
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title_ar = EXCLUDED.title_ar,
  title_en = EXCLUDED.title_en,
  excerpt_ar = EXCLUDED.excerpt_ar,
  excerpt_en = EXCLUDED.excerpt_en,
  body_ar = EXCLUDED.body_ar,
  body_en = EXCLUDED.body_en,
  updated_at = now();
