CREATE TABLE IF NOT EXISTS draft_picks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    player_id       TEXT,
    picked_by       UUID REFERENCES users(id),
    roster_id       INTEGER NOT NULL,
    round           INTEGER NOT NULL,
    pick_no         INTEGER NOT NULL,
    draft_slot      INTEGER NOT NULL,
    is_keeper       BOOLEAN DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT draft_picks_draft_round_pick UNIQUE (draft_id, round, pick_no)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_draft_id ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player_id ON draft_picks(player_id);
