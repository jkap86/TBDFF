CREATE TABLE IF NOT EXISTS matchups (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id     UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    week          INTEGER NOT NULL,
    matchup_id    INTEGER NOT NULL,
    roster_id     INTEGER NOT NULL,
    points        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_league_week_roster
    ON matchups(league_id, week, roster_id);

CREATE TRIGGER set_matchups_updated_at
    BEFORE UPDATE ON matchups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
