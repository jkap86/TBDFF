-- Migration 009: Update league_members role constraint
-- Add 'spectator' role option, remove unused 'owner' role

ALTER TABLE league_members
    DROP CONSTRAINT league_members_role_check,
    ADD CONSTRAINT league_members_role_check CHECK (role IN ('commissioner', 'member', 'spectator'));
