-- Draft queue: personal player queue per user per draft for autopick priority
CREATE TABLE IF NOT EXISTS draft_queue (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id  UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  rank      INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draft_id, user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_queue_lookup ON draft_queue(draft_id, user_id, rank);
