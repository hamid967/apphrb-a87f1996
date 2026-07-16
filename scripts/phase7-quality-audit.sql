-- AMLAK HBSH Phase 7: read-only quality audit.
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/phase7-quality-audit.sql
--
-- This script is intentionally non-destructive. It uses only SELECT statements
-- and temporary CTEs to surface RLS, accounting, and dashboard-readiness issues.

\echo 'Phase 7 audit: schema safety and RLS coverage'

with required_tables(table_name) as (
  values
    ('organizations'),
    ('organization_members'),
    ('properties'),
    ('units'),
    ('tenants'),
    ('contracts'),
    ('lease_payments'),
    ('payment_receipts'),
    ('expenses'),
    ('expense_categories'),
    ('recurring_expenses'),
    ('budgets'),
    ('vendors'),
    ('maintenance_requests'),
    ('maintenance_schedules'),
    ('pdf_templates'),
    ('export_logs')
),
rls_status as (
  select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
)
select rt.table_name,
       coalesce(rs.rls_enabled, false) as rls_enabled
  from required_tables rt
  left join rls_status rs on rs.table_name = rt.table_name
 order by rt.table_name;

\echo 'Phase 7 audit: tables with account/org tenant column'

with scoped_tables(table_name, tenant_column) as (
  values
    ('properties','org_id'),
    ('units','org_id'),
    ('tenants','org_id'),
    ('contracts','org_id'),
    ('lease_payments','org_id'),
    ('payment_receipts','org_id'),
    ('expenses','org_id'),
    ('expense_categories','org_id'),
    ('recurring_expenses','org_id'),
    ('budgets','org_id'),
    ('vendors','org_id'),
    ('maintenance_requests','org_id'),
    ('maintenance_schedules','org_id'),
    ('pdf_templates','org_id'),
    ('export_logs','org_id')
)
select st.table_name,
       st.tenant_column,
       exists (
         select 1
           from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = st.table_name
            and c.column_name = st.tenant_column
       ) as tenant_column_exists
  from scoped_tables st
 order by st.table_name;

\echo 'Phase 7 audit: payment receipt sequence uniqueness'

select org_id,
       receipt_number,
       count(*) as duplicate_count
  from public.payment_receipts
 group by org_id, receipt_number
having count(*) > 1
 order by duplicate_count desc, receipt_number;

\echo 'Phase 7 audit: lease payment balances and invalid states'

select id,
       org_id,
       amount,
       paid_amount,
       status,
       due_date
  from public.lease_payments
 where paid_amount < 0
    or amount < 0
    or paid_amount > amount
    or (status = 'paid' and paid_amount < amount)
    or (status = 'partial' and (paid_amount <= 0 or paid_amount >= amount))
    or (status = 'overdue' and due_date >= current_date)
 order by due_date desc
 limit 100;

\echo 'Phase 7 audit: receipt totals match lease payment paid_amount'

with receipt_totals as (
  select lease_payment_id,
         sum(case when type = 'payment' then amount else -amount end) as receipt_paid_total
    from public.payment_receipts
   group by lease_payment_id
)
select lp.id,
       lp.org_id,
       lp.paid_amount,
       coalesce(rt.receipt_paid_total, 0) as receipt_paid_total,
       lp.paid_amount - coalesce(rt.receipt_paid_total, 0) as difference
  from public.lease_payments lp
  left join receipt_totals rt on rt.lease_payment_id = lp.id
 where abs(lp.paid_amount - coalesce(rt.receipt_paid_total, 0)) > 0.01
 order by abs(lp.paid_amount - coalesce(rt.receipt_paid_total, 0)) desc
 limit 100;

\echo 'Phase 7 audit: VAT storage accuracy for expenses'

select id,
       org_id,
       amount,
       vat_mode,
       vat_rate,
       net_amount,
       gross_amount
  from public.expenses
 where (
     vat_mode = 'inclusive'
     and (
       abs(coalesce(net_amount, 0) - round((coalesce(gross_amount, amount) / (1 + vat_rate / 100))::numeric, 2)) > 0.02
       or abs((coalesce(gross_amount, amount) - coalesce(net_amount, 0)) - coalesce(vat_amount, 0)) > 0.02
     )
   )
    or (
      vat_mode = 'exclusive'
      and abs((coalesce(net_amount, amount) * (1 + vat_rate / 100)) - coalesce(gross_amount, 0)) > 0.02
    )
 order by created_at desc
 limit 100;

\echo 'Phase 7 audit: maintenance completed with actual cost has linked expense'

select id,
       org_id,
       property_id,
       unit_id,
       actual_cost,
       expense_id,
       closed_at
  from public.maintenance_requests
 where status = 'completed'
   and actual_cost is not null
   and actual_cost > 0
   and expense_id is null
 order by closed_at desc nulls last
 limit 100;

\echo 'Phase 7 audit: budget thresholds'

with month_expenses as (
  select e.org_id,
         e.category_id,
         e.property_id,
         e.scope,
         sum(coalesce(e.gross_amount, e.amount, 0)) as spent
    from public.expenses e
   where e.archived_at is null
     and e.spent_at >= date_trunc('month', current_date)
     and e.spent_at < date_trunc('month', current_date) + interval '1 month'
   group by e.org_id, e.category_id, e.property_id, e.scope
)
select b.id,
       b.org_id,
       b.scope,
       b.monthly_amount,
       coalesce(me.spent, 0) as spent,
       round((coalesce(me.spent, 0) / nullif(b.monthly_amount, 0) * 100)::numeric, 2) as usage_pct,
       b.alert_80_sent_at,
       b.alert_exceeded_sent_at
  from public.budgets b
  left join month_expenses me
    on me.org_id = b.org_id
   and (
     (b.scope = 'personal' and me.scope = 'personal')
     or (b.scope = 'category' and me.category_id = b.category_id)
     or (b.scope = 'property' and me.property_id = b.property_id)
   )
 where b.archived_at is null
   and coalesce(me.spent, 0) >= b.monthly_amount * 0.8
 order by usage_pct desc;

\echo 'Phase 7 audit complete'
