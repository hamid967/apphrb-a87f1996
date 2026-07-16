import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  to?: string;
  tone?: "default" | "success" | "warning" | "danger";
}

const toneClass = {
  default: "border-border bg-card",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  danger: "border-destructive/30 bg-destructive/5",
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  to,
  tone = "default",
}: KpiCardProps) {
  const content = (
    <div className={`rounded-lg border p-4 transition hover:-translate-y-0.5 ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
          {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <div className="rounded-md bg-background/80 p-2 text-primary">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
