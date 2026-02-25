-- Add waiver budget column to rosters for atomic FAAB deduction
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS waiver_budget INTEGER NOT NULL DEFAULT 100;

-- Track when dropped players become free agents
CREATE TABLE IF NOT EXISTS player_waivers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    player_id       TEXT NOT NULL,
    dropped_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    waiver_expires  TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_waivers_league ON player_waivers(league_id);
CREATE INDEX IF NOT EXISTS idx_player_waivers_expires ON player_waivers(waiver_expires);
