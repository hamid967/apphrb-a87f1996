## الموجة 3 — النطاق

ثلاث حزم متوازية على مسار واحد، لكل حزمة قاعدة بيانات + خادم + واجهة. كل حزمة قابلة للتنفيذ مستقلة عن الأخرى، والترتيب المقترح أدناه من الأعلى قيمة أعمالًا إلى الأقل.

---

### الحزمة أ — إكمال دمج ZATCA Phase-2 مع السندات والفواتير

**الوضع الحالي:** مكتبات `zatca/` (QR TLV، XML UBL 2.1، hash chain، حساب VAT) موجودة من الموجة 2 لكنها غير مربوطة بأي مسار إصدار فعلي. `invoices` تحوي حقول `zatca_uuid`, `zatca_hash`, `zatca_qr` غير مملوءة، و`payment_vouchers`/`receipt_vouchers` بلا ختم ZATCA.

**التسليمات:**
- ترقية `invoices` و`payment_vouchers` و`receipt_vouchers` بحقول `zatca_previous_hash`, `zatca_invoice_counter`, `zatca_signed_xml`, `zatca_signed_at`.
- Server function `sealInvoiceForZatca(invoiceId)` — يحسب الـ hash المتسلسل، يولّد UBL XML، يبني QR TLV، ويحفظ الكل داخل transaction واحدة. يمنع الإصدار المكرر بـ advisory lock على `company_id`.
- Trigger على `invoices.status → 'issued'` يستدعي الـ server function عبر `pg_net`.
- زر يدوي "إعادة ختم ZATCA" في صفحة الفاتورة/السند (للحالات الشاذة).
- عرض QR في PDF ونسخة الطباعة (نستخدم مكتبة QR الموجودة).
- تقرير `/admin/zatca-log` يعرض التسلسل الشهري + التنبيه على أي فجوة عدّاد.

**قبول:** إصدار فاتورة يولّد سلسلة hash متصلة، وQR يفكّ التشفير في قارئ ZATCA، ولا فجوات في العدّاد.

---

### الحزمة ب — نظام تذاكر الدعم الكامل

**الوضع الحالي:** `tickets` (13 عمود) و`maintenance_tickets` منفصلتان. لا SLA، لا إسناد متعدد، لا محادثات، لا مرفقات.

**التسليمات (قاعدة البيانات):**
- توسيع `tickets` بحقول: `priority` (enum: low/normal/high/urgent)، `sla_due_at`، `first_response_at`، `resolved_at`، `channel` (portal/email/whatsapp/phone)، `assignee_id`، `watcher_ids uuid[]`، `tags text[]`.
- جدول جديد `ticket_comments` (author, body, is_internal, attachments).
- جدول `ticket_attachments` مربوط بـ Storage bucket خاص.
- جدول `ticket_sla_policies` لكل شركة (زمن الاستجابة والحل حسب priority).
- Trigger لحساب `sla_due_at` تلقائيًا عند الإنشاء أو تغيير الأولوية.
- Cron كل 15 دقيقة يرصد التذاكر المتأخرة ويولّد إشعار.

**التسليمات (الواجهة):**
- `/support/tickets` — قائمة مع فلاتر (حالة، أولوية، مُسنَد لي، متأخر)، بحث نصي، عدّاد SLA حي.
- `/support/tickets/$id` — thread محادثات (داخلي/خارجي)، لوحة جانبية بالمعلومات، أزرار حالة، إسناد، تعليق داخلي، رفع مرفقات.
- بوابة العميل `/portal/support` — إنشاء تذكرة، عرض حالتها، الرد.
- لوحة `/admin/tickets/analytics` — MTTR، معدل SLA، توزيع حسب المُسنَد إليه.

**قبول:** إنشاء تذكرة من البوابة تصل للفريق مع SLA، محادثة داخلية لا تظهر للعميل، مرفقات ترفع/تُنزَّل بأمان، تنبيه SLA يصل قبل الاستحقاق.

---

### الحزمة ج — إكمال CRM للإعلانات

**الوضع الحالي:** `listings` (20 عمود)، `leads` (14)، `property_viewings` (15) موجودة كـ shims من الموجة 1 دون منطق ربط.

**التسليمات (قاعدة البيانات):**
- عمود `leads.pipeline_stage` (enum: new/contacted/qualified/viewing_scheduled/negotiating/won/lost) + `lost_reason`.
- جدول `lead_activities` (call/email/whatsapp/note/status_change) مع timeline.
- جدول `listing_lead_matches` لربط الـ lead بالإعلانات المناسبة تلقائيًا (السعر، النوع، المدينة).
- Trigger عند `lead → won` ينشئ contract draft ويحفظ `converted_contract_id` على الـ lead.
- MV `mv_agent_pipeline` لأداء المندوب (leads count، conversion rate، متوسط زمن الإغلاق).

**التسليمات (الواجهة):**
- `/crm/pipeline` — Kanban board قابل للسحب بين المراحل، عدّادات لكل عمود، فلترة حسب المندوب.
- `/crm/leads/$id` — بطاقة تفصيلية: بيانات، اهتمامات، timeline نشاطات، عقارات مقترحة، زر "جدولة معاينة" و"تحويل إلى عقد".
- `/crm/viewings` — تقويم أسبوعي بجميع المعاينات، إمكانية التسجيل داخل ورقة معاينة (visit sheet).
- `/crm/analytics` — قمع المبيعات، أداء المندوبين، مصادر الليدز.

**قبول:** Lead جديد يظهر في pipeline، سحبه بين المراحل يُسجَّل نشاطًا، تحويله لعقد ينشئ عقدًا مسودة مربوطًا، والتقارير تعكس البيانات.

---

## التنفيذ التقني (مشترك بين الحزم)

- كل server function تحت `requireSupabaseAuth` مع فحص `company_id` من `context.claims`.
- كل ترقية جدول تتضمن: `GRANT` صريح، RLS مفعّل، سياسات `has_role`/`company_id` isolation.
- الواجهة تستخدم `useSuspenseQuery` + `queryOptions` على نمط باقي المشروع.
- كل مفاتيح النصوص تمر عبر `t()` بمفتاحين AR/EN — يُدقَّق بـ `bun run audit:i18n` قبل الإغلاق.
- كل جدول جديد يحصل على triggers `updated_at` + `audit_log` القياسية.
- اختبارات Playwright: مسار واحد end-to-end لكل حزمة (ختم فاتورة → QR ظاهر / إنشاء تذكرة بوابة → إشعار SLA / lead جديد → تحويل عقد).

## الترتيب المقترح

1. **الحزمة أ** أولًا — التزام تنظيمي حرج، والبنية جاهزة من الموجة 2.
2. **الحزمة ب** ثانيًا — أعلى قيمة تشغيلية يومية.
3. **الحزمة ج** ثالثًا — تعتمد على استقرار العقود/الفواتير من (أ).

بعد اعتماد الخطة سأبدأ بالحزمة أ (migration + server functions + UI hook)، ثم أعرض عليك التقدم قبل الانتقال للحزمة ب.
