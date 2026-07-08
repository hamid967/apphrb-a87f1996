
CREATE OR REPLACE FUNCTION public.log_soft_delete(
  _entity text,
  _action text,
  _ids uuid[],
  _reason text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_at timestamptz := now();
  v_inserted int := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _action NOT IN ('archive','restore') THEN
    RAISE EXCEPTION 'Invalid action: %', _action;
  END IF;
  IF _entity IS NULL OR length(trim(_entity)) = 0 THEN
    RAISE EXCEPTION 'Entity required';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
  SELECT _entity, id, v_actor, _action,
         jsonb_build_object(
           'soft_delete', _action,
           'reason', _reason,
           'at', v_at
         )
  FROM unnest(_ids) AS id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.log_soft_delete(text, text, uuid[], text) TO authenticated;
