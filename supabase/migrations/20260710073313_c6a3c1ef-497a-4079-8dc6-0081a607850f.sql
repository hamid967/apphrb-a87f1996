DROP POLICY IF EXISTS "org members read sequences" ON public.org_sequences;

CREATE POLICY "org members read sequences"
  ON public.org_sequences
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));