CREATE TABLE IF NOT EXISTS matchup_derbies (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','complete')),
    derby_order      JSONB NOT NULL DEFAULT '[]',
    picks            JSONB NOT NULL DEFAULT '[]',
    current_pick_index INTEGER NOT NULL DEFAULT 0,
    total_picks      INTEGER NOT NULL DEFAULT 0,
    pick_timer       INTEGER NOT NULL DEFAULT 120,
    pick_deadline    TIMESTAMPTZ,
    timeout_action   INTEGER NOT NULL DEFAULT 0,
    skipped_users    TEXT[] NOT NULL DEFAULT '{}',
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active derby per league at a time
CREATE UNIQUE INDEX idx_matchup_derbies_league_active
    ON matchup_derbies(league_id) WHERE status IN ('pending','active');

CREATE INDEX idx_matchup_derbies_league_id ON matchup_derbies(league_id);

CREATE TRIGGER set_matchup_derbies_updated_at
    BEFORE UPDATE ON matchup_derbies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
