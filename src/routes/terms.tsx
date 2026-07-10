import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "شروط الاستخدام — HBSpro | Terms of Service" },
      {
        name: "description",
        content:
          "شروط استخدام منصة HBSpro لإدارة الأملاك: الاشتراكات، الدفع البنكي، الاستخدام المسموح، وحدود المسؤولية.",
      },
      { property: "og:title", content: "شروط الاستخدام — HBSpro" },
      {
        property: "og:description",
        content: "شروط استخدام منصة HBSpro لإدارة الأملاك في المملكة العربية السعودية.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://hrhbs.com/terms" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/terms" }],
  }),
  component: () => (
    <LegalPage
      titleAr="شروط الاستخدام"
      titleEn="Terms of Service"
      updatedAr="آخر تحديث: 10 يوليو 2026"
      updatedEn="Last updated: July 10, 2026"
      introAr="باستخدامك لمنصة HBSpro فإنك توافق على هذه الشروط. يرجى قراءتها بعناية قبل إنشاء حسابك أو دفع أي اشتراك."
      introEn="By using HBSpro you agree to these terms. Please read them carefully before creating an account or paying a subscription."
      sections={[
        {
          headingAr: "الحساب والاشتراك",
          headingEn: "Account and subscription",
          bodyAr:
            "يُنشأ الحساب باسم شركة واحدة. تُدفع الاشتراكات عبر التحويل البنكي ثم تُفعَّل بعد اعتماد المسؤول العام. لا نقبل مدفوعات بطاقات ائتمانية عبر بوابات دفع إلكترونية.",
          bodyEn:
            "Each account is registered to one company. Subscriptions are paid via bank transfer and activated after super-admin approval. We do not accept card payments through online gateways.",
        },
        {
          headingAr: "الاستخدام المسموح",
          headingEn: "Acceptable use",
          bodyAr:
            "يُمنع استخدام المنصة لأي نشاط مخالف للأنظمة السعودية، أو محاولة الوصول لبيانات شركات أخرى، أو إعادة بيع الخدمة دون إذن مكتوب.",
          bodyEn:
            "You may not use the platform for activities violating Saudi law, attempt to access other tenants' data, or resell the service without written permission.",
        },
        {
          headingAr: "ملكية البيانات",
          headingEn: "Data ownership",
          bodyAr:
            "أنت المالك لبيانات شركتك. تحتفظ HBSpro بحق تخزينها ومعالجتها لتقديم الخدمة فقط. يمكنك تصديرها في أي وقت.",
          bodyEn:
            "You own your company's data. HBSpro retains the right to store and process it only to deliver the service. You may export it at any time.",
        },
        {
          headingAr: "الفوترة الإلكترونية والامتثال",
          headingEn: "E-invoicing and compliance",
          bodyAr:
            "تلتزم HBSpro بمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) للمرحلة الثانية من الفوترة الإلكترونية. أنت مسؤول عن صحة البيانات الضريبية لشركتك.",
          bodyEn:
            "HBSpro complies with ZATCA Phase-2 e-invoicing. You remain responsible for the accuracy of your company's tax data.",
        },
        {
          headingAr: "التعليق والإنهاء",
          headingEn: "Suspension and termination",
          bodyAr:
            "نحتفظ بحق تعليق أو إنهاء الحسابات المخالفة للشروط أو المتأخرة عن السداد لأكثر من 30 يوماً. تظل بياناتك متاحة للتصدير لمدة 60 يوماً بعد الإنهاء.",
          bodyEn:
            "We may suspend or terminate accounts that violate these terms or are overdue by more than 30 days. Your data remains available for export for 60 days after termination.",
        },
        {
          headingAr: "حدود المسؤولية",
          headingEn: "Limitation of liability",
          bodyAr:
            "تُقدَّم الخدمة \"كما هي\". لا نتحمل مسؤولية الأضرار غير المباشرة الناتجة عن انقطاع الخدمة أو فقدان البيانات بسبب عوامل خارج سيطرتنا.",
          bodyEn:
            "The service is provided \"as is\". We are not liable for indirect damages resulting from service interruptions or data loss caused by factors outside our control.",
        },
        {
          headingAr: "القانون الحاكم",
          headingEn: "Governing law",
          bodyAr:
            "تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وأي نزاع يُحال إلى المحاكم المختصة في مدينة الرياض.",
          bodyEn:
            "These terms are governed by the laws of the Kingdom of Saudi Arabia. Any dispute shall be referred to the competent courts in Riyadh.",
        },
      ]}
    />
  ),
});
