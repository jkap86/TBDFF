-- Waiver claims for player acquisition
CREATE TABLE IF NOT EXISTS waiver_claims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    roster_id       INTEGER NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_id       TEXT NOT NULL,
    drop_player_id  TEXT,
    faab_amount     INTEGER NOT NULL DEFAULT 0,
    priority        INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'successful', 'outbid', 'cancelled', 'failed', 'invalid')),
    process_at      TIMESTAMPTZ,
    processed_at    TIMESTAMPTZ,
    transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_user ON waiver_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_process_at
    ON waiver_claims(process_at)
    WHERE status = 'pending';

CREATE TRIGGER set_waiver_claims_updated_at
    BEFORE UPDATE ON waiver_claims
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
