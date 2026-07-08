ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS properties_is_public_idx ON public.properties(is_public) WHERE is_public = true;
GRANT SELECT ON public.properties TO anon;
DROP POLICY IF EXISTS properties_public_read ON public.properties;
CREATE POLICY properties_public_read ON public.properties
  FOR SELECT TO anon, authenticated
  USING (is_public = true);