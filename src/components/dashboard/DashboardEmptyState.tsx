import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Rocket, ArrowRight, ArrowLeft, CheckCircle2, Circle, Building2, UserRound, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Step = { key: string; done: boolean };

export function DashboardEmptyState({
  isAr,
  steps,
  orgName,
}: {
  isAr: boolean;
  steps: Step[];
  orgName?: string | null;
}) {
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const total = steps.length || 3;
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / total) * 100);

  const stepMeta: Record<string, { ar: string; en: string; icon: typeof UserRound }> = {
    profile: { ar: "بيانات الملف الشخصي", en: "Profile details", icon: UserRound },
    company: { ar: "بيانات الشركة", en: "Company details", icon: Building2 },
    first_receipt: { ar: "أول إيصال أو عقار", en: "First receipt or property", icon: Receipt },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-3xl px-4 py-16 sm:px-6"
    >
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Rocket className="size-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {isAr ? "لوحتك جاهزة — تنقصها البيانات فقط" : "Your dashboard is ready — just missing your data"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isAr
                ? `أكمل الخطوات التالية${orgName ? ` لتفعيل ${orgName}` : ""} وستملأ اللوحة بالمؤشرات والخرائط والتحليلات تلقائيًا.`
                : `Finish the steps below${orgName ? ` to activate ${orgName}` : ""} and the dashboard will fill with metrics, maps, and analytics automatically.`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">
              {isAr ? `تم إنجاز ${done} من ${total}` : `${done} of ${total} complete`}
            </span>
            <span className="text-primary">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
            />
          </div>
        </div>

        {/* Steps */}
        <ul className="mt-6 grid gap-2 sm:grid-cols-3">
          {steps.map((s) => {
            const meta = stepMeta[s.key] ?? { ar: s.key, en: s.key, icon: Circle };
            const Icon = s.done ? CheckCircle2 : meta.icon;
            return (
              <li
                key={s.key}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-sm ${
                  s.done
                    ? "border-success/30 bg-success/5 text-success dark:text-success"
                    : "border-border/60 bg-card/40"
                }`}
              >
                <Icon className={`size-4 ${s.done ? "text-success" : "text-muted-foreground"}`} />
                <span className="font-medium">{isAr ? meta.ar : meta.en}</span>
              </li>
            );
          })}
        </ul>

        {/* Actions */}
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "يستغرق الأمر أقل من دقيقتين — يمكنك التعديل لاحقًا."
              : "Takes less than 2 minutes — you can edit anything later."}
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link to="/onboarding/wizard">
              {isAr ? "أكمل الإعداد الآن" : "Complete setup now"}
              <Arrow className="size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
