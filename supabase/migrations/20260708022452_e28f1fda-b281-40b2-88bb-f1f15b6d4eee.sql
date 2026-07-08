
-- Add optional expiry to user_roles for temporary role grants
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Update has_role to ignore expired grants
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Cleanup function + hourly cron job to remove expired role grants
CREATE OR REPLACE FUNCTION public.cleanup_expired_user_roles()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.user_roles WHERE expires_at IS NOT NULL AND expires_at <= now();
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-user-roles');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-expired-user-roles',
  '*/15 * * * *',
  $$SELECT public.cleanup_expired_user_roles();$$
);

-- Grant temporary super_admin (2 hours) to the most recent developer test account
INSERT INTO public.user_roles (user_id, role, expires_at)
SELECT u.id, 'super_admin'::public.app_role, now() + interval '2 hours'
FROM auth.users u
WHERE u.email LIKE 'dev+%@hbspro.dev'
ORDER BY u.created_at DESC
LIMIT 1
ON CONFLICT (user_id, role) DO UPDATE SET expires_at = EXCLUDED.expires_at;
