-- Add display_username column to preserve original casing.
-- The existing 'username' column stores the lowercase-normalized form for lookups.
-- display_username stores the user's preferred casing for display purposes.
ALTER TABLE users ADD COLUMN display_username TEXT;

-- Backfill existing users: use the current username value as display_username.
UPDATE users SET display_username = username WHERE display_username IS NULL;

-- Now make it NOT NULL after backfill
ALTER TABLE users ALTER COLUMN display_username SET NOT NULL;
