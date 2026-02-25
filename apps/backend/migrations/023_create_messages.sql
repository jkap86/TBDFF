CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id       UUID REFERENCES leagues(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  content         TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_scope_check CHECK (
    (league_id IS NOT NULL AND conversation_id IS NULL) OR
    (league_id IS NULL AND conversation_id IS NOT NULL)
  )
);

-- Composite indexes for efficient paginated queries (newest-first)
CREATE INDEX IF NOT EXISTS idx_messages_league_created
  ON messages(league_id, created_at DESC) WHERE league_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

CREATE TRIGGER set_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
