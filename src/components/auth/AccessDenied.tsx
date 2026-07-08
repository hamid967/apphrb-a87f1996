import { Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft, LifeBuoy, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AccessDeniedProps = {
  title?: string;
  reason?: string;
  requiredPermission?: string;
  scopeLabel?: string;
  recommendations?: string[];
};

/**
 * Unified access-denied screen used by route guards and inline permission
 * fallbacks. Explains why access was denied and what to do next.
 */
export function AccessDenied({
  title = "الوصول محدود",
  reason = "ليست لديك الصلاحية اللازمة لعرض هذه الصفحة.",
  requiredPermission,
  scopeLabel,
  recommendations,
}: AccessDeniedProps) {
  const reasonKey = (reason ?? "").toLowerCase();
  const isBilling =
    reasonKey.includes("expired") ||
    reasonKey.includes("subscription") ||
    reasonKey.includes("اشتراك") ||
    reasonKey.includes("منتهي") ||
    reasonKey.includes("فوترة");
  const tips =
    recommendations ??
    (isBilling
      ? [
          "اشتراك المؤسسة منتهي — جدّده لإعادة تفعيل لوحة التحكم بالكامل.",
          "إن كانت لديك مشكلة في الدفع، تواصل مع الدعم الفني.",
        ]
      : [
          "تواصل مع مدير المؤسسة لطلب الدور أو الصلاحية المناسبة.",
          "تأكّد أنك مسجّل الدخول بالحساب والمؤسسة الصحيحين.",
          "عد إلى لوحة التحكم لمتابعة العمل بالأدوات المتاحة لك.",
        ]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-4 text-destructive">
        <ShieldAlert className="h-9 w-9" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
      </div>

      {(requiredPermission || scopeLabel) && (
        <div className="w-full rounded-lg border bg-muted/40 p-4 text-left text-xs text-muted-foreground">
          {requiredPermission && (
            <div className="flex items-center justify-between gap-4">
              <span>Required permission</span>
              <code className="rounded bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
                {requiredPermission}
              </code>
            </div>
          )}
          {scopeLabel && (
            <div className="mt-2 flex items-center justify-between gap-4">
              <span>Scope</span>
              <code className="rounded bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
                {scopeLabel}
              </code>
            </div>
          )}
        </div>
      )}

      <ul className="w-full space-y-2 text-left text-sm text-muted-foreground">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-2">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {isBilling ? (
          <>
            <Button asChild>
              <Link to={"/dashboard/settings/billing" as never}>
                <CreditCard className="me-2 h-4 w-4" />
                تجديد الاشتراك
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">العودة إلى لوحة التحكم</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild>
              <Link to="/dashboard">
                <ArrowLeft className="me-2 h-4 w-4" />
                العودة إلى لوحة التحكم
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={"/team" as never}>طلب صلاحية</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
