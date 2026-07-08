CREATE POLICY "app_settings super admin write" ON public.app_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.app_settings (key, value) VALUES
  ('subscription.trial_days', '14'),
  ('bank.name', ''),
  ('bank.account_name', ''),
  ('bank.iban', ''),
  ('bank.swift', ''),
  ('bank.notes', '')
ON CONFLICT (key) DO NOTHING;