import type { ReactNode } from "react";

/**
 * Unified reports tooltip — a single reusable component used by every chart
 * on the reports dashboards so header, typography, spacing, RTL direction,
 * number formatting and hint area are identical across Area/Bar/Pie/Line.
 */
export type TooltipRow = {
  label: string;
  value: ReactNode;
  /** Dot color (hex or CSS var). Omit to hide dot. */
  color?: string;
  /** Render as secondary/muted row. */
  muted?: boolean;
};

export type ChartTooltipProps = {
  // Recharts-injected props
  active?: boolean;
  payload?: Array<{
    payload: Record<string, unknown>;
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: string | number;
  }>;
  label?: string | number;
  // Consumer configuration
  /** Build the header line (usually a formatted date/label). */
  getHeader?: (firstPayload: Record<string, unknown>, fallbackLabel: string) => string;
  /** Build the rows shown under the header. */
  getRows: (
    firstPayload: Record<string, unknown>,
    payload: NonNullable<ChartTooltipProps["payload"]>,
  ) => TooltipRow[];
  /** Optional footer hint (e.g. "انقر لتحديد النطاق"). */
  hint?: string;
  /** Optional width. */
  minWidth?: number;
};

export function ChartTooltip({
  active,
  payload,
  label,
  getHeader,
  getRows,
  hint,
  minWidth = 220,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const first = payload[0].payload ?? {};
  const fallbackLabel = label != null ? String(label) : "";
  const header = getHeader ? getHeader(first, fallbackLabel) : fallbackLabel;
  const rows = getRows(first, payload);

  return (
    <div
      dir="rtl"
      style={{ minWidth }}
      className="rounded-lg border border-primary/30 bg-background/95 p-3 text-xs shadow-lg backdrop-blur animate-fade-in"
    >
      {header ? (
        <div className="mb-2 border-b pb-1.5 text-[11px] font-medium text-muted-foreground">
          {header}
        </div>
      ) : null}
      <div className="space-y-1.5 [font-variant-numeric:tabular-nums] tabular-nums">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-4 ${
              r.muted ? "text-muted-foreground" : ""
            }`}
          >
            <span className="flex items-center gap-1.5">
              {r.color ? (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: r.color }}
                />
              ) : null}
              {r.label}
            </span>
            <span
              className={`tabular-nums [font-variant-numeric:tabular-nums] ${r.muted ? "" : "font-semibold"}`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {hint ? (
        <div className="mt-2 border-t pt-1.5 text-[10px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * Unified numeric formatters — every value shown inside a report tooltip
 * MUST route through these helpers so all charts use the same locale,
 * separators, decimal precision and currency shape.
 *
 * Locale is `ar-SA` (Arabic-Indic digits + Arabic thousands/decimal
 * separators). Callers should not pass their own `Intl.NumberFormat`.
 */
const AR_LOCALE = "ar-SA";
const SAR = "SAR";

/** Whole integer, thousands-grouped. e.g. 12,345 → "١٢٬٣٤٥" */
export const nfAr = new Intl.NumberFormat(AR_LOCALE, {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Fixed 2-decimal number (always shows trailing zeros). e.g. 12.5 → "١٢٫٥٠" */
const nfArDecimal = new Intl.NumberFormat(AR_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** Percent with 1 decimal. e.g. 0.732 → "٧٣٫٢٪" */
const nfArPercent = new Intl.NumberFormat(AR_LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** SAR currency — whole units, e.g. "١٬٢٣٤ ر.س.‏" */
const nfArCurrencyWhole = new Intl.NumberFormat(AR_LOCALE, {
  style: "currency",
  currency: SAR,
  currencyDisplay: "symbol",
  maximumFractionDigits: 0,
});

/** SAR currency — 2 decimals. */
const nfArCurrencyDecimal = new Intl.NumberFormat(AR_LOCALE, {
  style: "currency",
  currency: SAR,
  currencyDisplay: "symbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Whole integer count (bids, auctions, etc.). */
export const fmtCount = (v: unknown): string => nfAr.format(toNum(v));

/** Money in SAR. Whole units by default, 2 decimals when `decimals=true`. */
export const fmtMoney = (v: unknown, decimals = false): string =>
  (decimals ? nfArCurrencyDecimal : nfArCurrencyWhole).format(toNum(v));

/** Decimal number (non-money) with 2 fixed decimals. */
export const fmtDecimal = (v: unknown): string => nfArDecimal.format(toNum(v));

/**
 * Percent. Accepts a ratio (0..1) OR a percent value (>1 treated as already
 * scaled). Always renders with 1 decimal so bars/pies line up.
 */
export const fmtPercent = (v: unknown): string => {
  const n = toNum(v);
  return nfArPercent.format(Math.abs(n) > 1 ? n / 100 : n);
};

/**
 * Pick the right formatter from a tooltip row's dataKey/name. Everything
 * money-shaped (max_amount / total_amount / avg_*) becomes SAR; counts stay
 * as integers. Extend the money list here — not in each chart — to keep the
 * rule in one place.
 */
const MONEY_KEYS = new Set([
  "max_amount",
  "total_amount",
  "amount",
  "price",
  "final_price",
  "avg_final_price",
  "revenue",
  "expenses",
]);
export const fmtAuto = (dataKey: unknown, value: unknown): string => {
  const key = String(dataKey ?? "").toLowerCase();
  return MONEY_KEYS.has(key) ? fmtMoney(value) : fmtCount(value);
};

/** Shared Arabic (Gregorian) long date formatter. */
export const dfAr = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** Format an ISO/YMD date to the long Arabic label; falls back to the raw value. */
export function fmtDateAr(day: string): string {
  const d = new Date(day);
  return isNaN(d.getTime()) ? day : dfAr.format(d);
}
