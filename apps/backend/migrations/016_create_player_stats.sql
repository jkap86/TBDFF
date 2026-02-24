-- player_stats: actual game stats (JSONB keys match Sleeper stat names and LeagueScoringSettings keys)
CREATE TABLE IF NOT EXISTS player_stats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season          TEXT NOT NULL,
    week            INTEGER NOT NULL,
    season_type     TEXT NOT NULL DEFAULT 'regular',
    stats           JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_stats_unique
    ON player_stats(player_id, season, week, season_type);

CREATE INDEX IF NOT EXISTS idx_player_stats_season_week
    ON player_stats(season, week, season_type);

CREATE TRIGGER set_player_stats_updated_at
    BEFORE UPDATE ON player_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- player_projections: projected stats (separate table to prevent overwrites during live games)
CREATE TABLE IF NOT EXISTS player_projections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season          TEXT NOT NULL,
    week            INTEGER NOT NULL,
    season_type     TEXT NOT NULL DEFAULT 'regular',
    projections     JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_projections_unique
    ON player_projections(player_id, season, week, season_type);

CREATE INDEX IF NOT EXISTS idx_player_projections_season_week
    ON player_projections(season, week, season_type);

CREATE TRIGGER set_player_projections_updated_at
    BEFORE UPDATE ON player_projections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
