CREATE TYPE public.signup_request_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  company_name text,
  city text,
  activity_type text,
  notes text,
  status public.signup_request_status NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'hamid_voice',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_requests_full_name_len CHECK (char_length(full_name) BETWEEN 2 AND 120),
  CONSTRAINT signup_requests_phone_len CHECK (char_length(phone) BETWEEN 6 AND 30),
  CONSTRAINT signup_requests_email_len CHECK (char_length(email) BETWEEN 5 AND 255),
  CONSTRAINT signup_requests_notes_len CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX signup_requests_status_created_idx ON public.signup_requests (status, created_at DESC);
CREATE INDEX signup_requests_email_idx ON public.signup_requests (lower(email));

GRANT INSERT ON public.signup_requests TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE ON public.signup_requests TO authenticated;
GRANT ALL ON public.signup_requests TO service_role;

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a signup request"
  ON public.signup_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);

CREATE POLICY "Super admins can read signup requests"
  ON public.signup_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update signup requests"
  ON public.signup_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete signup requests"
  ON public.signup_requests
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER signup_requests_set_updated_at
  BEFORE UPDATE ON public.signup_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
