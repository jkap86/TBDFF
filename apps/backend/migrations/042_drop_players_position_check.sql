-- Drop the position check constraint to allow all NFL positions from the provider
-- (e.g. C, G, T, OL, OT, SS, FS, CB, DE, DT, etc.)
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_position_check;
