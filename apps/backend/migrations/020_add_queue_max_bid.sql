-- Add optional max_bid column to draft_queue for custom auction auto-bid limits
ALTER TABLE draft_queue ADD COLUMN max_bid INTEGER;
