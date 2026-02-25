-- Individual items in a trade (players, picks, FAAB)
CREATE TABLE IF NOT EXISTS trade_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id        UUID NOT NULL REFERENCES trade_proposals(id) ON DELETE CASCADE,
    side            TEXT NOT NULL CHECK (side IN ('proposer', 'receiver')),
    item_type       TEXT NOT NULL CHECK (item_type IN ('player', 'draft_pick', 'faab')),
    player_id       TEXT,
    draft_pick_id   UUID REFERENCES future_draft_picks(id) ON DELETE SET NULL,
    faab_amount     INTEGER,
    roster_id       INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT trade_items_player_check CHECK (
        (item_type = 'player' AND player_id IS NOT NULL) OR
        (item_type = 'draft_pick' AND draft_pick_id IS NOT NULL) OR
        (item_type = 'faab' AND faab_amount IS NOT NULL AND faab_amount > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_trade_items_trade ON trade_items(trade_id);
