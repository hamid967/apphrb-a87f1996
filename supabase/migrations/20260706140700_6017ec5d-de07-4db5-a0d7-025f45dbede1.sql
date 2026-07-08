-- 1) CREATE TABLE
CREATE TABLE public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pending_credentials', 'sent', 'failed', 'skipped')),
  last_error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_queue_org_status
  ON public.notification_queue(org_id, status);
CREATE INDEX idx_notification_queue_pending
  ON public.notification_queue(status, created_at)
  WHERE status IN ('pending', 'pending_credentials');

-- 2) GRANTS
GRANT SELECT, INSERT, UPDATE ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;

-- 3) ENABLE RLS
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- 4) POLICIES
-- Members can read notifications for orgs they belong to
CREATE POLICY "org members read notification queue"
ON public.notification_queue
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = notification_queue.org_id
      AND m.user_id = auth.uid()
  )
);

-- Members can enqueue notifications for their org
CREATE POLICY "org members enqueue notifications"
ON public.notification_queue
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = notification_queue.org_id
      AND m.user_id = auth.uid()
  )
);

-- Only super-admins can update delivery state
CREATE POLICY "super admins manage notification queue"
ON public.notification_queue
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_notification_queue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notification_queue_updated_at
BEFORE UPDATE ON public.notification_queue
FOR EACH ROW
EXECUTE FUNCTION public.tg_notification_queue_updated_at();