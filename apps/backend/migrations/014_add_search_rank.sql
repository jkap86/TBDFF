-- Add search_rank column for "best available" auto-pick ordering
ALTER TABLE players ADD COLUMN IF NOT EXISTS search_rank INTEGER;

CREATE INDEX IF NOT EXISTS idx_players_search_rank ON players(search_rank);
