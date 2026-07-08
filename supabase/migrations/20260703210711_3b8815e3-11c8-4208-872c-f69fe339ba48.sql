-- Ensure auto profile + admin trigger for hamid on new auth users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed super admin role for hamid if account already exists
INSERT INTO public.user_roles(user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE lower(email) = 'hamid@hrhbs.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill missing profiles for existing auth users
INSERT INTO public.profiles(id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Add language preference + per-user permission map for company_staff
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT jsonb_build_object(
    'properties', true, 'contracts', true, 'payments', false,
    'maintenance', true, 'reports', false
  );