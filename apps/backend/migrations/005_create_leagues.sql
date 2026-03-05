CREATE TABLE IF NOT EXISTS leagues (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    sport              TEXT NOT NULL DEFAULT 'nfl',
    season             TEXT NOT NULL,
    season_type        TEXT NOT NULL DEFAULT 'regular',
    status             TEXT NOT NULL DEFAULT 'not_filled',
    total_rosters      INT NOT NULL DEFAULT 12,
    avatar             TEXT,
    draft_id           UUID,
    previous_league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
    settings           JSONB NOT NULL DEFAULT '{}',
    scoring_settings   JSONB NOT NULL DEFAULT '{}',
    roster_positions   TEXT[] NOT NULL DEFAULT ARRAY['QB','RB','RB','WR','WR','TE','FLEX','FLEX','SUPER_FLEX','K','DEF','BN','BN','BN','BN','BN','IR'],
    created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT leagues_status_check CHECK (status IN ('not_filled','offseason','reg_season','post_season','complete')),
    CONSTRAINT leagues_season_type_check CHECK (season_type IN ('regular','pre','post')),
    CONSTRAINT leagues_total_rosters_check CHECK (total_rosters BETWEEN 2 AND 32)
);

CREATE INDEX IF NOT EXISTS idx_leagues_created_by ON leagues(created_by);
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

CREATE TRIGGER set_leagues_updated_at
    BEFORE UPDATE ON leagues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
