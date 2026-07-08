# إشعارات SMS / WhatsApp

## نظرة عامة

قناة SMS تُرسل عبر **Twilio** من خلال Lovable connector gateway.
قناة WhatsApp تدعم مسارَين:

1. **Meta Cloud API مباشرة** (الافتراضي إن كانت متغيرات Meta مضبوطة).
2. **Twilio WhatsApp** كـ fallback — يُفعَّل تلقائياً عند غياب متغيرات Meta، أو صراحةً بضبط `WHATSAPP_PROVIDER=twilio`.

كل الاستدعاءات تحدث داخل `src/lib/notifications-dispatch.server.ts` (server-only) وتُسجَّل نتائجها في طابور `notification_queue` مع backoff exponential ودliving-letter بعد 5 محاولات.

## المتغيرات المطلوبة

### SMS
| المتغير | المصدر | ملاحظات |
|---------|--------|---------|
| `TWILIO_API_KEY` | يُضاف تلقائياً عند ربط موصل Twilio عبر Lovable | مفتاح gateway، ليس Twilio SID |
| `TWILIO_FROM_SMS` | يُضاف يدوياً عبر `add_secret` | رقم Twilio بصيغة E.164 (مثال: `+14155551234`) |
| `LOVABLE_API_KEY` | مُوفَّر تلقائياً | لا تلمسه |

### WhatsApp (Meta — الافتراضي)
| المتغير | ملاحظات |
|---------|---------|
| `WHATSAPP_API_KEY` | مفتاح Meta Cloud API |
| `WHATSAPP_PHONE_ID` | معرّف رقم WhatsApp Business |

### WhatsApp (Twilio — fallback)
| المتغير | ملاحظات |
|---------|---------|
| `WHATSAPP_PROVIDER` | ضبطه إلى `twilio` لإجبار استخدام Twilio |
| `TWILIO_FROM_WHATSAPP` | رقم Twilio WhatsApp Business (E.164). في غيابه يُستخدم رقم الـ Sandbox `+14155238886` |

### دولي
| `DEFAULT_PHONE_COUNTRY_CODE` | افتراضي `966` (السعودية) — يُطبَّق على الأرقام المحلية (مثل `05xxxxxxxx`) |

## القوالب (Templates)

`renderTemplate(template, variables)` يقبل شكلَين:

- **قوالب مع placeholders**: `"مرحباً {{name}}، مبلغ {{amount}} ريال"` — تُستبدل من `variables`.
- **نصوص جاهزة**: مرّر `template` بأي اسم و`variables: { body: "..." }` — يُستخدم `body` كما هو.

## اختبار الرسالة

1. تأكد من ربط Twilio عبر إعدادات Connectors في Lovable.
2. أضف `TWILIO_FROM_SMS` عبر إعدادات الأسرار.
3. من `/admin/notifications-queue` أنشئ رسالة تجريبية (channel: sms، recipient: رقمك)، ثم شغّل worker يدوياً أو انتظر cron.
4. أي فشل يظهر في عمود `last_error` بصيغة `Twilio SMS <status>: <body>`.

## أمان الإنتاج

قبل تشغيل حركة SMS إنتاجية:

- فعّل **SMS Pumping Protection** في لوحة Twilio.
- راجع **Geo Permissions** واسمح فقط للدول التي تخدمها (السعودية أساسياً).
- راقب الفواتير أسبوعياً في أول شهر.

## المراجع
- [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource)
- [Twilio SMS Pumping Protection](https://www.twilio.com/docs/messaging/features/sms-pumping-protection-programmable-messaging)