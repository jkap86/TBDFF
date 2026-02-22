CREATE TABLE IF NOT EXISTS rosters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roster_id       INTEGER NOT NULL,
    league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    players         TEXT[] NOT NULL DEFAULT '{}',
    starters        TEXT[] NOT NULL DEFAULT '{}',
    reserve         TEXT[] NOT NULL DEFAULT '{}',
    taxi            TEXT[] NOT NULL DEFAULT '{}',
    settings        JSONB NOT NULL DEFAULT '{"wins":0,"losses":0,"ties":0,"fpts":0,"waiver_position":0}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rosters_league_roster_unique UNIQUE (league_id, roster_id),
    CONSTRAINT rosters_league_owner_unique UNIQUE (league_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_rosters_league_id ON rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_rosters_owner_id ON rosters(owner_id);

CREATE TRIGGER set_rosters_updated_at
    BEFORE UPDATE ON rosters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
