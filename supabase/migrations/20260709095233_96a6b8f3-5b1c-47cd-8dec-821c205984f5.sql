
ALTER TABLE public.scripts_schedules
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_delay_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS current_retry integer NOT NULL DEFAULT 0;

ALTER TABLE public.scripts_schedules
  ADD CONSTRAINT scripts_schedules_max_retries_chk CHECK (max_retries >= 0 AND max_retries <= 10),
  ADD CONSTRAINT scripts_schedules_retry_delay_chk CHECK (retry_delay_minutes >= 1 AND retry_delay_minutes <= 1440);

ALTER TABLE public.scripts_schedule_runs
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;
