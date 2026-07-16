# HBSpro Phase 1 Change Manifest

## Scope

Phase 1 only covers the platform foundation:

- Dual account onboarding: individual or business.
- Account tax and identity fields.
- Logo upload through Supabase Storage.
- Arabic RTL onboarding shell using the existing wizard.
- RLS-protected account logo access.

## Architecture Decision

The current app already uses `organizations` and `organization_members` as the tenant boundary. Phase 1 keeps that architecture and extends it instead of creating a parallel tenant model.

Mapping:

| Product term      | Current implementation |
| ----------------- | ---------------------- |
| `account`         | `organizations`        |
| `account_id`      | `org_id`               |
| `account_members` | `organization_members` |
| `owner`           | `owner` org role       |

## Database Changes

- Add `account_type` to `organizations`.
- Add `tax_number` to `organizations`.
- Add `commercial_registration` to `organizations`.
- Add `national_address` to `organizations`.
- Add `authorized_person_name` to `organizations`.
- Add `authorized_person_phone` to `organizations`.
- Add `logo_path` to `organizations`.
- Add account type and business tax number constraints.
- Add `register_hbspro_account(...)` as a safe wrapper around the existing `register_company(...)`.

## Storage Changes

- Add private Supabase Storage bucket `account-logos`.
- Limit logo files to 5 MB.
- Allow PNG, JPEG, WebP, and SVG.
- Members can read logos for their own account.
- Owners/admins can upload and update logos under `{org_id}/logo.ext`.

## Frontend Changes

- Update `/onboarding/wizard` company step to become an account step.
- Add account type selector.
- Add individual/business labels.
- Add tax number field.
- Add business fields:
  - Commercial registration.
  - National address.
  - Authorized person name.
  - Authorized person phone.
- Add logo upload.
- Save logo path back to the account record.

## Non-Goals

- No properties, units, tenants, leases, maintenance, finance, PDF engine, dashboards, or pricing work in Phase 1.
- No destructive SQL operations were added.
