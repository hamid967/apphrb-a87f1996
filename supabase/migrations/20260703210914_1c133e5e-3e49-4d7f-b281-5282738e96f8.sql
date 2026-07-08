-- Portal invitations for tenants/owners
CREATE TABLE IF NOT EXISTS public.portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tenant','owner')),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.owners(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'tenant' AND tenant_id IS NOT NULL AND owner_id IS NULL)
      OR (kind = 'owner'  AND owner_id  IS NOT NULL AND tenant_id IS NULL))
);

CREATE INDEX IF NOT EXISTS portal_invitations_org_idx ON public.portal_invitations(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_invitations_pending_unique
  ON public.portal_invitations(org_id, kind, lower(email)) WHERE accepted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invitations TO authenticated;
GRANT ALL ON public.portal_invitations TO service_role;

ALTER TABLE public.portal_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_inv: admins read"
  ON public.portal_invitations FOR SELECT TO authenticated
  USING (is_org_admin(org_id, auth.uid()));

CREATE POLICY "portal_inv: admins insert"
  ON public.portal_invitations FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(org_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "portal_inv: admins update"
  ON public.portal_invitations FOR UPDATE TO authenticated
  USING (is_org_admin(org_id, auth.uid()));

CREATE POLICY "portal_inv: admins delete"
  ON public.portal_invitations FOR DELETE TO authenticated
  USING (is_org_admin(org_id, auth.uid()));

-- Lookup by token (SECURITY DEFINER, returns minimal info to signed-in user)
CREATE OR REPLACE FUNCTION public.get_portal_invitation_by_token(_token text)
RETURNS TABLE (
  id uuid, org_id uuid, org_name text, kind text,
  tenant_id uuid, owner_id uuid, email text,
  expires_at timestamptz, accepted_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pi.id, pi.org_id, o.name, pi.kind, pi.tenant_id, pi.owner_id,
         pi.email, pi.expires_at, pi.accepted_at
  FROM public.portal_invitations pi
  JOIN public.organizations o ON o.id = pi.org_id
  WHERE pi.token = _token
  LIMIT 1;
$$;

-- Accept: links tenant/owner to caller's profile
CREATE OR REPLACE FUNCTION public.accept_portal_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.portal_invitations%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO inv FROM public.portal_invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Already accepted'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'Expired'; END IF;

  INSERT INTO public.profiles (id) VALUES (uid) ON CONFLICT (id) DO NOTHING;

  IF inv.kind = 'tenant' THEN
    UPDATE public.profiles SET tenant_id = inv.tenant_id, updated_at = now() WHERE id = uid;
  ELSE
    UPDATE public.profiles SET owner_id = inv.owner_id, updated_at = now() WHERE id = uid;
  END IF;

  UPDATE public.portal_invitations
     SET accepted_at = now(), accepted_by = uid
   WHERE id = inv.id;

  RETURN inv.org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invitation_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invitation(text) TO authenticated;