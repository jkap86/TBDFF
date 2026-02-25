-- Tradeable draft picks before a draft exists
CREATE TABLE IF NOT EXISTS future_draft_picks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id           UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season              TEXT NOT NULL,
    round               INTEGER NOT NULL,
    original_owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roster_id           INTEGER NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, season, round, original_owner_id)
);

CREATE INDEX IF NOT EXISTS idx_future_draft_picks_league ON future_draft_picks(league_id);
CREATE INDEX IF NOT EXISTS idx_future_draft_picks_current_owner ON future_draft_picks(current_owner_id);

CREATE TRIGGER set_future_draft_picks_updated_at
    BEFORE UPDATE ON future_draft_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
