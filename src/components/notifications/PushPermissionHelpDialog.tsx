/**
 * Dialog with browser-specific, bilingual instructions for re-enabling
 * Web Push notifications after the user has blocked (or dismissed) the
 * permission prompt. Also surfaces alternatives (email/in-app inbox).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  BellOff,
  Chrome,
  Compass,
  Flame,
  Info,
  Mail,
  Smartphone,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Browser = "chrome" | "edge" | "firefox" | "safari" | "safari-ios" | "other";

function detectBrowser(ua: string): Browser {
  const s = ua.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(s);
  if (isIOS) return "safari-ios";
  if (s.includes("edg/")) return "edge";
  if (s.includes("firefox")) return "firefox";
  if (s.includes("chrome") || s.includes("crios")) return "chrome";
  if (s.includes("safari")) return "safari";
  return "other";
}

type Step = { ar: string; en: string };

const STEPS: Record<Browser, { icon: React.ReactNode; title: { ar: string; en: string }; steps: Step[] }> = {
  chrome: {
    icon: <Chrome className="size-4" />,
    title: { ar: "Google Chrome", en: "Google Chrome" },
    steps: [
      { ar: "اضغط على أيقونة القفل 🔒 بجوار عنوان الموقع في شريط العنوان.", en: "Click the lock 🔒 icon next to the site URL in the address bar." },
      { ar: "اختر «إعدادات الموقع» (Site settings).", en: "Choose \"Site settings\"." },
      { ar: "غيّر «الإشعارات» (Notifications) إلى «السماح» (Allow).", en: "Change \"Notifications\" to \"Allow\"." },
      { ar: "أعد تحميل الصفحة ثم اضغط «تفعيل» مرة أخرى.", en: "Reload the page then click \"Enable\" again." },
    ],
  },
  edge: {
    icon: <Compass className="size-4" />,
    title: { ar: "Microsoft Edge", en: "Microsoft Edge" },
    steps: [
      { ar: "اضغط على أيقونة القفل 🔒 في شريط العنوان.", en: "Click the lock 🔒 in the address bar." },
      { ar: "اختر «أذونات هذا الموقع» (Permissions for this site).", en: "Choose \"Permissions for this site\"." },
      { ar: "اضبط «الإشعارات» إلى «السماح».", en: "Set \"Notifications\" to \"Allow\"." },
      { ar: "أعد تحميل الصفحة وحاول التفعيل من جديد.", en: "Reload and try enabling again." },
    ],
  },
  firefox: {
    icon: <Flame className="size-4" />,
    title: { ar: "Mozilla Firefox", en: "Mozilla Firefox" },
    steps: [
      { ar: "اضغط على أيقونة الأذونات (القفل) في شريط العنوان.", en: "Click the permissions (lock) icon in the address bar." },
      { ar: "أزل حالة «محظور» بجوار «إرسال الإشعارات».", en: "Clear the \"Blocked\" status next to \"Send Notifications\"." },
      { ar: "أعد تحميل الصفحة، وعند الطلب اختر «السماح».", en: "Reload the page and choose \"Allow\" when prompted." },
    ],
  },
  safari: {
    icon: <Compass className="size-4" />,
    title: { ar: "Safari (macOS)", en: "Safari (macOS)" },
    steps: [
      { ar: "من شريط القوائم: Safari → الإعدادات (Settings).", en: "Menu bar: Safari → Settings." },
      { ar: "افتح تبويب «مواقع الويب» (Websites) → «الإشعارات» (Notifications).", en: "Open the \"Websites\" tab → \"Notifications\"." },
      { ar: "اختر هذا الموقع واضبطه على «السماح» (Allow).", en: "Find this site and set it to \"Allow\"." },
      { ar: "أعد تحميل الصفحة ثم اضغط «تفعيل».", en: "Reload the page then click \"Enable\"." },
    ],
  },
  "safari-ios": {
    icon: <Smartphone className="size-4" />,
    title: { ar: "Safari على iPhone / iPad", en: "Safari on iPhone / iPad" },
    steps: [
      { ar: "يتطلب iOS 16.4 أو أحدث، ويجب إضافة الموقع إلى الشاشة الرئيسية أولًا.", en: "Requires iOS 16.4 or newer, and the site must be added to the Home Screen first." },
      { ar: "افتح Safari → أيقونة المشاركة ⎋ → «إضافة إلى الشاشة الرئيسية».", en: "Open Safari → Share ⎋ → \"Add to Home Screen\"." },
      { ar: "افتح التطبيق من الشاشة الرئيسية ثم اضغط «تفعيل».", en: "Launch it from the Home Screen, then tap \"Enable\"." },
      { ar: "لو رُفض الإذن سابقًا: الإعدادات → الإشعارات → اختر التطبيق → فعّل «السماح بالإشعارات».", en: "If previously denied: Settings → Notifications → select the app → enable \"Allow Notifications\"." },
    ],
  },
  other: {
    icon: <Info className="size-4" />,
    title: { ar: "متصفح آخر", en: "Other browser" },
    steps: [
      { ar: "افتح إعدادات الموقع من شريط العنوان (عادةً أيقونة القفل).", en: "Open site settings from the address bar (usually a lock icon)." },
      { ar: "ابحث عن «الإشعارات» واضبطها على «السماح».", en: "Find \"Notifications\" and set it to \"Allow\"." },
      { ar: "أعد تحميل الصفحة ثم أعد المحاولة.", en: "Reload the page and try again." },
    ],
  },
};

export function PushPermissionHelpDialog({
  open,
  onOpenChange,
  reason = "denied",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: "denied" | "dismissed" | "unsupported";
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const browser = useMemo(
    () => (typeof navigator === "undefined" ? "other" : detectBrowser(navigator.userAgent)),
    [],
  );
  const guide = STEPS[browser];

  const headline =
    reason === "unsupported"
      ? isAr
        ? "المتصفح لا يدعم إشعارات Push"
        : "Your browser doesn't support push"
      : reason === "dismissed"
        ? isAr
          ? "لم يتم منح إذن الإشعارات"
          : "Notification permission not granted"
        : isAr
          ? "الإشعارات محظورة من إعدادات المتصفح"
          : "Notifications are blocked in browser settings";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellOff className="size-4 text-destructive" />
            {headline}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "لا تقلق — لن تفوّتك أي إشعارات؛ لا يزال بإمكانك متابعتها عبر البريد الإلكتروني وصندوق الإشعارات داخل التطبيق. اتبع الخطوات أدناه لإعادة تفعيل إشعارات المتصفح."
              : "Don't worry — you won't miss anything: you can still receive email and in-app inbox notifications. Follow the steps below to re-enable browser push."}
          </DialogDescription>
        </DialogHeader>

        {reason !== "unsupported" && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              {guide.icon}
              <span>{isAr ? guide.title.ar : guide.title.en}</span>
            </div>
            <ol className="list-decimal space-y-1.5 ps-5 text-xs text-muted-foreground">
              {guide.steps.map((s, i) => (
                <li key={i}>{isAr ? s.ar : s.en}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <p className="mb-2 font-semibold text-foreground">
            {isAr ? "بدائل متاحة الآن:" : "Available alternatives:"}
          </p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {isAr
                  ? "الإشعارات بالبريد الإلكتروني — يمكنك اختيار القنوات والتواتر من إعدادات التفضيلات."
                  : "Email notifications — pick channels and frequency from preferences."}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {isAr
                  ? "صندوق الإشعارات داخل التطبيق يعرض جميع التنبيهات دون الحاجة لإذن المتصفح."
                  : "The in-app inbox lists every alert without needing browser permission."}
              </span>
            </li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/settings/notifications">
              <Mail className="size-4 me-2" />
              {isAr ? "إعدادات تفضيلات الإشعارات" : "Notification preferences"}
            </Link>
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {isAr ? "فهمت" : "Got it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
