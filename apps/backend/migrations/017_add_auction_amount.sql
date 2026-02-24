-- Add amount column for auction draft bids
ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS amount INTEGER;
