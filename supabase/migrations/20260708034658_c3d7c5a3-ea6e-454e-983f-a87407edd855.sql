ALTER PUBLICATION supabase_realtime ADD TABLE public.rental_applications;
ALTER TABLE public.rental_applications REPLICA IDENTITY FULL;