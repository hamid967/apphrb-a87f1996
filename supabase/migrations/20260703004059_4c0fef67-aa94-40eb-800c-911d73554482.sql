
-- Session & device management
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_name text,
  user_agent text,
  os text,
  browser text,
  ip_address text,
  location text,
  trusted boolean NOT NULL DEFAULT false,
  trusted_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices" ON public.user_devices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_user_devices_updated BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  device_fingerprint text,
  ip_address text,
  user_agent text,
  location text,
  status text NOT NULL CHECK (status IN ('success','failed','blocked','rate_limited')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own login events read" ON public.login_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert login events" ON public.login_events FOR INSERT WITH CHECK (auth.uid() IS NULL OR auth.uid() = user_id);
CREATE INDEX idx_login_events_user_created ON public.login_events(user_id, created_at DESC);
CREATE INDEX idx_login_events_ip_created ON public.login_events(ip_address, created_at DESC);

-- Rate-limit check: count failed attempts in a window
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(_identifier text, _window_minutes int DEFAULT 15, _max_attempts int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_since timestamptz := now() - (_window_minutes || ' minutes')::interval;
BEGIN
  SELECT count(*) INTO v_count FROM public.login_events
   WHERE (email = _identifier OR ip_address = _identifier)
     AND status IN ('failed','blocked','rate_limited')
     AND created_at >= v_since;
  RETURN jsonb_build_object(
    'blocked', v_count >= _max_attempts,
    'attempts', v_count,
    'max', _max_attempts,
    'window_minutes', _window_minutes,
    'retry_after_seconds', GREATEST(0, _window_minutes*60)
  );
END $$;

CREATE OR REPLACE FUNCTION public.record_login_event(_email text, _fingerprint text, _ip text, _ua text, _status text, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.login_events(user_id, email, device_fingerprint, ip_address, user_agent, status, reason)
  VALUES (auth.uid(), _email, _fingerprint, _ip, _ua, _status, _reason)
  RETURNING id INTO v_id;
  IF auth.uid() IS NOT NULL AND _status = 'success' AND _fingerprint IS NOT NULL THEN
    INSERT INTO public.user_devices(user_id, device_fingerprint, user_agent, ip_address, last_seen_at)
    VALUES (auth.uid(), _fingerprint, _ua, _ip, now())
    ON CONFLICT (user_id, device_fingerprint)
    DO UPDATE SET last_seen_at = now(), user_agent = EXCLUDED.user_agent, ip_address = EXCLUDED.ip_address, revoked_at = NULL;
  END IF;
  RETURN v_id;
END $$;
