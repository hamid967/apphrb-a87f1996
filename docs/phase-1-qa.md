# HBSpro Phase 1 QA Checklist

| Check                   | Expected result                                            | Status                  |
| ----------------------- | ---------------------------------------------------------- | ----------------------- |
| Migration safety        | New migration contains no destructive SQL operations       | Ready                   |
| Individual registration | User can choose individual and create an account           | Ready for Supabase test |
| Business registration   | User can choose business and save tax/commercial fields    | Ready for Supabase test |
| Tax validation          | 15-digit tax validation blocks invalid business tax number | Ready                   |
| Logo upload             | Logo uploads to `account-logos/{org_id}/logo.ext`          | Ready for Supabase test |
| Logo RLS                | Only org members can read logo objects                     | Ready for Supabase test |
| Logo owner update       | Only owner/admin can insert/update logo objects            | Ready for Supabase test |
| Existing wizard         | Branch/property steps remain unchanged                     | Ready                   |
| RTL layout              | Existing Arabic onboarding remains RTL-compatible          | Ready                   |
| Mobile layout           | Existing responsive wizard remains intact                  | Ready                   |

## Manual Test Flow

1. Apply `supabase/migrations/202607160001_phase1_dual_account_onboarding.sql`.
2. Sign in as a new user.
3. Open `/onboarding/wizard`.
4. Complete profile step.
5. Select `حساب فرد`, add phone/email profile data, optionally upload logo, then continue.
6. Repeat with another user and select `حساب منشأة`.
7. Enter a 15-digit tax number and business fields.
8. Upload a logo.
9. Confirm each user only sees their own organization records and logo objects.

## Accounting And Compliance Notes

- VAT is still planned for Phase 4 and Phase 5.
- ZATCA simplified tax invoice QR generation is still planned for Phase 5.
- PDPL-sensitive fields are tenant-isolated through existing organization RLS plus storage policies.
