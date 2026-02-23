CREATE TABLE IF NOT EXISTS drafts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season            TEXT NOT NULL,
    sport             TEXT NOT NULL DEFAULT 'nfl',
    status            TEXT NOT NULL DEFAULT 'pre_draft' CHECK (status IN ('pre_draft','drafting','complete')),
    type              TEXT NOT NULL DEFAULT 'snake' CHECK (type IN ('snake','linear','3rr','auction')),
    start_time        TIMESTAMPTZ,
    last_picked       TIMESTAMPTZ,
    draft_order       JSONB NOT NULL DEFAULT '{}',
    slot_to_roster_id JSONB NOT NULL DEFAULT '{}',
    settings          JSONB NOT NULL DEFAULT '{}',
    metadata          JSONB NOT NULL DEFAULT '{}',
    created_by        UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_league_id ON drafts(league_id);

CREATE TRIGGER set_drafts_updated_at
    BEFORE UPDATE ON drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
