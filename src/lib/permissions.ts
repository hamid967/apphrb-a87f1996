export type OrgRole = "owner" | "admin" | "agent" | "viewer" | "property_owner";

export const EDITOR_ROLES: OrgRole[] = ["owner", "admin", "agent"];
export const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];
export const STAFF_ROLES: OrgRole[] = ["owner", "admin", "agent", "viewer"];
export const PORTAL_ROLES: OrgRole[] = ["property_owner"];

export const can = {
  createProperty: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  editProperty: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  archiveProperty: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  deleteProperty: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  editCRM: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  deleteCRM: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  editDeal: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  deleteDeal: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  editTask: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  deleteTask: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  // Sensitive-data gates (PII, finance) — management only
  viewSensitivePII: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  editSensitivePII: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  viewFinance: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  managePayments: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  manageMembers: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  isStaff: (r?: OrgRole | null) => !!r && STAFF_ROLES.includes(r),
  isPortalOnly: (r?: OrgRole | null) => !!r && PORTAL_ROLES.includes(r),
  // Reports & analytics — view/build/edit/export gates
  viewReports: (r?: OrgRole | null) => !!r && STAFF_ROLES.includes(r),
  buildReportView: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  saveReportTemplate: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
  editReportTemplate: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  deleteReportTemplate: (r?: OrgRole | null) => !!r && ADMIN_ROLES.includes(r),
  exportReport: (r?: OrgRole | null) => !!r && EDITOR_ROLES.includes(r),
};
