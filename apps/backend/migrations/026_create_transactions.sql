-- Unified activity log for all roster transactions (trades, waivers, adds, drops)
CREATE TABLE IF NOT EXISTS transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('trade', 'waiver', 'free_agent', 'commissioner')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed', 'vetoed')),
    week            INTEGER,
    roster_ids      INTEGER[] NOT NULL DEFAULT '{}',
    player_ids      TEXT[] NOT NULL DEFAULT '{}',
    adds            JSONB NOT NULL DEFAULT '{}',
    drops           JSONB NOT NULL DEFAULT '{}',
    draft_pick_ids  UUID[] NOT NULL DEFAULT '{}',
    settings        JSONB NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_league_id ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_league_created ON transactions(league_id, created_at DESC);

CREATE TRIGGER set_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
