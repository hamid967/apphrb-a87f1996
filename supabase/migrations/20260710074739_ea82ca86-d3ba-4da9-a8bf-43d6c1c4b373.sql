-- List all pg_cron jobs with a best-effort URL extracted from the command text.
CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  command_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    (regexp_match(j.command, 'url\s*:?=\s*''([^'']+)'''))[1] AS command_url
  FROM cron.job j
  ORDER BY j.jobid ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_cron_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO service_role;

-- Recent runs for a specific job.
CREATE OR REPLACE FUNCTION public.admin_list_cron_runs(_jobid bigint, _limit int DEFAULT 20)
RETURNS TABLE (
  runid bigint,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  return_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT r.runid, r.start_time, r.end_time, r.status, r.return_message
  FROM cron.job_run_details r
  WHERE r.jobid = _jobid
  ORDER BY r.start_time DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_list_cron_runs(bigint, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_runs(bigint, int) TO service_role;

-- Recent HTTP responses whose target URL matches a substring (e.g. hook path).
CREATE OR REPLACE FUNCTION public.admin_list_http_responses(_url_like text, _limit int DEFAULT 20)
RETURNS TABLE (
  id bigint,
  created timestamptz,
  status_code int,
  content_preview text,
  timed_out boolean,
  error_msg text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, net
AS $$
  SELECT
    resp.id,
    resp.created,
    resp.status_code,
    LEFT(resp.content::text, 300) AS content_preview,
    resp.timed_out,
    resp.error_msg
  FROM net._http_response resp
  JOIN net.http_request_queue req ON req.id = resp.id
  WHERE req.url LIKE '%' || _url_like || '%'
  ORDER BY resp.created DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_list_http_responses(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_http_responses(text, int) TO service_role;