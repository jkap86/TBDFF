-- Prevent the same player from being picked twice in one draft
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_picks_no_dupes
ON draft_picks(draft_id, player_id) WHERE player_id IS NOT NULL;
