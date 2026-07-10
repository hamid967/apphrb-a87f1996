
CREATE TABLE public.org_mcp_servers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_mcp_servers_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT org_mcp_servers_url_len CHECK (char_length(url) BETWEEN 8 AND 2000),
  CONSTRAINT org_mcp_servers_url_scheme CHECK (url ~* '^https?://'),
  UNIQUE (org_id, url)
);

CREATE INDEX org_mcp_servers_org_idx ON public.org_mcp_servers(org_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_mcp_servers TO authenticated;
GRANT ALL ON public.org_mcp_servers TO service_role;

ALTER TABLE public.org_mcp_servers ENABLE ROW LEVEL SECURITY;

-- Any org member can read
CREATE POLICY "Org members can view MCP servers"
  ON public.org_mcp_servers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_mcp_servers.org_id
        AND m.user_id = auth.uid()
    )
  );

-- Owners/admins can insert
CREATE POLICY "Org admins can add MCP servers"
  ON public.org_mcp_servers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_mcp_servers.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  );

-- Owners/admins can update
CREATE POLICY "Org admins can update MCP servers"
  ON public.org_mcp_servers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_mcp_servers.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_mcp_servers.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  );

-- Owners/admins can delete
CREATE POLICY "Org admins can delete MCP servers"
  ON public.org_mcp_servers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_mcp_servers.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  );

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_org_mcp_servers_updated_at
  BEFORE UPDATE ON public.org_mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
