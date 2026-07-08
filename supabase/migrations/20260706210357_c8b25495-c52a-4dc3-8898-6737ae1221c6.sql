CREATE INDEX IF NOT EXISTS idx_filter_analytics_events_session_id ON public.filter_analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_filter_analytics_events_user_id ON public.filter_analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_filter_analytics_events_path ON public.filter_analytics_events (path);
CREATE INDEX IF NOT EXISTS idx_filter_analytics_events_created_at ON public.filter_analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_filter_analytics_events_user_created ON public.filter_analytics_events (user_id, created_at DESC);