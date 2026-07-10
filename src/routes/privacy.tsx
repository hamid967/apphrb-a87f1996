import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — HBSpro | Privacy Policy" },
      {
        name: "description",
        content:
          "سياسة الخصوصية لمنصة HBSpro: كيف نجمع بياناتك ونحميها ونستخدمها وفق أنظمة المملكة العربية السعودية.",
      },
      { property: "og:title", content: "سياسة الخصوصية — HBSpro" },
      {
        property: "og:description",
        content: "كيف تحمي HBSpro بياناتك وتلتزم بأنظمة حماية البيانات في المملكة.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://hrhbs.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/privacy" }],
  }),
  component: () => (
    <LegalPage
      titleAr="سياسة الخصوصية"
      titleEn="Privacy Policy"
      updatedAr="آخر تحديث: 10 يوليو 2026"
      updatedEn="Last updated: July 10, 2026"
      introAr="تحترم HBSpro خصوصية عملائها والتزامها بأنظمة حماية البيانات الشخصية في المملكة العربية السعودية (PDPL). توضّح هذه السياسة أنواع البيانات التي نجمعها، وكيف نستخدمها، وحقوقك تجاهها."
      introEn="HBSpro respects customer privacy and complies with the Saudi Personal Data Protection Law (PDPL). This policy explains what data we collect, how we use it, and your rights over it."
      sections={[
        {
          headingAr: "البيانات التي نجمعها",
          headingEn: "Data we collect",
          bodyAr:
            "بيانات الحساب (الاسم، البريد، الجوال، الشركة)، بيانات الاستخدام (سجلات الدخول، تفاعلات المنصة)، بيانات مالية (فواتير، مدفوعات، إيصالات تحويل بنكي)، وبيانات المستأجرين والملاك التي تُدخلها في المنصة كمسؤول عن التحكم فيها.",
          bodyEn:
            "Account data (name, email, phone, company), usage data (logins, platform interactions), financial data (invoices, payments, bank-transfer receipts), and tenant/owner data you enter into the platform as data controller.",
        },
        {
          headingAr: "كيف نستخدم بياناتك",
          headingEn: "How we use your data",
          bodyAr:
            "لتشغيل خدمات المنصة، إرسال الإشعارات التشغيلية، إصدار الفواتير الإلكترونية عبر ZATCA، وتحسين الأداء. لا نبيع بياناتك ولا نشاركها لأغراض تسويقية خارجية.",
          bodyEn:
            "To operate platform services, send operational notifications, issue ZATCA e-invoices, and improve performance. We do not sell your data or share it for external marketing.",
        },
        {
          headingAr: "التخزين والأمان",
          headingEn: "Storage and security",
          bodyAr:
            "تُخزَّن البيانات على بنية سحابية بمعايير أمان مرتفعة تشمل التشفير أثناء النقل والتخزين، وعزل بيانات كل شركة عبر Row-Level Security، والتحقق الثنائي الإجباري لحسابات المدراء.",
          bodyEn:
            "Data is stored on a hardened cloud with in-transit and at-rest encryption, per-tenant isolation via Row-Level Security, and mandatory 2FA for admin accounts.",
        },
        {
          headingAr: "مشاركة البيانات مع أطراف ثالثة",
          headingEn: "Third-party sharing",
          bodyAr:
            "نستخدم مزودين موثوقين لخدمات محددة (البريد، الرسائل، فوترة ZATCA). يخضع كل مزود لاتفاقية معالجة بيانات تلتزم بأنظمة PDPL.",
          bodyEn:
            "We use trusted vendors for specific services (email, SMS, ZATCA e-invoicing). Each vendor is bound by a data-processing agreement compliant with PDPL.",
        },
        {
          headingAr: "حقوقك",
          headingEn: "Your rights",
          bodyAr:
            "لك الحق في الوصول لبياناتك، تصحيحها، حذفها، أو تصدير نسخة منها. لتقديم أي طلب راسلنا على privacy@hrhbs.com وسنرد خلال 30 يوماً.",
          bodyEn:
            "You may access, correct, delete, or export your data. Email privacy@hrhbs.com and we will respond within 30 days.",
        },
        {
          headingAr: "ملفات تعريف الارتباط",
          headingEn: "Cookies",
          bodyAr: "راجع صفحة سياسة الكوكيز لمعرفة تفاصيل ملفات تعريف الارتباط التي نستخدمها.",
          bodyEn: "See our Cookies Policy for the full list of cookies we use.",
        },
        {
          headingAr: "التحديثات على هذه السياسة",
          headingEn: "Updates to this policy",
          bodyAr:
            "قد نحدّث هذه السياسة من وقت لآخر. سنُعلمك بأي تغيير جوهري عبر البريد الإلكتروني أو داخل المنصة.",
          bodyEn:
            "We may update this policy from time to time. We will notify you of material changes via email or in-app.",
        },
      ]}
    />
  ),
});
