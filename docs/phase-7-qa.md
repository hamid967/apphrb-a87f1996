# AMLAK HBSH Phase 7 QA

Phase 7 is a quality gate for the completed product foundation. It does not add
tables, change business logic, or alter previous phase flows. The goal is to
prove tenant isolation, mobile usability, and accounting consistency before the
landing/pricing phase.

## Change Manifest

| Area                 | Change                                                                                          | Risk | Verification                 |
| -------------------- | ----------------------------------------------------------------------------------------------- | ---- | ---------------------------- |
| RLS audit            | Added `scripts/phase7-quality-audit.sql` with read-only checks                                  | Low  | Script uses `SELECT` only    |
| Accounting audit     | Added checks for payment balances, receipt totals, VAT storage, and maintenance expense linkage | Low  | Run against staging Supabase |
| QA documentation     | Added this Phase 7 checklist and acceptance guide                                               | Low  | Manual review                |
| UI / database schema | No structural changes                                                                           | None | No migrations added          |

## Required Commands

```bash
npm run lint
npm run typecheck
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/phase7-quality-audit.sql
```

If `DATABASE_URL` is unavailable in CI, the SQL audit should be run manually
against staging before approving Phase 7.

## RLS Isolation QA

| Scenario                                            | Steps                                                                         | Expected result                |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| Account A cannot read Account B properties          | Sign in as user A, query dashboard/property pages after Account B seed exists | Only Account A rows appear     |
| Account A cannot read Account B finance records     | Query payments, receipts, expenses, budgets                                   | No cross-account rows appear   |
| Account A cannot read Account B maintenance records | Query vendors, requests, schedules                                            | No cross-account rows appear   |
| Account A cannot read Account B PDF/export records  | Query templates and export logs                                               | No cross-account rows appear   |
| Storage isolation                                   | Try logo, maintenance image, and receipt paths from another account           | Access denied or object hidden |

## Role QA

| Role                     | Expected access                                              |
| ------------------------ | ------------------------------------------------------------ |
| `owner`                  | Full access to dashboards, finance, maintenance, PDF exports |
| `finance_manager`        | Finance and dashboards with amounts                          |
| `accountant`             | Can register payments and expenses; no destructive actions   |
| `maintenance_supervisor` | Maintenance dashboard only; no finance details               |
| `viewer`                 | Summary access with financial amounts hidden where required  |

## Accounting QA

| Check                  | Expected result                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Full rent payment      | `lease_payments.status = paid`, `paid_amount = amount`, receipt number is unique per account   |
| Partial rent payment   | `status = partial`, each payment has its own `payment_receipts` row                            |
| Reversal receipt       | Original receipt remains immutable; reversal has `type = reversal` and references the original |
| Inclusive VAT expense  | Net = gross / 1.15, VAT = gross - net                                                          |
| Exclusive VAT expense  | Gross = net \* 1.15, VAT stored separately                                                     |
| Maintenance completion | Completed request with actual cost has linked expense with `source = maintenance`              |
| Recurring expense      | Generated expense remains pending confirmation until approved                                  |
| Budget threshold       | 80% and exceeded budget states surface in notifications/dashboard                              |

## Dashboard QA

| Dashboard  | Check                | Expected result                                                   |
| ---------- | -------------------- | ----------------------------------------------------------------- |
| Individual | Net income KPI       | Equals collected rent minus property expenses for selected period |
| Individual | Occupancy KPI        | Equals rented/occupied units divided by all units                 |
| Individual | Personal budget card | Matches personal expenses and budget rows                         |
| Company    | Portfolio revenue    | Matches collected lease payments for selected period              |
| Company    | Portfolio net income | Uses collected revenue minus property expense net amount          |
| Company    | Maintenance spend    | Includes maintenance-sourced expenses and 6-month average         |
| Company    | Tax summary          | Output VAT and input VAT match finance records                    |
| Both       | Click-through        | KPI cards open the matching detailed page                         |
| Both       | Empty account        | Shows empty state without runtime errors                          |

## Mobile QA

| Device size | Expected behavior                                              |
| ----------- | -------------------------------------------------------------- |
| 390px width | KPI cards stack in one column; no horizontal clipping          |
| 768px width | Charts remain readable and scroll only inside chart containers |
| Desktop     | KPI rows and charts keep stable spacing                        |
| RTL Arabic  | Titles, cards, filters, and tables align right-to-left         |

## Acceptance Criteria

- `scripts/phase7-quality-audit.sql` returns no critical rows for staging data.
- No dashboard KPI differs from its detailed page by more than 0.01 SAR.
- Viewer and maintenance supervisor permissions hide financial details correctly.
- Two-account RLS test shows zero leaked rows.
- Mobile checks pass at 390px and tablet width.
- No destructive SQL exists in Phase 7 changes.
