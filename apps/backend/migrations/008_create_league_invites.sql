-- Migration 008: Create league invites table
-- Supports username-based invitations with status tracking

CREATE TABLE IF NOT EXISTS league_invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    inviter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT league_invites_unique UNIQUE (league_id, invitee_id),
    CONSTRAINT league_invites_status_check CHECK (status IN ('pending', 'accepted', 'declined'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_league_invites_league_id ON league_invites(league_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_invitee_id ON league_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_inviter_id ON league_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_league_invites_status ON league_invites(status);

-- Composite index for common query: get pending invites for a user
CREATE INDEX IF NOT EXISTS idx_league_invites_invitee_status
    ON league_invites(invitee_id, status) WHERE status = 'pending';

-- Add updated_at trigger
CREATE TRIGGER set_league_invites_updated_at
    BEFORE UPDATE ON league_invites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Index for public leagues filtering (on settings JSONB field)
CREATE INDEX IF NOT EXISTS idx_leagues_settings_public
    ON leagues ((settings->>'public'))
    WHERE (settings->>'public')::int = 1;
