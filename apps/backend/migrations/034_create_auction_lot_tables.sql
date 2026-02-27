-- Add 'slow_auction' to the drafts.type CHECK constraint
ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_type_check;
ALTER TABLE drafts ADD CONSTRAINT drafts_type_check
    CHECK (type IN ('snake','linear','3rr','auction','slow_auction'));

-- auction_lots: Each nominated player in a slow auction
CREATE TABLE IF NOT EXISTS auction_lots (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id                UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    player_id               TEXT NOT NULL,
    nominator_roster_id     INTEGER NOT NULL,
    current_bid             INTEGER NOT NULL DEFAULT 1,
    current_bidder_roster_id INTEGER,
    bid_count               INTEGER NOT NULL DEFAULT 0,
    bid_deadline            TIMESTAMPTZ,
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','passed')),
    winning_roster_id       INTEGER,
    winning_bid             INTEGER,
    nomination_date         TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_lots_draft_id ON auction_lots(draft_id);
CREATE INDEX idx_auction_lots_status ON auction_lots(status);
CREATE INDEX idx_auction_lots_active_deadline ON auction_lots(bid_deadline)
    WHERE status = 'active';
CREATE UNIQUE INDEX idx_auction_lots_draft_player_active
    ON auction_lots(draft_id, player_id)
    WHERE status IN ('active', 'won');

CREATE TRIGGER set_auction_lots_updated_at
    BEFORE UPDATE ON auction_lots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- auction_proxy_bids: Sealed max bids per roster per lot
CREATE TABLE IF NOT EXISTS auction_proxy_bids (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id      UUID NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
    roster_id   INTEGER NOT NULL,
    max_bid     INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lot_id, roster_id)
);

CREATE INDEX idx_auction_proxy_bids_lot_id ON auction_proxy_bids(lot_id);

CREATE TRIGGER set_auction_proxy_bids_updated_at
    BEFORE UPDATE ON auction_proxy_bids
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- auction_bid_history: Audit trail of all bids
CREATE TABLE IF NOT EXISTS auction_bid_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id      UUID NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
    roster_id   INTEGER NOT NULL,
    bid_amount  INTEGER NOT NULL,
    is_proxy    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_bid_history_lot_id ON auction_bid_history(lot_id);
