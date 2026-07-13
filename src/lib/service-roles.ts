/**
 * Service ↔ role mapping used by the services hub advanced filter.
 *
 * Values are the `public.app_role` enum members from the database:
 *   employee, manager, finance, admin, contractor, super_admin
 *
 * We also expose UI-facing "groups" (Employees / Finance / Ops / Admin) that
 * fan out to the underlying DB roles, so the filter chips stay short.
 *
 * Any role in a service's array grants access. `super_admin` implicitly
 * bypasses the filter (see `userCanUseService`).
 */

export type AppRole =
  | "employee"
  | "manager"
  | "finance"
  | "admin"
  | "contractor"
  | "super_admin";

export const ALL_APP_ROLES: AppRole[] = [
  "employee",
  "manager",
  "finance",
  "admin",
  "contractor",
  "super_admin",
];

export type RoleGroupKey = "employees" | "finance" | "ops" | "admin";

export type RoleGroup = {
  key: RoleGroupKey;
  ar: string;
  en: string;
  roles: AppRole[];
};

export const ROLE_GROUPS: RoleGroup[] = [
  { key: "employees", ar: "الموظفون", en: "Employees", roles: ["employee", "manager"] },
  { key: "finance", ar: "المالية", en: "Finance", roles: ["finance"] },
  { key: "ops", ar: "التشغيل", en: "Ops", roles: ["employee", "manager", "contractor"] },
  { key: "admin", ar: "الإدارة", en: "Admin", roles: ["admin", "super_admin"] },
];

/**
 * Which roles can use which service. Missing IDs default to `ALL_APP_ROLES`
 * so we never accidentally hide a newly added service.
 */
export const SERVICE_ROLE_MAP: Record<string, AppRole[]> = {
  dashboard: ["employee", "manager", "finance", "admin", "super_admin"],
  properties: ["employee", "manager", "admin", "super_admin"],
  contracts: ["employee", "manager", "admin", "super_admin"],
  payments: ["finance", "manager", "admin", "super_admin"],
  accounting: ["finance", "admin", "super_admin"],
  maintenance: ["employee", "manager", "contractor", "admin", "super_admin"],
  "maintenance-log": ["employee", "manager", "contractor", "admin", "super_admin"],
  viewings: ["employee", "manager", "admin", "super_admin"],
  valuation: ["manager", "admin", "super_admin"],
  archive: ["employee", "manager", "admin", "super_admin"],
  reports: ["manager", "finance", "admin", "super_admin"],
  "analytics-builder": ["manager", "finance", "admin", "super_admin"],
  assistant: ["employee", "manager", "finance", "admin", "super_admin"],
  listings: ["employee", "manager", "admin", "super_admin"],
  auctions: ["manager", "admin", "super_admin"],
  portals: ["admin", "super_admin"],
  subscriptions: ["admin", "super_admin"],
  security: ["admin", "super_admin"],
  settings: ["admin", "super_admin"],
  admin: ["super_admin"],
};

export function rolesForService(serviceId: string): AppRole[] {
  return SERVICE_ROLE_MAP[serviceId] ?? ALL_APP_ROLES;
}

/** super_admin can always use everything. */
export function userCanUseService(userRoles: AppRole[], serviceId: string): boolean {
  if (userRoles.includes("super_admin")) return true;
  const allowed = rolesForService(serviceId);
  return userRoles.some((r) => allowed.includes(r));
}

export function roleLabel(role: AppRole, isAr: boolean): string {
  const labels: Record<AppRole, [string, string]> = {
    employee: ["موظف", "Employee"],
    manager: ["مدير", "Manager"],
    finance: ["مالية", "Finance"],
    admin: ["إدارة", "Admin"],
    contractor: ["مقاول", "Contractor"],
    super_admin: ["مدير عام", "Super admin"],
  };
  return isAr ? labels[role][0] : labels[role][1];
}
