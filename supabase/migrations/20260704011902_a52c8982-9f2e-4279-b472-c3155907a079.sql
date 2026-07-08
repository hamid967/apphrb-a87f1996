
-- 1) Add max_units column
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS max_units integer;

-- 2) Reset packages to spec (Basic / Professional / Enterprise)
-- Preserve existing IDs where possible by matching on code
UPDATE public.packages SET active = false WHERE code NOT IN ('basic','professional','enterprise');

INSERT INTO public.packages (code, name, description, price_monthly, price_yearly, max_users, max_properties, max_units, features, active)
VALUES
  ('basic', 'Basic',        'الباقة الأساسية',      99,   990, 2, 5,   25,   '{"portals": false, "reports": "basic"}'::jsonb, true),
  ('professional', 'Professional', 'الباقة الاحترافية', 249, 2490, 5, 20,  100,  '{"portals": true,  "reports": "full"}'::jsonb,  true),
  ('enterprise', 'Enterprise', 'باقة المؤسسات',        499, 4990, NULL, NULL, NULL, '{"portals": true,  "reports": "full"}'::jsonb,  true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_users = EXCLUDED.max_users,
  max_properties = EXCLUDED.max_properties,
  max_units = EXCLUDED.max_units,
  features = EXCLUDED.features,
  active = true,
  updated_at = now();
