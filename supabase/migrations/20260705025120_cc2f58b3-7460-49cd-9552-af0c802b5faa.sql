
-- 1) Tighten overly permissive INSERT policy on intro_events (was WITH CHECK (true))
DROP POLICY IF EXISTS "anyone can insert intro events" ON public.intro_events;
CREATE POLICY "anyone can insert intro events"
  ON public.intro_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    event IN ('shown','skipped','completed')
    AND coalesce(length(session_id), 0) BETWEEN 1 AND 128
    AND coalesce(length(path), 0) <= 512
    AND coalesce(length(user_agent), 0) <= 512
  );

-- 2) demo_requests: add admin/super_admin SELECT policy (currently no SELECT policy at all)
CREATE POLICY "Admins can read demo requests"
  ON public.demo_requests
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3) logs: allow super_admin to read logs where org_id IS NULL
CREATE POLICY "Super admins can read null-org logs"
  ON public.logs
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NULL
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 4) Harden record_login_event: validate status enum, cap input lengths, prevent log poisoning
CREATE OR REPLACE FUNCTION public.record_login_event(
  _email text, _fingerprint text, _ip text, _ua text, _status text, _reason text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF _status IS NULL OR _status NOT IN ('success','failed','blocked','rate_limited') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF _email IS NOT NULL AND length(_email) > 320 THEN RAISE EXCEPTION 'email too long'; END IF;
  IF _fingerprint IS NOT NULL AND length(_fingerprint) > 128 THEN RAISE EXCEPTION 'fingerprint too long'; END IF;
  IF _ua IS NOT NULL AND length(_ua) > 512 THEN _ua := left(_ua, 512); END IF;
  IF _reason IS NOT NULL AND length(_reason) > 256 THEN _reason := left(_reason, 256); END IF;

  INSERT INTO public.login_events(user_id, email, device_fingerprint, ip_address, user_agent, status, reason)
  VALUES (auth.uid(), lower(nullif(trim(_email), '')), _fingerprint, _ip, _ua, _status, _reason)
  RETURNING id INTO v_id;

  IF auth.uid() IS NOT NULL AND _status = 'success' AND _fingerprint IS NOT NULL THEN
    INSERT INTO public.user_devices(user_id, device_fingerprint, user_agent, ip_address, last_seen_at)
    VALUES (auth.uid(), _fingerprint, _ua, _ip, now())
    ON CONFLICT (user_id, device_fingerprint)
    DO UPDATE SET last_seen_at = now(), user_agent = EXCLUDED.user_agent, ip_address = EXCLUDED.ip_address, revoked_at = NULL;
  END IF;
  RETURN v_id;
END $function$;
