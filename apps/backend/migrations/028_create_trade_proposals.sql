-- Trade proposals between two teams
CREATE TABLE IF NOT EXISTS trade_proposals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id           UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'review', 'vetoed', 'completed', 'countered', 'expired')),
    proposed_by         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proposed_to         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week                INTEGER,
    message             TEXT,
    review_expires_at   TIMESTAMPTZ,
    transaction_id      UUID REFERENCES transactions(id) ON DELETE SET NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_proposals_league ON trade_proposals(league_id);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_proposed_by ON trade_proposals(proposed_by);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_proposed_to ON trade_proposals(proposed_to);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_status ON trade_proposals(status);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_review_expires
    ON trade_proposals(review_expires_at)
    WHERE status = 'review';

CREATE TRIGGER set_trade_proposals_updated_at
    BEFORE UPDATE ON trade_proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
