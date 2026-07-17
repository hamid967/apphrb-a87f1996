# خطة: المساعد الصوتي «حامد» + وكيل AWS Athena

## نظرة عامة

- **حامد** = مساعد صوتي حواري لحظي (WebRTC) عبر **ElevenLabs Conversational AI**، يظهر كزر مايكروفون عائم في `_authenticated`.
- **الأدوات**: يستدعي server functions في HBSpro لقراءة بيانات المستخدم عبر RLS، إنشاء إجراءات (تذكرة صيانة، سند)، والإجابة عن أسئلة عامة، بالإضافة إلى أداة **AWS Athena** لتشغيل استعلامات SQL على S3.
- **الأمان**: كل الأدوات تعمل بجلسة المستخدم الحالية (bearer token) عبر `requireSupabaseAuth`؛ ElevenLabs `agent_id` + `xi-api-key` يبقيان على الخادم.

## ما سأنفذه

### 1) ربط ElevenLabs

- إضافة موصل ElevenLabs القياسي (`standard_connectors--connect` → `elevenlabs`) لتزويد `ELEVENLABS_API_KEY`.
- طلب/تخزين `ELEVENLABS_AGENT_ID` كسر (`add_secret`) — يُنشئه المستخدم في لوحة ElevenLabs بعد أن أزوّده بنص الـ system prompt والـ client tools schema.

### 2) ربط AWS Athena

- `standard_connectors--connect` → `aws_athena`. المفاتيح البيئية `AWS_ATHENA_API_KEY`, `AWS_ATHENA_WORKGROUP`, `AWS_ATHENA_OUTPUT_LOCATION` تُستخدم داخل server function واحدة.

### 3) Server functions (أدوات حامد) — `src/lib/hamid/*.functions.ts`

كلها `requireSupabaseAuth` + Zod validators + ترجع JSON مضغوط:

- `getHamidToken` (WebRTC token من ElevenLabs، خادم فقط).
- `hamidListMyContracts({ status?, limit })` — قراءة `contracts` تحت RLS.
- `hamidListMyInvoices({ status?, limit })` — قراءة `invoices`.
- `hamidListMyMaintenance({ status?, limit })` — قراءة `maintenance_tickets`.
- `hamidCreateMaintenanceTicket({ property_id, unit_id?, title, description, priority })` — إدراج آمن + إرجاع الرقم.
- `hamidCreatePaymentReceipt({ contract_id, amount, method, notes? })` — إدراج في `payments`.
- `hamidRunAthenaQuery({ sql, max_rows })` — تنفيذ استعلام Athena عبر بوابة الموصل مع polling + قصر `max_rows ≤ 100` + منع كلمات DDL/DML (`INSERT|UPDATE|DELETE|DROP|ALTER|CREATE`) — قراءة فقط.

### 4) واجهة المستخدم

- زر عائم جديد `src/components/hamid/HamidVoiceLauncher.tsx` (أسفل يمين، RTL) مركّب في `_authenticated/route.tsx`.
- `HamidVoicePanel.tsx`: مودال يستخدم `@elevenlabs/react`'s `useConversation` مع `conversationToken` من `getHamidToken`، أزرار بدء/إنهاء/كتم، مؤشر «يستمع/يتحدث»، وسجل مختصر للمحادثة.
- `clientTools` map يمرّر تنفيذ الأدوات إلى server functions بدل تنفيذها في المتصفح مباشرة (أدوات ElevenLabs الأدائية تُعرَّف في لوحة ElevenLabs وتنفَّذ محلياً هنا).
- زر «تشغيل SQL على Athena» مخفي بشكل افتراضي؛ يعمل فقط عندما يطلب المستخدم صراحة أو عندما تستدعيه الأداة.

### 5) صفحة إدارة صغيرة

- `_authenticated/admin/hamid.tsx`: تعليمات ربط ElevenLabs + عرض حالة الأسرار (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `AWS_ATHENA_*`) + نص system-prompt جاهز للنسخ + تعريفات أدوات client-tools JSON للصق في لوحة ElevenLabs.

### 6) الترجمة

- كل نصوص الواجهة عبر `t()` (`ar` + `en`) وفق قاعدة i18n.

## تفاصيل تقنية

- ElevenLabs يُستدعى مباشرة (ليس عبر Gateway):
  `GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=…` بترويسة `xi-api-key`.
- ربط AWS Athena يمر عبر `https://connector-gateway.lovable.dev/aws_athena/` مع `Authorization: Bearer $LOVABLE_API_KEY` و `X-Connection-Api-Key: $AWS_ATHENA_API_KEY`، بعمليات `StartQueryExecution` → poll `GetQueryExecution` → `GetQueryResults` (ClientRequestToken = `crypto.randomUUID()`).
- سقوف أمان Athena: `LIMIT` إجباري في SQL، رفض أي عبارة غير `SELECT/WITH/SHOW/DESCRIBE`، تايم-أوت 60 ث، `max_rows ≤ 100`.
- عرض الردود في الواجهة عبر `react-markdown` (بعد التركيب في التطبيق إن لم يكن موجودًا).

## أسئلة أرد الإجابة عليها لاحقًا (لا تحجز البدء)

- هل لديك بالفعل ElevenLabs Agent؟ سأزودك بالـ prompt وأدوات JSON لإنشائه، ثم تنسخ الـ `agent_id`.
- هل قاعدة Athena جاهزة (workgroup + output location)؟ إن لا، سأشرح خطوات الربط بعد الموافقة.

## خارج النطاق الآن

- استضافة HBSpro على AWS، Voice cloning، تحليلات صوتية عميقة، أو وكلاء AWS بخدمات أخرى (S3/Lambda/DynamoDB مباشرة).

هل أبدأ التنفيذ بهذه الخطة؟
