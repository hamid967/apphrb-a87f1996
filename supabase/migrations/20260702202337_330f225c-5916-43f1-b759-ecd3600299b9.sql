
-- Team invitations
CREATE TABLE public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'agent',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_invitations_org_idx ON public.org_invitations(org_id);
CREATE UNIQUE INDEX org_invitations_pending_unique ON public.org_invitations(org_id, lower(email)) WHERE accepted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;
GRANT ALL ON public.org_invitations TO service_role;

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view invitations"
  ON public.org_invitations FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Org admins create invitations"
  ON public.org_invitations FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]) AND invited_by = auth.uid());

CREATE POLICY "Org admins update invitations"
  ON public.org_invitations FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Org admins delete invitations"
  ON public.org_invitations FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- Accept invitation via security-definer RPC (token-based, no RLS bypass needed)
CREATE OR REPLACE FUNCTION public.accept_org_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id, email, role, expires_at, accepted_at
    INTO inv
    FROM public.org_invitations
   WHERE token = _token
   LIMIT 1;

  IF inv IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already used';
  END IF;
  IF inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invitation expired';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  IF lower(user_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'Invitation email does not match signed-in user';
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (inv.org_id, auth.uid(), inv.role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.org_invitations
     SET accepted_at = now(), accepted_by = auth.uid()
   WHERE id = inv.id;

  RETURN inv.org_id;
END;
$$;

-- Look up invitation by token (limited fields, for the accept UI)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE(email text, role public.org_role, org_name text, expires_at timestamptz, accepted_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.email, i.role, o.name AS org_name, i.expires_at, i.accepted_at
    FROM public.org_invitations i
    JOIN public.organizations o ON o.id = i.org_id
   WHERE i.token = _token
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated, anon;
