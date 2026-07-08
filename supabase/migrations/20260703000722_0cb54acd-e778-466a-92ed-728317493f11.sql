
CREATE OR REPLACE FUNCTION public.log_assistant_access(_org uuid, _action text, _diff jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_org_member(_org, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of org';
  END IF;
  INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
  VALUES ('assistant', auth.uid(), auth.uid(), _action,
          COALESCE(_diff, '{}'::jsonb) || jsonb_build_object('org_id', _org))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_assistant_access(uuid, text, jsonb) TO authenticated;
