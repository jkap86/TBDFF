-- Add auction_value column for auto-bid valuation (VBD-based, derived from search_rank)
ALTER TABLE players ADD COLUMN IF NOT EXISTS auction_value INTEGER;

CREATE INDEX IF NOT EXISTS idx_players_auction_value ON players(auction_value);
