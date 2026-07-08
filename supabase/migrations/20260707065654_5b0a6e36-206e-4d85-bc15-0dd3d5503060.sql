ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON public.notifications(archived_at) WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.notifications.archived_at IS 'When the notification was archived (soft-delete) by the user';