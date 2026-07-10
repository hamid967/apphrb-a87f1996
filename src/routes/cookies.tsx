import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "سياسة الكوكيز — HBSpro | Cookies Policy" },
      {
        name: "description",
        content:
          "كيف تستخدم HBSpro ملفات تعريف الارتباط لتحسين تجربة الاستخدام وحفظ التفضيلات وقياس الأداء.",
      },
      { property: "og:title", content: "سياسة الكوكيز — HBSpro" },
      {
        property: "og:description",
        content: "ملفات تعريف الارتباط المستخدمة في منصة HBSpro وكيفية إدارتها.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://hrhbs.com/cookies" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/cookies" }],
  }),
  component: () => (
    <LegalPage
      titleAr="سياسة ملفات تعريف الارتباط"
      titleEn="Cookies Policy"
      updatedAr="آخر تحديث: 10 يوليو 2026"
      updatedEn="Last updated: July 10, 2026"
      introAr="تستخدم HBSpro ملفات تعريف الارتباط (Cookies) لتشغيل المنصة، حفظ تفضيلاتك، وقياس الأداء. هذه الصفحة توضّح الأنواع المستخدمة وكيف يمكنك التحكم بها."
      introEn="HBSpro uses cookies to operate the platform, remember your preferences, and measure performance. This page explains the types we use and how you can control them."
      sections={[
        {
          headingAr: "الكوكيز الضرورية",
          headingEn: "Essential cookies",
          bodyAr:
            "لازمة لعمل المنصة (جلسة الدخول، حماية CSRF، اختيار اللغة). لا يمكن إيقافها لأن المنصة لن تعمل بدونها.",
          bodyEn:
            "Required for the platform to function (login session, CSRF protection, language choice). These cannot be disabled.",
        },
        {
          headingAr: "كوكيز التفضيلات",
          headingEn: "Preference cookies",
          bodyAr:
            "تحفظ اختياراتك مثل اللغة، الوضع الليلي، وترتيب الأعمدة في الجداول.",
          bodyEn:
            "Store your choices such as language, dark mode, and table column order.",
        },
        {
          headingAr: "كوكيز التحليل",
          headingEn: "Analytics cookies",
          bodyAr:
            "تساعدنا على فهم كيفية استخدام المنصة بشكل مجمّع (بدون ربطها بهويتك) لتحسين الأداء والميزات.",
          bodyEn:
            "Help us understand aggregated platform usage (never tied to your identity) to improve performance and features.",
        },
        {
          headingAr: "كوكيز الطرف الثالث",
          headingEn: "Third-party cookies",
          bodyAr:
            "لا نضع كوكيز إعلانية. الكوكيز الوحيدة من أطراف ثالثة هي من مزودي البنية التحتية (المصادقة، مكافحة الاحتيال).",
          bodyEn:
            "We do not set advertising cookies. The only third-party cookies come from infrastructure providers (authentication, anti-fraud).",
        },
        {
          headingAr: "التحكم بالكوكيز",
          headingEn: "Managing cookies",
          bodyAr:
            "يمكنك تعطيل الكوكيز غير الضرورية من إعدادات المتصفح. تعطيل الضرورية سيمنعك من تسجيل الدخول.",
          bodyEn:
            "You can disable non-essential cookies from your browser settings. Disabling essential cookies will prevent you from signing in.",
        },
      ]}
    />
  ),
});
