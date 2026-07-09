-- Wave 3 / Package B: full support tickets system

-- 1) Extend tickets
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'portal'
    CHECK (channel IN ('portal','email','phone','whatsapp','internal')),
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS watcher_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tickets_org_status ON public.tickets(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON public.tickets(assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_sla_due ON public.tickets(sla_due_at) WHERE resolved_at IS NULL AND deleted_at IS NULL;

-- 2) Ticket comments
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments TO authenticated;
GRANT ALL ON public.ticket_comments TO service_role;

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_org ON public.ticket_comments(org_id);

DROP POLICY IF EXISTS "ticket_comments_org_read" ON public.ticket_comments;
CREATE POLICY "ticket_comments_org_read" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

DROP POLICY IF EXISTS "ticket_comments_org_insert" ON public.ticket_comments;
CREATE POLICY "ticket_comments_org_insert" ON public.ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

DROP POLICY IF EXISTS "ticket_comments_author_update" ON public.ticket_comments;
CREATE POLICY "ticket_comments_author_update" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "ticket_comments_admin_delete" ON public.ticket_comments;
CREATE POLICY "ticket_comments_admin_delete" ON public.ticket_comments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR author_id = auth.uid());

-- 3) SLA policies per org
CREATE TABLE IF NOT EXISTS public.ticket_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low','normal','high','urgent')),
  first_response_minutes integer NOT NULL DEFAULT 240,
  resolution_minutes integer NOT NULL DEFAULT 1440,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, priority)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_sla_policies TO authenticated;
GRANT ALL ON public.ticket_sla_policies TO service_role;

ALTER TABLE public.ticket_sla_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_policies_org_read" ON public.ticket_sla_policies;
CREATE POLICY "sla_policies_org_read" ON public.ticket_sla_policies
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

DROP POLICY IF EXISTS "sla_policies_admin_write" ON public.ticket_sla_policies;
CREATE POLICY "sla_policies_admin_write" ON public.ticket_sla_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
     AND org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
          AND org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

-- 4) SLA auto-fill trigger
CREATE OR REPLACE FUNCTION public.ticket_apply_sla()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _mins integer;
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.priority IS DISTINCT FROM OLD.priority) THEN
    SELECT resolution_minutes INTO _mins
      FROM public.ticket_sla_policies
     WHERE org_id = NEW.org_id AND priority = NEW.priority;
    IF _mins IS NULL THEN
      _mins := CASE NEW.priority
        WHEN 'urgent' THEN 240
        WHEN 'high' THEN 480
        WHEN 'normal' THEN 1440
        ELSE 2880
      END;
    END IF;
    NEW.sla_due_at := NEW.created_at + make_interval(mins => _mins);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_apply_sla ON public.tickets;
CREATE TRIGGER trg_ticket_apply_sla
  BEFORE INSERT OR UPDATE OF priority ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.ticket_apply_sla();

-- 5) Auto ticket number
CREATE OR REPLACE FUNCTION public.ticket_assign_number()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ticket:' || NEW.org_id::text, 0));
    SELECT COUNT(*) + 1 INTO _n FROM public.tickets WHERE org_id = NEW.org_id;
    NEW.ticket_number := 'TCK-' || lpad(_n::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_assign_number ON public.tickets;
CREATE TRIGGER trg_ticket_assign_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.ticket_assign_number();

-- 6) updated_at maintenance
DROP TRIGGER IF EXISTS trg_ticket_comments_touch ON public.ticket_comments;

-- Seed default SLA rows for existing orgs (idempotent)
INSERT INTO public.ticket_sla_policies (org_id, priority, first_response_minutes, resolution_minutes)
SELECT o.id, p.priority, p.fr, p.res
  FROM public.organizations o
 CROSS JOIN (VALUES
    ('urgent', 30, 240),
    ('high', 60, 480),
    ('normal', 240, 1440),
    ('low', 480, 2880)
 ) AS p(priority, fr, res)
ON CONFLICT (org_id, priority) DO NOTHING;