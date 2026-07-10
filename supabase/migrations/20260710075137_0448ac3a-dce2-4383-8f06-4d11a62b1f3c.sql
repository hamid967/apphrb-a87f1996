
CREATE OR REPLACE FUNCTION public.admin_update_cron_schedule(
  _jobname text,
  _schedule text,
  _active boolean DEFAULT NULL
)
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  _jid bigint;
BEGIN
  -- Only super_admin can alter cron schedules
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required';
  END IF;

  -- Allow only managed jobs
  IF _jobname NOT IN ('run-scheduled-scripts','dispatch-notifications','rent-reminders') THEN
    RAISE EXCEPTION 'unknown_job: %', _jobname;
  END IF;

  -- Basic cron expression validation: 5 space-separated fields
  IF _schedule IS NULL OR array_length(regexp_split_to_array(trim(_schedule), '\s+'), 1) <> 5 THEN
    RAISE EXCEPTION 'invalid_schedule: expected 5-field cron expression';
  END IF;

  SELECT j.jobid INTO _jid FROM cron.job j WHERE j.jobname = _jobname;
  IF _jid IS NULL THEN
    RAISE EXCEPTION 'job_not_found: %', _jobname;
  END IF;

  PERFORM cron.alter_job(job_id := _jid, schedule := _schedule);
  IF _active IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := _jid, active := _active);
  END IF;

  RETURN QUERY
    SELECT j.jobid, j.jobname, j.schedule, j.active
    FROM cron.job j WHERE j.jobid = _jid;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_cron_schedule(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_cron_schedule(text, text, boolean) TO authenticated, service_role;
