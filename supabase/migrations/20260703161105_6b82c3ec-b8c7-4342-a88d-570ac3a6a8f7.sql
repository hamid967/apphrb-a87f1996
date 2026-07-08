INSERT INTO public.user_roles(user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.organization_members(org_id, user_id, role)
SELECT o.id, u.id, 'owner'::org_role
  FROM public.organizations o
  CROSS JOIN auth.users u
 WHERE lower(u.email) = 'hamid@hrhbs.com'
ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';

UPDATE public.profiles
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, now()),
       trial_ends_at = NULL
 WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com');