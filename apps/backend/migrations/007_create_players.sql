-- Core players table
CREATE TABLE IF NOT EXISTS players (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity fields
    first_name         TEXT,
    last_name          TEXT,
    full_name          TEXT NOT NULL,

    -- Position & team
    position           TEXT,                    -- Primary position (QB, RB, etc.)
    fantasy_positions  TEXT[] DEFAULT '{}',     -- All eligible positions for FLEX logic
    team               TEXT,                    -- Current NFL team code (KC, DAL, null=FA)

    -- Status fields
    active             BOOLEAN DEFAULT true,    -- On NFL roster
    injury_status      TEXT,                    -- Out, Doubtful, Questionable, Probable, null

    -- Metadata
    years_exp          INTEGER,
    age                INTEGER,
    jersey_number      INTEGER,

    -- Timestamps
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT players_position_check CHECK (
        position IN ('QB','RB','WR','TE','K','DEF','DL','LB','DB')
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_players_active ON players(active);
CREATE INDEX IF NOT EXISTS idx_players_full_name ON players(full_name);

-- Auto-update trigger
CREATE TRIGGER set_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- External provider ID mapping (CRITICAL for decoupling)
CREATE TABLE IF NOT EXISTS player_external_ids (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL,           -- 'sleeper', 'espn', 'yahoo', 'fantasypros', etc.
    external_id  TEXT NOT NULL,           -- Provider-specific player ID
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT player_external_ids_unique UNIQUE (provider, external_id),
    CONSTRAINT player_external_ids_one_per_provider UNIQUE (player_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_player_external_ids_provider ON player_external_ids(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_player_external_ids_player ON player_external_ids(player_id);
