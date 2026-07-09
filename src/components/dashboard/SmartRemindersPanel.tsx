import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  BellRing,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileWarning,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  CheckCheck,
} from "lucide-react";
import { listMyRecentClaims } from "@/lib/expense-claims.functions";

const READ_STORAGE_KEY = (orgId: string | undefined) =>
  `aqari:reminders-read:${orgId ?? "anon"}`;

function loadReadIds(orgId: string | undefined): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY(orgId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(orgId: string | undefined, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      READ_STORAGE_KEY(orgId),
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    /* ignore quota errors */
  }
}

type Tone = "info" | "warn" | "danger" | "success";

type Reminder = {
  id: string;
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href?: string;
  ctaAr?: string;
  ctaEn?: string;
  timeAgoMs?: number;
};

const toneStyles: Record<
  Tone,
  { bg: string; border: string; icon: string; dot: string; label: { ar: string; en: string } }
> = {
  info: {
    bg: "bg-sky-500/8",
    border: "border-sky-500/25",
    icon: "text-sky-500",
    dot: "bg-sky-500",
    label: { ar: "قيد المعالجة", en: "In progress" },
  },
  warn: {
    bg: "bg-amber-500/8",
    border: "border-amber-500/30",
    icon: "text-amber-500",
    dot: "bg-amber-500",
    label: { ar: "بحاجة إلى إجراء", en: "Action needed" },
  },
  danger: {
    bg: "bg-rose-500/8",
    border: "border-rose-500/30",
    icon: "text-rose-500",
    dot: "bg-rose-500",
    label: { ar: "تنبيه", en: "Alert" },
  },
  success: {
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/25",
    icon: "text-emerald-500",
    dot: "bg-emerald-500",
    label: { ar: "مكتمل", en: "Completed" },
  },
};

function relativeTime(ms: number | undefined, isAr: boolean): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  if (s < 60) return isAr ? "الآن" : "just now";
  if (m < 60) return isAr ? `قبل ${m} د` : `${m}m ago`;
  if (h < 24) return isAr ? `قبل ${h} س` : `${h}h ago`;
  return isAr ? `قبل ${d} يوم` : `${d}d ago`;
}

