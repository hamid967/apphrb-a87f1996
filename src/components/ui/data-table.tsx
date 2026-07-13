/**
 * Canonical DataTable primitive used across authenticated pages.
 *
 * Ships with:
 *   - sticky header + column resize
 *   - global search
 *   - per-column filter popovers
 *   - multi-column sort
 *   - client-side pagination (page size selector)
 *   - row selection + bulk-action hooks (delete / export / custom)
 *   - CSV / Excel / PDF exports
 *
 * This file is a thin re-export around EnterpriseDataTable to give the
 * rest of the codebase a stable, semantic import path.
 */
export {
  EnterpriseDataTable as DataTable,
  type DTColumn as DataTableColumn,
  type BulkAction as DataTableBulkAction,
} from "@/components/dashboard/EnterpriseDataTable";
