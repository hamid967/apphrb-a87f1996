import { useQuery } from "@tanstack/react-query";
import { getBillingOverview } from "@/lib/billing.functions";

export type PlanResource = "unit" | "property" | "user" | "widget";

const LABEL: Record<PlanResource, string> = {
  unit: "الوحدات",
  property: "العقارات",
  user: "المستخدمون",
  widget: "عناصر اللوحة الذكية",
};

// Smart-dashboard widget caps derived from package code (no dedicated column).
// Unknown/no plan → basic tier cap during trial.
function widgetCapForPackage(code: string | undefined | null): number | null {
  switch ((code ?? "").toLowerCase()) {
    case "enterprise":
      return null; // unlimited
    case "professional":
    case "growth":
      return 12;
    case "basic":
    case "starter":
    default:
      return 4;
  }
}

export function useCanCreate(resource: PlanResource) {
  const q = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => getBillingOverview(),
    staleTime: 30_000,
  });

  const pkg = q.data?.package as any;
  const usage = q.data?.usage as any;

  let max: number | null;
  let used: number;
  if (resource === "widget") {
    max = widgetCapForPackage(pkg?.code);
    used = 0; // caller passes current count via `used` override below
  } else {
    const maxKey =
      resource === "unit" ? "max_units" : resource === "property" ? "max_properties" : "max_users";
    const usedKey =
      resource === "unit" ? "units" : resource === "property" ? "properties" : "users";
    max = pkg?.[maxKey] ?? null;
    used = usage?.[usedKey] ?? 0;
  }
  const isUnlimited = max == null;
  const hasSub = !!q.data?.subscription;
  // If no subscription/package data yet, don't block (grace during trial)
  const allowed = !hasSub || isUnlimited || used < (max as number);

  return {
    allowed,
    used,
    max,
    isUnlimited,
    isLoading: q.isLoading,
    resource,
    label: LABEL[resource],
    planName: pkg?.name as string | undefined,
    packageCode: pkg?.code as string | undefined,
  };
}
