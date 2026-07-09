-- Bootstrap super admin: hamid@hrhbs.com
DO $$
DECLARE
  v_user_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com';
  IF v_existing IS NOT NULL THEN
    v_user_id := v_existing;
    UPDATE auth.users
       SET encrypted_password = crypt('Bb@005599', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now(),
           banned_until = NULL
     WHERE id = v_user_id;
  ELSE
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_super_admin, is_sso_user
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'hamid@hrhbs.com',
      crypt('Bb@005599', gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('full_name','Hamid Al-Harbi'),
      now(), now(), false, false
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'hamid@hrhbs.com', 'email_verified', true),
      'email', v_user_id::text, now(), now(), now()
    );
  END IF;

  -- Profile
  INSERT INTO public.profiles (id, full_name, approval_status, language)
  VALUES (v_user_id, 'Hamid Al-Harbi', 'approved', 'ar')
  ON CONFLICT (id) DO UPDATE
    SET approval_status = 'approved',
        approved_at = COALESCE(public.profiles.approved_at, now()),
        updated_at = now();

  -- Super admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;