-- DB-backed job queue for auto-pick chain continuations and crash recovery.
-- Mirrors the auction_timers pattern but for normal draft auto-pick chains.

CREATE TABLE IF NOT EXISTS auto_pick_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    job_type        TEXT NOT NULL CHECK (job_type IN ('continuation', 'recovery')),
    run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_by      TEXT,
    claimed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one pending (unclaimed) job per draft at a time
CREATE UNIQUE INDEX idx_auto_pick_jobs_draft_pending
    ON auto_pick_jobs(draft_id)
    WHERE claimed_by IS NULL;

-- Poller query: find unclaimed jobs whose run_at has passed
CREATE INDEX idx_auto_pick_jobs_runnable
    ON auto_pick_jobs(run_at)
    WHERE claimed_by IS NULL;
