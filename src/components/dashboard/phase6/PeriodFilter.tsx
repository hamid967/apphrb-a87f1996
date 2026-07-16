import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DashboardPeriod = "month" | "quarter" | "year";

export function getPeriodRange(period: DashboardPeriod) {
  const now = new Date();
  const start =
    period === "year"
      ? new Date(now.getFullYear(), 0, 1)
      : period === "quarter"
        ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
        : new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function PeriodFilter({
  value,
  onChange,
  isAr,
}: {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  isAr: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DashboardPeriod)}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="month">{isAr ? "هذا الشهر" : "This month"}</SelectItem>
        <SelectItem value="quarter">{isAr ? "هذا الربع" : "This quarter"}</SelectItem>
        <SelectItem value="year">{isAr ? "هذه السنة" : "This year"}</SelectItem>
      </SelectContent>
    </Select>
  );
}
