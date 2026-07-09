import { createFileRoute, Link } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { KeyRound, Smartphone, LockKeyhole } from "lucide-react";

export const Route = createFileRoute("/_authenticated/portal/settings/security")({
  head: () => portalHead({ titleAr: 'الأمان', titleEn: 'Security', descAr: 'كلمة المرور، المصادقة الثنائية، والأجهزة.', path: '/portal/settings/security' }),
  component: SecuritySettings,
});

function SecuritySettings() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const items = [
    {
      icon: LockKeyhole,
      ar: "تغيير كلمة المرور",
      en: "Change password",
      arSub: "آخر تحديث منذ 30 يوم",
      enSub: "Last updated 30d ago",
      to: "/auth",
    },
    {
      icon: Fingerprint,
      ar: "التحقق بخطوتين",
      en: "Two-factor auth",
      arSub: "غير مفعّل",
      enSub: "Not enabled",
      to: "/auth",
    },
    {
      icon: Smartphone,
      ar: "الأجهزة الموثوقة",
      en: "Trusted devices",
      arSub: "إدارة الجلسات النشطة",
      enSub: "Manage active sessions",
      to: "/security/sessions",
    },
    {
      icon: KeyRound,
      ar: "مفاتيح API",
      en: "API keys",
      arSub: "للتكامل الخارجي",
      enSub: "For external integrations",
      to: "/admin/policies",
    },
  ];
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <Link
          key={it.en}
          to={it.to}
          className="surface-card group flex items-center gap-4 p-4 transition hover:border-primary/40"
        >
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-110">
            <it.icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{isAr ? it.ar : it.en}</div>
            <div className="truncate text-xs text-muted-foreground">
              {isAr ? it.arSub : it.enSub}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
