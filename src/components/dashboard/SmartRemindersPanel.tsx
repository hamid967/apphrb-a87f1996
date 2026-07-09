import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
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
  BellOff,
  Settings2,
  Undo2,
  Upload,
  Loader2,
  Paperclip,
} from "lucide-react";
import {
  listMyRecentClaims,
  createReceiptUploadUrl,
  attachReceiptToClaim,
} from "@/lib/expense-claims.functions";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useReminderPreferences,
  categoryFromReminderId,
  frequencyToMs,
} from "@/lib/reminder-preferences";
import { useAuth } from "@/hooks/use-auth";

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

const SNOOZE_STORAGE_KEY = (orgId: string | undefined) =>
  `aqari:reminders-snoozed:${orgId ?? "anon"}`;

type SnoozeMap = Record<string, number>; // id -> epoch ms when snooze ends

function loadSnoozed(orgId: string | undefined): SnoozeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY(orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSnoozed(orgId: string | undefined, map: SnoozeMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNOOZE_STORAGE_KEY(orgId), JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

const SNOOZE_OPTIONS: { hours: number; ar: string; en: string }[] = [
  { hours: 4, ar: "٤ ساعات", en: "4 hours" },
  { hours: 24, ar: "يوم واحد", en: "1 day" },
  { hours: 72, ar: "٣ أيام", en: "3 days" },
  { hours: 168, ar: "أسبوع", en: "1 week" },
];

function formatUntil(untilMs: number, isAr: boolean): string {
  const diff = untilMs - Date.now();
  if (diff <= 0) return "";
  const h = Math.round(diff / 3_600_000);
  const d = Math.round(h / 24);
  if (h < 24) return isAr ? `${h} س` : `${h}h`;
  return isAr ? `${d} يوم` : `${d}d`;
}

type Tone = "info" | "warn" | "danger" | "success";

type ReminderAction = {
  labelAr: string;
  labelEn: string;
  href: string;
  primary?: boolean;
};

type ReminderDetail = {
  labelAr: string;
  labelEn: string;
  valueAr: string;
  valueEn: string;
  tone?: Tone;
};

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
  claimNumber?: string;
  claimId?: string;
  claimIsDraft?: boolean;
  canAttachReceipt?: boolean;
  reasonAr?: string;
  reasonEn?: string;
  missing?: ReminderDetail[];
  actions?: ReminderAction[];
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
  const { user } = useAuth();
  const prefs = useReminderPreferences(user?.id);
  const refetchMs = frequencyToMs(prefs.frequency);

  const claimsQ = useQuery({
    queryKey: ["my-recent-claims-reminders", orgId],
    queryFn: () => listMyRecentClaims({ data: { org_id: orgId!, limit: 25 } }),
    enabled: !!orgId,
    staleTime: refetchMs ?? 5 * 60_000,
    refetchInterval: refetchMs ?? false,
    refetchOnWindowFocus: prefs.frequency !== "off",
  });

  const allReminders = useMemo<Reminder[]>(() => {
    const rows = claimsQ.data ?? [];
    const now = Date.now();
    const out: Reminder[] = [];

    for (const c of rows) {
      const status = String(c.status ?? "").toLowerCase();
      const created = c.submitted_at ?? c.created_at;
      const age = created ? now - new Date(created).getTime() : undefined;
      const shortId = c.claim_number ?? c.id.slice(0, 6);
      const title = c.title ?? "";
      const correctionReason = (c as { correction_reason?: string | null })
        .correction_reason;
      const description = (c as { description?: string | null }).description;
      const amount = (c as { amount?: number | string | null }).amount;
      const currency = (c as { currency?: string | null }).currency ?? "SAR";
      const category = (c as { category?: string | null }).category;

      const missingCommon: ReminderDetail[] = [];
      if (!c.receipt_url) {
        missingCommon.push({
          labelAr: "إيصال",
          labelEn: "Receipt",
          valueAr: "لم يُرفَق",
          valueEn: "Not attached",
          tone: "warn",
        });
      }
      if (!description || String(description).trim() === "") {
        missingCommon.push({
          labelAr: "وصف",
          labelEn: "Description",
          valueAr: "ناقص",
          valueEn: "Missing",
          tone: "info",
        });
      }
      if (!category) {
        missingCommon.push({
          labelAr: "فئة",
          labelEn: "Category",
          valueAr: "غير محددة",
          valueEn: "Unset",
          tone: "info",
        });
      }
      if (amount === null || amount === undefined || Number(amount) <= 0) {
        missingCommon.push({
          labelAr: "المبلغ",
          labelEn: "Amount",
          valueAr: "غير صالح",
          valueEn: "Invalid",
          tone: "danger",
        });
      }

      const viewAction: ReminderAction = {
        labelAr: "عرض المطالبة",
        labelEn: "View claim",
        href: "/dashboard/expenses",
        primary: false,
      };
      const uploadReceiptAction: ReminderAction = {
        labelAr: "رفع إيصال",
        labelEn: "Upload receipt",
        href: "/dashboard/expenses",
        primary: true,
      };

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
          claimNumber: shortId,
          claimId: c.id,
          canAttachReceipt: !c.receipt_url,
          reasonAr: "بانتظار قرار المراجع.",
          reasonEn: "Awaiting the reviewer's decision.",
          missing: missingCommon,
          actions: [viewAction],
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
          claimNumber: shortId,
          claimId: c.id,
          canAttachReceipt: true,
          reasonAr: "لا يمكن اعتماد المطالبة بدون إيصال داعم.",
          reasonEn: "The claim can't be approved without a supporting receipt.",
          missing: [
            {
              labelAr: "إيصال",
              labelEn: "Receipt",
              valueAr: "لم يُرفَق",
              valueEn: "Not attached",
              tone: "warn",
            },
          ],
          actions: [uploadReceiptAction, viewAction],
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
          claimNumber: shortId,
          reasonAr: correctionReason
            ? `سبب الرفض: ${correctionReason}`
            : "رُفضت المطالبة دون سبب مذكور — راجع بياناتها.",
          reasonEn: correctionReason
            ? `Rejection reason: ${correctionReason}`
            : "The claim was rejected without a stated reason — review its details.",
          missing: missingCommon,
          actions: [
            {
              labelAr: "تصحيح وإعادة إرسال",
              labelEn: "Correct & resubmit",
              href: "/dashboard/expenses",
              primary: true,
            },
            viewAction,
          ],
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
          claimNumber: shortId,
          claimId: c.id,
          claimIsDraft: true,
          canAttachReceipt: !c.receipt_url,
          reasonAr: "لن تُراجَع هذه المطالبة قبل إرسالها.",
          reasonEn: "This claim won't be reviewed until you submit it.",
          missing: missingCommon,
          actions: [
            {
              labelAr: "إكمال الإرسال",
              labelEn: "Finish & submit",
              href: "/dashboard/expenses",
              primary: true,
            },
            viewAction,
          ],
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
          claimNumber: shortId,
          reasonAr: `اعتُمدت مطالبة ${shortId}${amount ? ` بمبلغ ${amount} ${currency}` : ""}.`,
          reasonEn: `Claim ${shortId}${amount ? ` for ${amount} ${currency}` : ""} was approved.`,
          actions: [viewAction],
        });
      }

      if (
        (status === "submitted" || status === "in_review") &&
        age !== undefined &&
        age > 5 * 24 * 60 * 60 * 1000
      ) {
        const days = Math.floor(age / (24 * 60 * 60 * 1000));
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
          claimNumber: shortId,
          reasonAr: `مضى على الإرسال ${days} يوماً دون قرار.`,
          reasonEn: `${days} days have passed without a decision.`,
          missing: missingCommon,
          actions: [viewAction],
        });
      }
    }



    // Priority: danger > warn > info > success, then most recent first.
    const rank: Record<Tone, number> = { danger: 0, warn: 1, info: 2, success: 3 };
    out.sort(
      (a, b) => rank[a.tone] - rank[b.tone] || (a.timeAgoMs ?? 0) - (b.timeAgoMs ?? 0),
    );
    return out;
  }, [claimsQ.data]);

  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  // Load persisted read state client-side (avoids SSR hydration mismatch).
  useEffect(() => {
    setReadIds(loadReadIds(orgId));
  }, [orgId]);

  // Prune read IDs that no longer correspond to any current reminder so
  // storage stays small over time.
  useEffect(() => {
    if (!allReminders.length || readIds.size === 0) return;
    const live = new Set(allReminders.map((r) => r.id));
    let changed = false;
    const next = new Set<string>();
    readIds.forEach((id) => {
      if (live.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) {
      setReadIds(next);
      saveReadIds(orgId, next);
    }
  }, [allReminders, readIds, orgId]);

  const markRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        saveReadIds(orgId, next);
        return next;
      });
    },
    [orgId],
  );

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      allReminders.forEach((r) => next.add(r.id));
      saveReadIds(orgId, next);
      return next;
    });
  }, [allReminders, orgId]);

  // Snooze state ---------------------------------------------------------
  const [snoozed, setSnoozed] = useState<SnoozeMap>({});
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    setSnoozed(loadSnoozed(orgId));
  }, [orgId]);

  // Tick every minute so snoozes expire without a manual refresh.
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Prune expired snoozes and ones for reminders that no longer exist.
  useEffect(() => {
    if (!Object.keys(snoozed).length) return;
    const live = new Set(allReminders.map((r) => r.id));
    let changed = false;
    const next: SnoozeMap = {};
    for (const [id, until] of Object.entries(snoozed)) {
      if (until > nowTick && (live.has(id) || allReminders.length === 0)) {
        next[id] = until;
      } else {
        changed = true;
      }
    }
    if (changed) {
      setSnoozed(next);
      saveSnoozed(orgId, next);
    }
  }, [snoozed, allReminders, nowTick, orgId]);

  const snoozeReminder = useCallback(
    (id: string, hours: number) => {
      setSnoozed((prev) => {
        const next = { ...prev, [id]: Date.now() + hours * 3_600_000 };
        saveSnoozed(orgId, next);
        return next;
      });
    },
    [orgId],
  );

  const unsnoozeReminder = useCallback(
    (id: string) => {
      setSnoozed((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        saveSnoozed(orgId, next);
        return next;
      });
    },
    [orgId],
  );

  const visibleReminders = useMemo(
    () =>
      allReminders
        .filter((r) => {
          if (readIds.has(r.id)) return false;
          const until = snoozed[r.id];
          if (until && until > nowTick) return false;
          const cat = categoryFromReminderId(r.id);
          if (cat && prefs.enabled[cat] === false) return false;
          return true;
        })
        .slice(0, 6),
    [allReminders, readIds, snoozed, nowTick, prefs.enabled],
  );

  const snoozedList = useMemo(
    () =>
      allReminders.filter((r) => {
        const until = snoozed[r.id];
        return until && until > nowTick;
      }),
    [allReminders, snoozed, nowTick],
  );

  // Fire a toast whenever a genuinely new reminder appears after mount.
  // Skips the initial hydration (so refreshes don't spam the user) and
  // ignores reminders that are already read/snoozed/filtered by prefs.
  const seenIdsRef = useRef<Set<string> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (claimsQ.isLoading) return;
    const currentIds = new Set(visibleReminders.map((r) => r.id));
    if (seenIdsRef.current === null) {
      seenIdsRef.current = currentIds;
      return;
    }
    const prev = seenIdsRef.current;
    const fresh = visibleReminders.filter((r) => !prev.has(r.id));
    seenIdsRef.current = currentIds;
    if (fresh.length === 0) return;

    const openExpenses = () => navigate({ to: "/dashboard/expenses" });

    if (fresh.length === 1) {
      const r = fresh[0];
      const fn =
        r.tone === "danger"
          ? toast.error
          : r.tone === "success"
            ? toast.success
            : r.tone === "warn"
              ? toast.warning
              : toast.info;
      fn(isAr ? r.titleAr : r.titleEn, {
        description: isAr ? r.bodyAr : r.bodyEn,
        action: {
          label: isAr ? "فتح المصروفات" : "Open expenses",
          onClick: openExpenses,
        },
      });
    } else {
      toast.info(
        isAr
          ? `${fresh.length} تذكيرات جديدة`
          : `${fresh.length} new reminders`,
        {
          description: isAr
            ? "تحقق من مطالباتك ومراجعاتك الأخيرة."
            : "Check your latest claims and reviews.",
          action: {
            label: isAr ? "فتح المصروفات" : "Open expenses",
            onClick: openExpenses,
          },
        },
      );
    }
  }, [visibleReminders, claimsQ.isLoading, isAr, navigate]);

  const [openReminder, setOpenReminder] = useState<Reminder | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const handleReceiptUpload = useCallback(
    async (file: File, reminder: Reminder) => {
      if (!reminder.claimId) return;
      const type = file.type || "application/octet-stream";
      const isImage = type.startsWith("image/");
      const isPdf = type === "application/pdf";
      if (!isImage && !isPdf) {
        toast.error(
          isAr ? "الملف يجب أن يكون صورة أو PDF" : "File must be an image or PDF",
        );
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(isAr ? "الحد الأقصى 10 ميجابايت" : "Maximum 10MB");
        return;
      }
      const toastId = toast.loading(
        isAr ? "جارٍ رفع الإيصال..." : "Uploading receipt...",
        { description: `${file.name} · 0%` },
      );
      try {
        setUploadingReceipt(true);
        setUploadPct(0);
        const { path, signedUrl } = await createReceiptUploadUrl({
          data: { filename: file.name, content_type: type },
        });
        // Upload via XHR to track progress.
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signedUrl);
          xhr.setRequestHeader("Content-Type", type);
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadPct(pct);
            toast.loading(
              isAr ? "جارٍ رفع الإيصال..." : "Uploading receipt...",
              { id: toastId, description: `${file.name} · ${pct}%` },
            );
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`upload_failed_${xhr.status}`));
          xhr.onerror = () => reject(new Error("upload_failed"));
          xhr.send(file);
        });

        await attachReceiptToClaim({
          data: {
            claim_id: reminder.claimId,
            receipt_url: path,
            submit: !!reminder.claimIsDraft,
          },
        });

        toast.success(
          reminder.claimIsDraft
            ? isAr
              ? "تم رفع الإيصال وإرسال المطالبة"
              : "Receipt uploaded and claim submitted"
            : isAr
              ? "تم رفع الإيصال ومرفقته بالمطالبة"
              : "Receipt uploaded and attached to the claim",
          { id: toastId },
        );
        // Refresh claims and close.
        await queryClient.invalidateQueries({ queryKey: ["my-recent-claims-reminders"] });
        setOpenReminder(null);
      } catch (err) {
        console.error("[reminder receipt upload]", err);
        toast.error(
          isAr ? "فشل رفع الإيصال" : "Receipt upload failed",
          { id: toastId },
        );
      } finally {
        setUploadingReceipt(false);
        setUploadPct(0);
        if (receiptInputRef.current) receiptInputRef.current.value = "";
      }
    },
    [isAr, queryClient],
  );

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
        <div className="flex items-center gap-2">
          {visibleReminders.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3" />
              {visibleReminders.length}
            </span>
          )}
          {visibleReminders.length > 1 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={isAr ? "تمييز الكل كمقروء" : "Mark all as read"}
            >
              <CheckCheck className="size-3" />
              {isAr ? "تمييز الكل" : "Mark all"}
            </button>
          )}
          <RouterLink
            to="/dashboard/settings/reminders"
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title={isAr ? "إعدادات التذكيرات" : "Reminder settings"}
          >
            <Settings2 className="size-3" />
            {isAr ? "الإعدادات" : "Settings"}
          </RouterLink>
        </div>
      </header>

      {claimsQ.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : visibleReminders.length === 0 ? (
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
          <AnimatePresence initial={false}>
            {visibleReminders.map((r, idx) => {
              const s = toneStyles[r.tone];
              const Icon = r.icon;
              const time = relativeTime(r.timeAgoMs, isAr);
              const body = (
                <div
                  className={`group relative flex items-start gap-3 rounded-xl border ${s.border} ${s.bg} p-3 transition hover:shadow-sm`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-3 ${isAr ? "left-9" : "right-9"} size-2 rounded-full ${s.dot}`}
                  />
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg bg-background/70 ring-1 ring-inset ring-border ${s.icon}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pe-6">
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
                  <div
                    className={`absolute top-2 ${isAr ? "left-2" : "right-2"} flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100`}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          aria-label={isAr ? "غفوة التذكير" : "Snooze reminder"}
                          title={isAr ? "غفوة" : "Snooze"}
                          className="grid size-6 place-items-center rounded-md border border-transparent bg-background/60 text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                        >
                          <BellOff className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align={isAr ? "start" : "end"}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuLabel className="text-[11px]">
                          {isAr ? "غفوة لمدة" : "Snooze for"}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {SNOOZE_OPTIONS.map((opt) => (
                          <DropdownMenuItem
                            key={opt.hours}
                            onSelect={(e) => {
                              e.preventDefault();
                              snoozeReminder(r.id, opt.hours);
                            }}
                          >
                            {isAr ? opt.ar : opt.en}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markRead(r.id);
                      }}
                      aria-label={isAr ? "تمييز كمقروء" : "Mark as read"}
                      title={isAr ? "تمييز كمقروء" : "Mark as read"}
                      className="grid size-6 place-items-center rounded-md border border-transparent bg-background/60 text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                    >
                      <Check className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: isAr ? -24 : 24, height: 0, marginTop: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.22, ease: "easeOut" }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenReminder(r)}
                    className="block w-full text-start"
                    aria-label={isAr ? "عرض تفاصيل التذكير" : "View reminder details"}
                  >
                    {body}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {snoozedList.length > 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/20 p-2">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <BellOff className="size-3" />
              {isAr
                ? `في وضع الغفوة (${snoozedList.length})`
                : `Snoozed (${snoozedList.length})`}
            </span>
          </div>
          <ul className="space-y-1">
            {snoozedList.slice(0, 3).map((r) => {
              const until = snoozed[r.id];
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-background/60"
                >
                  <span className="truncate">
                    {isAr ? r.titleAr : r.titleEn}
                    <span className="ms-1 opacity-70">
                      · {isAr ? "يعود بعد" : "back in"} {formatUntil(until, !!isAr)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => unsnoozeReminder(r.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 font-semibold text-foreground/80 transition hover:bg-background"
                    title={isAr ? "إلغاء الغفوة" : "Unsnooze"}
                  >
                    <Undo2 className="size-3" />
                    {isAr ? "إعادة" : "Restore"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog
        open={!!openReminder}
        onOpenChange={(o) => !o && setOpenReminder(null)}
      >
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md">
          {openReminder && (() => {
            const r = openReminder;
            const s = toneStyles[r.tone];
            const Icon = r.icon;
            return (
              <>
                <DialogHeader>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`grid size-9 place-items-center rounded-lg bg-background/70 ring-1 ring-inset ring-border ${s.icon}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border ${s.border} ${s.bg} ${s.icon} px-1.5 py-0.5 text-[10px] font-bold`}
                    >
                      {isAr ? s.label.ar : s.label.en}
                    </span>
                    {r.claimNumber && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        #{r.claimNumber}
                      </span>
                    )}
                  </div>
                  <DialogTitle className="text-base">
                    {isAr ? r.titleAr : r.titleEn}
                  </DialogTitle>
                  <DialogDescription>
                    {isAr ? r.bodyAr : r.bodyEn}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {(r.reasonAr || r.reasonEn) && (
                    <div
                      className={`rounded-lg border ${s.border} ${s.bg} p-3 text-sm`}
                    >
                      <p className={`text-[11px] font-bold ${s.icon}`}>
                        {isAr ? "السبب" : "Reason"}
                      </p>
                      <p className="mt-1 text-foreground/90">
                        {isAr ? r.reasonAr : r.reasonEn}
                      </p>
                    </div>
                  )}

                  {r.missing && r.missing.length > 0 && (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-[11px] font-bold text-muted-foreground">
                        {isAr ? "الحقول الناقصة أو التي تحتاج مراجعة" : "Missing or invalid fields"}
                      </p>
                      <ul className="space-y-1.5">
                        {r.missing.map((d, i) => {
                          const dt = toneStyles[d.tone ?? "warn"];
                          return (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="font-medium">
                                {isAr ? d.labelAr : d.labelEn}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full border ${dt.border} ${dt.bg} ${dt.icon} px-1.5 py-0.5 text-[10px] font-bold`}
                              >
                                {isAr ? d.valueAr : d.valueEn}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      markRead(r.id);
                      setOpenReminder(null);
                    }}
                  >
                    <Check className="me-1 size-3.5" />
                    {isAr ? "تمييز كمقروء" : "Mark as read"}
                  </Button>
                  {(r.actions ?? []).map((a, i) => (
                    <Button
                      key={i}
                      asChild
                      size="sm"
                      variant={a.primary ? "default" : "outline"}
                    >
                      <Link
                        to={a.href}
                        onClick={() => setOpenReminder(null)}
                      >
                        {isAr ? a.labelAr : a.labelEn}
                        <Chevron className="ms-1 size-3.5" />
                      </Link>
                    </Button>
                  ))}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </section>
  );
}
