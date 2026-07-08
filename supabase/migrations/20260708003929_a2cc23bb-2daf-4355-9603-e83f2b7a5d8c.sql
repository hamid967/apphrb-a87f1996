-- Add refunded status + refund tracking columns to subscription_payments
ALTER TYPE subscription_payment_status ADD VALUE IF NOT EXISTS 'refunded';

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS refund_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by uuid;

ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_refund_amount_check;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_refund_amount_check
  CHECK (refund_amount IS NULL OR (refund_amount > 0 AND refund_amount <= amount));

-- Allow 'refunded' action on payment_approvals audit log
ALTER TABLE public.payment_approvals DROP CONSTRAINT IF EXISTS payment_approvals_action_check;
ALTER TABLE public.payment_approvals
  ADD CONSTRAINT payment_approvals_action_check
  CHECK (action = ANY (ARRAY['submitted','approved','rejected','cancelled','refunded','note']));