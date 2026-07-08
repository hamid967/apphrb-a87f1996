INSERT INTO public.app_settings(key,value) VALUES
  ('alerts.email_enabled','true'),
  ('alerts.email_to','hamid@hrhbs.com'),
  ('alerts.slack_enabled','false')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;