export function SmartRemindersPanel({
  orgId,
  isAr,
}: {
  orgId: string | undefined;
  isAr: boolean;
}) {
  const claimsQ = useQuery({
    queryKey: ["my-recent-claims-reminders", orgId],
    queryFn: () => listMyRecentClaims({ data: { org_id: orgId!, limit: 25 } }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const reminders = useMemo<Reminder[]>(() => {
    const rows = claimsQ.data ?? [];
    const now = Date.now();
    const out: Reminder[] = [];

    for (const c of rows) {
      const status = String(c.status ?? "").toLowerCase();
      const created = c.submitted_at ?? c.created_at;
      const age = created ? now - new Date(created).getTime() : undefined;
      const shortId = c.claim_number ?? c.id.slice(0, 6);
      const title = c.title ?? "";

      if (status === "submitted" || status === "in_review" || status === "pending") {
        out.push({
          id: `review-${c.id}`,
          tone: "info",
          icon: Clock,
          titleAr: "تقريرك قيد المراجعة",
          titleEn: "Your report is under review",
          bodyAr: `المطالبة ${shortId}${title ? ` — ${title}` : ""} قيد المراجعة من قِبَل الفريق.`,
          bodyEn: `Claim ${shortId}${title ? ` — ${title}` : ""} is being reviewed by your team.`,
          href: "/dashboard/expenses",
          ctaAr: "عرض المطالبة",
          ctaEn: "View claim",
          timeAgoMs: age,
        });
      }

      if (status === "submitted" && !c.receipt_url) {
        out.push({
          id: `receipt-${c.id}`,
          tone: "warn",
          icon: ImageOff,
          titleAr: "يحتاج إلى إثبات إضافي",
          titleEn: "Needs additional proof",
          bodyAr: `المطالبة ${shortId} بدون إيصال مرفق — أضف صورة الإيصال لتسريع الموافقة.`,
          bodyEn: `Claim ${shortId} has no receipt attached — upload one to speed up approval.`,
          href: "/dashboard/expenses",
          ctaAr: "رفع إيصال",
          ctaEn: "Upload receipt",
          timeAgoMs: age,
        });
      }

      if (status === "rejected") {
        out.push({
          id: `rejected-${c.id}`,
          tone: "danger",
          icon: XCircle,
          titleAr: "تم رفض المطالبة",
          titleEn: "Claim rejected",
          bodyAr: `المطالبة ${shortId} تم رفضها — يمكنك تصحيحها وإعادة الإرسال.`,
          bodyEn: `Claim ${shortId} was rejected — you can correct it and resubmit.`,
          href: "/dashboard/expenses",
          ctaAr: "تصحيح وإعادة إرسال",
          ctaEn: "Correct & resubmit",
          timeAgoMs: age,
        });
      }

      if (status === "draft") {
        out.push({
          id: `draft-${c.id}`,
          tone: "warn",
          icon: FileWarning,
          titleAr: "مسودة لم تُرسل بعد",
          titleEn: "Unsubmitted draft",
          bodyAr: `لديك مسودة ${shortId} بحاجة إلى الإرسال.`,
          bodyEn: `Draft ${shortId} is waiting to be submitted.`,
          href: "/dashboard/expenses",
          ctaAr: "إكمال الإرسال",
          ctaEn: "Finish & submit",
          timeAgoMs: age,
        });
      }

      if (status === "approved" && age !== undefined && age < 3 * 24 * 60 * 60 * 1000) {
        out.push({
          id: `approved-${c.id}`,
          tone: "success",
          icon: CheckCircle2,
          titleAr: "تمت الموافقة على مطالبتك",
          titleEn: "Your claim was approved",
          bodyAr: `المطالبة ${shortId} تم اعتمادها.`,
          bodyEn: `Claim ${shortId} has been approved.`,
          href: "/dashboard/expenses",
          ctaAr: "عرض التفاصيل",
          ctaEn: "View details",
          timeAgoMs: age,
        });
      }

      if (
        (status === "submitted" || status === "in_review") &&
        age !== undefined &&
        age > 5 * 24 * 60 * 60 * 1000
      ) {
        out.push({
          id: `slow-${c.id}`,
          tone: "danger",
          icon: AlertTriangle,
          titleAr: "مراجعة متأخرة",
          titleEn: "Review is overdue",
          bodyAr: `المطالبة ${shortId} بانتظار الموافقة منذ أكثر من 5 أيام — تواصل مع المدير.`,
          bodyEn: `Claim ${shortId} has been awaiting review for over 5 days — nudge your manager.`,
          href: "/dashboard/expenses",
          ctaAr: "متابعة",
          ctaEn: "Follow up",
          timeAgoMs: age,
        });
      }
    }

    // Priority: danger > warn > info > success, then most recent first.
    const rank: Record<Tone, number> = { danger: 0, warn: 1, info: 2, success: 3 };
    out.sort(
      (a, b) => rank[a.tone] - rank[b.tone] || (a.timeAgoMs ?? 0) - (b.timeAgoMs ?? 0),
    );
    return out.slice(0, 6);
  }, [claimsQ.data]);

  const Chevron = isAr ? ChevronLeft : ChevronRight;

  return (
    <section
      dir={isAr ? "rtl" : "ltr"}
      className="rounded-2xl border bg-card/60 p-4 shadow-sm backdrop-blur"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <BellRing className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold">
              {isAr ? "التذكيرات الذكية" : "Smart reminders"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {isAr
                ? "تحديثات مخصّصة عن مطالباتك ومراجعاتك"
                : "Personalised updates about your claims"}
            </p>
          </div>
        </div>
        {reminders.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3" />
            {reminders.length}
          </span>
        )}
      </header>

      {claimsQ.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : reminders.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed py-8 text-center">
          <CheckCircle2 className="size-6 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold">
            {isAr ? "لا توجد تذكيرات حالياً" : "You're all caught up"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isAr ? "سنُخبرك عند وجود أي تحديث." : "We'll let you know when something needs you."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {reminders.map((r, idx) => {
            const s = toneStyles[r.tone];
            const Icon = r.icon;
            const time = relativeTime(r.timeAgoMs, isAr);
            const inner = (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.25, ease: "easeOut" }}
                className={`group relative flex items-start gap-3 rounded-xl border ${s.border} ${s.bg} p-3 transition hover:shadow-sm`}
              >
                <span
                  aria-hidden
                  className={`absolute top-3 ${isAr ? "left-3" : "right-3"} size-2 rounded-full ${s.dot}`}
                />
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg bg-background/70 ring-1 ring-inset ring-border ${s.icon}`}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-semibold leading-tight">
                      {isAr ? r.titleAr : r.titleEn}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full border ${s.border} ${s.bg} ${s.icon} px-1.5 py-0.5 text-[10px] font-bold`}
                    >
                      {isAr ? s.label.ar : s.label.en}
                    </span>
                    {time && (
                      <span className="text-[11px] text-muted-foreground">· {time}</span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {isAr ? r.bodyAr : r.bodyEn}
                  </p>
                  {r.href && (
                    <div
                      className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${s.icon} opacity-90 group-hover:opacity-100`}
                    >
                      {isAr ? r.ctaAr : r.ctaEn}
                      <Chevron className="size-3.5" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
            return (
              <li key={r.id}>
                {r.href ? (
                  <Link to={r.href} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
