
-- 1) Harden record_audit: restrict entity types and verify caller authority
CREATE OR REPLACE FUNCTION public.record_audit(_entity text, _entity_id uuid, _action text, _diff jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _is_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow-list of entity types accepted by the audit log.
  IF _entity NOT IN ('expense','expense_report','saved_report','policy','user','app_setting') THEN
    RAISE EXCEPTION 'Invalid audit entity: %', _entity;
  END IF;

  -- Bound the action label to a reasonable length to prevent log spam.
  IF _action IS NULL OR length(_action) = 0 OR length(_action) > 64 THEN
    RAISE EXCEPTION 'Invalid audit action';
  END IF;

  _is_staff := public.has_any_role(auth.uid(), ARRAY['manager','finance','admin']::app_role[]);

  -- For ownable entities, require ownership or staff role.
  IF _entity = 'expense' THEN
    SELECT user_id INTO _owner FROM public.expenses WHERE id = _entity_id;
    IF _owner IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;
    IF _owner <> auth.uid() AND NOT _is_staff THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  ELSIF _entity = 'expense_report' THEN
    SELECT user_id INTO _owner FROM public.expense_reports WHERE id = _entity_id;
    IF _owner IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF _owner <> auth.uid() AND NOT _is_staff THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  ELSIF _entity = 'saved_report' THEN
    SELECT owner_id INTO _owner FROM public.saved_reports WHERE id = _entity_id;
    IF _owner IS NULL THEN RAISE EXCEPTION 'Saved report not found'; END IF;
    IF _owner <> auth.uid() AND NOT public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[]) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  ELSIF _entity IN ('policy','user','app_setting') THEN
    -- Admin/finance only for org-level entities.
    IF NOT public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[]) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  INSERT INTO public.audit_log (actor, entity, entity_id, action, diff)
  VALUES (auth.uid(), _entity, _entity_id, _action, _diff);
END;
$function$;

-- 2) Cycle-safe manages(): depth-limited recursion, ignores loops
CREATE OR REPLACE FUNCTION public.manages(_target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    SELECT id, manager_id, 1 AS depth, ARRAY[id] AS visited
      FROM public.profiles
     WHERE id = _target
    UNION ALL
    SELECT p.id, p.manager_id, c.depth + 1, c.visited || p.id
      FROM public.profiles p
      JOIN chain c ON p.id = c.manager_id
     WHERE c.depth < 20
       AND NOT (p.id = ANY(c.visited))
  )
  SELECT auth.uid() IS NOT NULL
     AND auth.uid() <> _target
     AND EXISTS (SELECT 1 FROM chain WHERE manager_id = auth.uid());
$function$;

-- 3) Storage: explicit UPDATE policy on receipts bucket
DROP POLICY IF EXISTS "receipts user update" ON storage.objects;
CREATE POLICY "receipts user update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR ((storage.foldername(name))[1] = (auth.uid())::text)
  )
)
WITH CHECK (
  bucket_id = 'receipts'
  AND (
    public.has_any_role(auth.uid(), ARRAY['finance','admin']::app_role[])
    OR ((storage.foldername(name))[1] = (auth.uid())::text)
  )
);
