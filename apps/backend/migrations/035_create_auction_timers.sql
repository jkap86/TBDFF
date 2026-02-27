-- Replaces in-memory setTimeout timers for fast auctions with DB-backed scheduling.
-- Enables multi-instance deployments: any instance can claim and process timers.

CREATE TABLE IF NOT EXISTS auction_timers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    timer_type      TEXT NOT NULL CHECK (timer_type IN ('auto_bid', 'deadline')),
    run_at          TIMESTAMPTZ NOT NULL,
    claimed_by      TEXT,
    claimed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one pending (unclaimed) timer per draft at a time.
-- INSERT ... ON CONFLICT replaces clearTimeout + re-schedule.
CREATE UNIQUE INDEX idx_auction_timers_draft_pending
    ON auction_timers(draft_id)
    WHERE claimed_by IS NULL;

-- Poller query: find unclaimed timers whose run_at has passed.
CREATE INDEX idx_auction_timers_runnable
    ON auction_timers(run_at)
    WHERE claimed_by IS NULL;
