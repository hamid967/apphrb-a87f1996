
CREATE OR REPLACE FUNCTION public.bulk_apply_role_template(
  _org uuid,
  _template_name text,
  _template_slug text,
  _description text,
  _permissions text[],
  _scope rbac_scope_type,
  _user_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_uid uuid;
  v_ok int := 0;
  v_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_err text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_org_admin(_org, v_actor) THEN
    RAISE EXCEPTION 'Forbidden: org admin required';
  END IF;

  -- Find or create the role (atomic within this function)
  SELECT id INTO v_role_id
    FROM public.rbac_roles
   WHERE org_id = _org AND name = _template_name
   LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.rbac_roles(org_id, name, slug, description)
    VALUES (_org, _template_name, _template_slug, _description)
    RETURNING id INTO v_role_id;

    INSERT INTO public.rbac_role_permissions(role_id, permission_id, allow)
    SELECT v_role_id, p.id, true
      FROM public.rbac_permissions p
     WHERE p.code = ANY(_permissions)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- Per-UUID assignment with error capture (whole function is one tx;
  -- per-row failures are caught so one bad uuid doesn't abort the batch)
  FOREACH v_uid IN ARRAY _user_ids LOOP
    BEGIN
      INSERT INTO public.rbac_user_roles(org_id, user_id, role_id, scope_type)
      VALUES (_org, v_uid, v_role_id, _scope)
      ON CONFLICT (user_id, role_id, scope_type, org_id) DO NOTHING;

      IF FOUND THEN
        v_ok := v_ok + 1;
        v_results := v_results || jsonb_build_object('user_id', v_uid, 'status', 'assigned');
      ELSE
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('user_id', v_uid, 'status', 'duplicate');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_results := v_results || jsonb_build_object('user_id', v_uid, 'status', 'error', 'error', v_err);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'role_id', v_role_id,
    'assigned', v_ok,
    'skipped', v_skipped,
    'total', COALESCE(array_length(_user_ids, 1), 0),
    'results', v_results
  );
END $$;

GRANT EXECUTE ON FUNCTION public.bulk_apply_role_template(uuid, text, text, text, text[], rbac_scope_type, uuid[]) TO authenticated;
