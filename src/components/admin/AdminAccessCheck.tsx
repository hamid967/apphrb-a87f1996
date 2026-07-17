import { Link } from "@tanstack/react-router";
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  UserX,
  RefreshCw,
  Home,
  LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminAccessResult, AdminAccessReason } from "@/lib/admin-guard.functions";

type Copy = {
  icon: typeof ShieldAlert;
  title: string;
  body: string;
  fixes: string[];
  primary?: { label: string; to: string };
};

function copyFor(reason: AdminAccessReason): Copy {
  switch (reason) {
    case "missing_super_admin":
      return {
        icon: UserX,
        title: "لا تملك صلاحية super_admin",
        body: "هذه المنطقة مخصّصة لمشرفي النظام فقط. حسابك مسجّل لكنه لا يملك دور super_admin.",
        fixes: [
          "تواصل مع مشرف النظام لمنحك دور super_admin من لوحة إدارة الأدوار.",
          "إن كنت تحاول الدخول بحساب مشرف، سجّل خروجك وأعد الدخول بالحساب الصحيح.",
        ],
        primary: { label: "العودة إلى لوحة التحكم", to: "/dashboard" },
      };
    case "aal2_required":
      return {
        icon: KeyRound,
        title: "التحقق بخطوتين (2FA) غير مكتمل",
        body: "دخول لوحة الإدارة يستلزم تسجيل دخول من المستوى الثاني (AAL2) عبر رمز TOTP.",
        fixes: [
          "افتح إعدادات الأمان وفعّل التحقق بخطوتين إن لم يكن مفعّلاً.",
          "سجّل خروجك ثم أعد الدخول، وأدخل رمز TOTP عندما يُطلب منك.",
        ],
        primary: { label: "إعدادات الأمان", to: "/dashboard/settings/security" },
      };
    case "role_check_failed":
      return {
        icon: ShieldAlert,
        title: "تعذّر التحقق من الدور",
        body: "حدث خطأ أثناء الاتصال بخدمة الأدوار. أعد المحاولة بعد قليل.",
        fixes: [
          "تحقّق من اتصالك بالإنترنت ثم اضغط إعادة المحاولة.",
          "إن استمرت المشكلة، تواصل مع الدعم الفني.",
        ],
      };
    case "not_signed_in":
      return {
        icon: UserX,
        title: "لست مسجّل الدخول",
        body: "سجّل الدخول بحساب مشرف لعرض هذه الشاشة.",
        fixes: ["اضغط زر الدخول للانتقال إلى صفحة تسجيل الدخول."],
        primary: { label: "تسجيل الدخول", to: "/auth" },
      };
    default:
      return {
        icon: ShieldAlert,
        title: "الوصول محدود",
        body: "لا يمكنك الوصول إلى لوحة الإدارة حالياً.",
        fixes: ["راجع الحساب والصلاحيات ثم أعد المحاولة."],
      };
  }
}

export function AdminAccessCheck({
  result,
  onRetry,
}: {
  result: AdminAccessResult;
  onRetry?: () => void;
}) {
  const copy = copyFor(result.reason);
  const Icon = copy.icon;

  return (
    <div className="min-h-dvh w-full flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-lg border-destructive/30">
        <CardContent className="pt-8 pb-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <Icon className="size-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">{copy.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-xs space-y-2">
            <Row label="السبب">
              <code className="font-mono text-[11px]">{result.reason}</code>
            </Row>
            {result.email && (
              <Row label="الحساب">
                <span className="font-mono text-[11px]">{result.email}</span>
              </Row>
            )}
            <Row label="super_admin">
              {result.hasSuperAdmin ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <ShieldCheck className="size-3.5" /> نعم
                </span>
              ) : (
                <span className="text-destructive">لا</span>
              )}
            </Row>
            <Row label="مستوى المصادقة (AAL)">
              <code className="font-mono text-[11px]">{result.aal ?? "—"}</code>
            </Row>
            {result.detail && (
              <Row label="تفاصيل">
                <span className="text-[11px] text-muted-foreground">{result.detail}</span>
              </Row>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">كيف تصحّح ذلك؟</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {copy.fixes.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {copy.primary && (
              <Button asChild>
                <Link to={copy.primary.to as never}>{copy.primary.label}</Link>
              </Button>
            )}
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="size-4 me-1" />{t("common.retry")}</Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/">
                <Home className="size-4 me-1" />
                الرئيسية
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
