ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;