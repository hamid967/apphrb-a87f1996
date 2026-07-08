
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Public-read reference & catalog tables
GRANT SELECT ON public.countries       TO anon;
GRANT SELECT ON public.cities          TO anon;
GRANT SELECT ON public.currencies      TO anon;
GRANT SELECT ON public.banks           TO anon;
GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT ON public.packages        TO anon;
GRANT SELECT ON public.listings        TO anon;
GRANT SELECT ON public.properties      TO anon;

-- Public write (rate-limited via RLS/app)
GRANT INSERT ON public.demo_requests   TO anon;

-- Email infrastructure endpoints called without a session (unsubscribe, webhooks)
GRANT SELECT, INSERT, UPDATE ON public.email_unsubscribe_tokens TO anon;
GRANT SELECT, INSERT           ON public.suppressed_emails      TO anon;
GRANT SELECT, INSERT, UPDATE ON public.email_send_log           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_send_state TO anon;

-- Device registration (public endpoint used pre-auth)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices     TO anon;
