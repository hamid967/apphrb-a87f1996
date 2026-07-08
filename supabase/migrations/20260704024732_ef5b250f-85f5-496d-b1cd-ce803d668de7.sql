CREATE TABLE public.demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 255),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  company text CHECK (company IS NULL OR char_length(company) <= 160),
  units text CHECK (units IS NULL OR char_length(units) <= 40),
  message text CHECK (message IS NULL OR char_length(message) <= 2000),
  source text NOT NULL DEFAULT 'homepage',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.demo_requests TO anon, authenticated;
GRANT ALL ON public.demo_requests TO service_role;
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can submit demo request"
  ON public.demo_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);