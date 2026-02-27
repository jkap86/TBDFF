-- Payment tracking for league buy-ins and payouts
CREATE TABLE IF NOT EXISTS league_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('buy_in', 'payout')),
    amount      NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    note        TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_league_payments_league ON league_payments(league_id);
CREATE INDEX IF NOT EXISTS idx_league_payments_user ON league_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_league_payments_type ON league_payments(type);

-- Prevent duplicate buy_in records for the same user in the same league
CREATE UNIQUE INDEX IF NOT EXISTS idx_league_payments_unique_buyin
    ON league_payments(league_id, user_id) WHERE type = 'buy_in';

CREATE TRIGGER set_league_payments_updated_at
    BEFORE UPDATE ON league_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
