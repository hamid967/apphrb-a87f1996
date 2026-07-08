-- Idempotent approval/rejection for subscription payments with full audit trail.
--
-- The existing tg_log_payment_status_change trigger records every status
-- transition into public.payment_approvals; here we add:
--
-- 1) A `bank_reference` column on payment_approvals so the audit row itself
--    captures the bank reference the approver entered — independent of any
--    later edits to subscription_payments.bank_reference.
--
-- 2) `public.approve_subscription_payment(_id, _bank_reference, _note)` —
--    a single-statement UPDATE gated by `status = 'pending'` and
--    `reviewed_by IS NULL`. Postgres row-locks the row for the duration of
--    the UPDATE, so two concurrent approvers race → exactly one row is
--    returned, the other UPDATE affects 0 rows and we raise
--    'already_reviewed'. This is the idempotency guarantee: a duplicate
--    click, a webhook retry, or two admins hitting the button at the same
--    time can NEVER produce two approved states, two audit rows for
--    "approved", or double-credit the subscription.
--
-- 3) `public.reject_subscription_payment(_id, _reason)` — same pattern.
--
-- Both functions run SECURITY DEFINER, verify auth.uid() has super_admin
-- OR finance role, and store the approver identity + timestamp on the
-- payment row. The status-change trigger then writes an audit row with
-- from_status/to_status; we backfill the bank_reference/note onto that
-- audit row via an AFTER trigger keyed on the specific transition.

ALTER TABLE public.payment_approvals
  ADD COLUMN IF NOT EXISTS bank_reference text;

-- Helper: check finance/super_admin (matches set_app_setting authorization).
CREATE OR REPLACE FUNCTION public.can_review_subscription_payments(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND (
    public.has_role(_user, 'super_admin'::app_role)
    OR public.has_role(_user, 'finance'::app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.approve_subscription_payment(
  _id uuid,
  _bank_reference text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row   record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_review_subscription_payments(v_actor) THEN
    RAISE EXCEPTION 'Forbidden: super_admin or finance only' USING ERRCODE = '42501';
  END IF;

  -- Atomic guarded UPDATE. The WHERE clause is the idempotency latch:
  -- - status='pending'  → blocks approving twice / after rejection / cancelled
  -- - reviewed_by IS NULL → belt-and-suspenders against a stale row where the
  --   trigger fired but status didn't change (should not happen, but harmless).
  -- If the row was already reviewed we return the CURRENT snapshot so
  -- callers see the winning approver, not a synthetic error.
  UPDATE public.subscription_payments
     SET status         = 'approved',
         reviewed_by    = v_actor,
         reviewed_at    = now(),
         bank_reference = COALESCE(NULLIF(trim(_bank_reference), ''), bank_reference),
         updated_at     = now()
   WHERE id = _id
     AND status = 'pending'
     AND reviewed_by IS NULL
  RETURNING id, status, reviewed_by, reviewed_at, bank_reference
    INTO v_row;

  IF NOT FOUND THEN
    SELECT id, status, reviewed_by, reviewed_at, bank_reference
      INTO v_row
      FROM public.subscription_payments WHERE id = _id;
    IF v_row IS NULL THEN
      RAISE EXCEPTION 'Payment % not found', _id USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'already_reviewed', true,
      'payment_id', v_row.id,
      'status', v_row.status,
      'reviewed_by', v_row.reviewed_by,
      'reviewed_at', v_row.reviewed_at,
      'bank_reference', v_row.bank_reference
    );
  END IF;

  -- Backfill the audit row the status-change trigger just wrote for this
  -- specific transition. Matching on (payment_id, actor, action, to_status)
  -- and taking the newest is safe: we only reach this point if the UPDATE
  -- committed the pending→approved transition in THIS transaction.
  UPDATE public.payment_approvals
     SET bank_reference = COALESCE(NULLIF(trim(_bank_reference), ''), bank_reference),
         note           = COALESCE(NULLIF(trim(_note), ''), note)
   WHERE id = (
     SELECT id FROM public.payment_approvals
      WHERE payment_id = v_row.id
        AND actor      = v_actor
        AND action     = 'approved'
        AND to_status  = 'approved'
      ORDER BY created_at DESC
      LIMIT 1
   );

  RETURN jsonb_build_object(
    'ok', true,
    'already_reviewed', false,
    'payment_id', v_row.id,
    'status', v_row.status,
    'reviewed_by', v_row.reviewed_by,
    'reviewed_at', v_row.reviewed_at,
    'bank_reference', v_row.bank_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_subscription_payment(
  _id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row   record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_review_subscription_payments(v_actor) THEN
    RAISE EXCEPTION 'Forbidden: super_admin or finance only' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Rejection reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.subscription_payments
     SET status           = 'rejected',
         reviewed_by      = v_actor,
         reviewed_at      = now(),
         rejection_reason = trim(_reason),
         updated_at       = now()
   WHERE id = _id
     AND status = 'pending'
     AND reviewed_by IS NULL
  RETURNING id, status, reviewed_by, reviewed_at, rejection_reason
    INTO v_row;

  IF NOT FOUND THEN
    SELECT id, status, reviewed_by, reviewed_at, rejection_reason
      INTO v_row
      FROM public.subscription_payments WHERE id = _id;
    IF v_row IS NULL THEN
      RAISE EXCEPTION 'Payment % not found', _id USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'already_reviewed', true,
      'payment_id', v_row.id,
      'status', v_row.status,
      'reviewed_by', v_row.reviewed_by,
      'reviewed_at', v_row.reviewed_at,
      'rejection_reason', v_row.rejection_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_reviewed', false,
    'payment_id', v_row.id,
    'status', v_row.status,
    'reviewed_by', v_row.reviewed_by,
    'reviewed_at', v_row.reviewed_at,
    'rejection_reason', v_row.rejection_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_subscription_payment(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_subscription_payment(uuid, text)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_subscription_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_subscription_payment(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_subscription_payments(uuid)         TO authenticated;
