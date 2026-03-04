-- Add message_type column: 'user' (default) or 'system'
ALTER TABLE messages
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'user'
  CHECK (message_type IN ('user', 'system'));

-- Allow sender_id to be NULL for system messages
ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;

-- Ensure user messages always have a sender and system messages never do
ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check CHECK (
  (message_type = 'user' AND sender_id IS NOT NULL) OR
  (message_type = 'system' AND sender_id IS NULL)
);

-- Optional metadata column for structured event data
ALTER TABLE messages ADD COLUMN metadata JSONB;
