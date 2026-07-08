CREATE TYPE public.doc_category AS ENUM ('contract','invoice','id','report','other');
CREATE TYPE public.doc_status AS ENUM ('active','archived');
CREATE TYPE public.doc_sign_status AS ENUM ('unsigned','pending','signed');

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  category public.doc_category NOT NULL DEFAULT 'other',
  status public.doc_status NOT NULL DEFAULT 'active',
  signature_status public.doc_sign_status NOT NULL DEFAULT 'unsigned',
  signed_at timestamptz,
  signed_by_name text,
  signature_data text,
  tags text[] NOT NULL DEFAULT '{}',
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  current_version_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_org_status ON public.documents(org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents: members read" ON public.documents FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "documents: staff insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "documents: staff update" ON public.documents FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "documents: admin delete" ON public.documents FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
CREATE INDEX idx_doc_versions_document ON public.document_versions(document_id, version_no DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_versions: members read" ON public.document_versions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "doc_versions: staff insert" ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin','agent']::org_role[]));
CREATE POLICY "doc_versions: admin delete" ON public.document_versions FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

ALTER TABLE public.documents
  ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;

-- Storage RLS for a private 'documents' bucket (bucket itself is created via tool)
CREATE POLICY "documents storage: members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
CREATE POLICY "documents storage: staff write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), ARRAY['owner','admin','agent']::org_role[])
  );
CREATE POLICY "documents storage: staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), ARRAY['owner','admin','agent']::org_role[])
  );
CREATE POLICY "documents storage: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), ARRAY['owner','admin']::org_role[])
  );