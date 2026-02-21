CREATE TABLE IF NOT EXISTS league_members (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id    UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member',
    display_name TEXT,
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT league_members_unique UNIQUE (league_id, user_id),
    CONSTRAINT league_members_role_check CHECK (role IN ('owner','commissioner','member'))
);

CREATE INDEX IF NOT EXISTS idx_league_members_user_id ON league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league_id ON league_members(league_id);
