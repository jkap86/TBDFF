-- Fix league status default and constraint for new lifecycle statuses
ALTER TABLE leagues ALTER COLUMN status SET DEFAULT 'not_filled';

-- Drop old constraint if it exists, then add the correct one
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_status_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_status_check
  CHECK (status IN ('not_filled','offseason','reg_season','post_season','complete'));

-- Migrate any existing leagues still using the old 'pre_draft' status
UPDATE leagues SET status = 'not_filled' WHERE status = 'pre_draft';
