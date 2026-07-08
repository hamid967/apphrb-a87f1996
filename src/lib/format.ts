export function fmtMoney(n: number | string | null | undefined, currency = "USD") {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);
}
export const formatMoney = fmtMoney;

export const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "CAD", symbol: "CA$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "CHF", symbol: "Fr", label: "Swiss Franc" },
  { code: "MXN", symbol: "MX$", label: "Mexican Peso" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
export function fmtDate(
  d: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", opts).format(dt);
}
export function statusTone(s: string): { bg: string; fg: string; label: string } {
  switch (s) {
    // Use the hue token itself for text (e.g. text-warning), not *-foreground,
    // which is designed for solid backgrounds and goes near-black in dark mode.
    case "draft":
      return {
        bg: "bg-muted ring-1 ring-inset ring-border",
        fg: "text-foreground/80",
        label: "Draft",
      };
    case "submitted":
      return {
        bg: "bg-warning/20 ring-1 ring-inset ring-warning/40",
        fg: "text-warning",
        label: "Pending",
      };
    case "approved":
      return {
        bg: "bg-primary/15 ring-1 ring-inset ring-primary/35",
        fg: "text-primary",
        label: "Approved",
      };
    case "rejected":
      return {
        bg: "bg-destructive/15 ring-1 ring-inset ring-destructive/40",
        fg: "text-destructive",
        label: "Rejected",
      };
    case "reimbursed":
      return {
        bg: "bg-success/20 ring-1 ring-inset ring-success/40",
        fg: "text-success",
        label: "Reimbursed",
      };
    default:
      return { bg: "bg-muted ring-1 ring-inset ring-border", fg: "text-foreground/80", label: s };
  }
}
