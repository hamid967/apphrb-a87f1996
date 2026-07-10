SELECT cron.alter_job(
  job_id := 1,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app/api/public/hooks/run-scheduled-scripts',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "45b01f70fcfd17adb50abab1b3a4a556e27e6b12c56b3a216f1837627bc13e95"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);