ALTER TABLE auto_pick_jobs DROP CONSTRAINT auto_pick_jobs_job_type_check;
ALTER TABLE auto_pick_jobs ADD CONSTRAINT auto_pick_jobs_job_type_check
  CHECK (job_type IN ('continuation', 'recovery', 'timeout'));
