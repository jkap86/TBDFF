-- Rename tracked migration entry if it exists (idempotent for existing DBs)
UPDATE schema_migrations
SET name = '024_add_draft_picks_roster_check.sql'
WHERE name = '022_add_draft_picks_roster_check.sql';
