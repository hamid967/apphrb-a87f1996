
CREATE TABLE public.org_import_settings (
  org_id UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  contacts_strategy TEXT NOT NULL DEFAULT 'skip' CHECK (contacts_strategy IN ('skip','update','merge')),
  contacts_match_keys TEXT[] NOT NULL DEFAULT ARRAY['email','phone']::text[],
  leads_strategy TEXT NOT NULL DEFAULT 'skip' CHECK (leads_strategy IN ('skip','update','merge')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_import_settings TO authenticated;
GRANT ALL ON public.org_import_settings TO service_role;

ALTER TABLE public.org_import_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view settings" ON public.org_import_settings
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org admins can upsert settings" ON public.org_import_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE POLICY "org admins can update settings" ON public.org_import_settings
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER set_org_import_settings_updated_at
  BEFORE UPDATE ON public.org_import_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
