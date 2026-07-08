import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, { ar: string; en: string }> = {
  dashboard: { ar: "الرئيسية", en: "Dashboard" },
  units: { ar: "الوحدات", en: "Units" },
  contracts: { ar: "العقود", en: "Contracts" },
  payments: { ar: "المدفوعات", en: "Payments" },
  expenses: { ar: "المصروفات", en: "Expenses" },
  tenants: { ar: "المستأجرون", en: "Tenants" },
  settings: { ar: "الإعدادات", en: "Settings" },
  new: { ar: "جديد", en: "New" },
};

function labelFor(seg: string, isAr: boolean): string {
  const l = LABELS[seg];
  if (l) return isAr ? l.ar : l.en;
  if (/^[0-9a-f-]{8,}$/i.test(seg)) return "#" + seg.slice(0, 6);
  return decodeURIComponent(seg);
}

export function DashboardBreadcrumbs() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/$/, "");
  const parts = clean.split("/").filter(Boolean);
  const dashIdx = parts.indexOf("dashboard");
  if (dashIdx === -1) return null;
  const segs = parts.slice(dashIdx);

  const crumbs = segs.map((seg, i) => ({
    href: "/" + parts.slice(0, dashIdx + i + 1).join("/"),
    label: labelFor(seg, !!isAr),
    isLast: i === segs.length - 1,
  }));

  const Sep = isAr ? ChevronLeft : ChevronRight;

  return (
    <nav
      aria-label="breadcrumb"
      className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground"
    >
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1">
          {i > 0 && <Sep className="size-3.5 shrink-0 opacity-60" aria-hidden />}
          {c.isLast ? (
            <span className="truncate font-medium text-foreground" aria-current="page">
              {i === 0 ? <Home className="inline size-3.5 me-1 opacity-70" /> : null}
              {c.label}
            </span>
          ) : (
            <Link to={c.href} className="truncate hover:text-foreground">
              {i === 0 ? <Home className="inline size-3.5 me-1 opacity-70" /> : null}
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
