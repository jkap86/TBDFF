-- Speed up countPicksWonByRoster / countPicksWonByRosters (auction pick count queries)
CREATE INDEX IF NOT EXISTS idx_draft_picks_roster_picks
  ON draft_picks(draft_id, roster_id) WHERE player_id IS NOT NULL;

-- Speed up findActiveDraftByLeagueId and similar league+status queries
CREATE INDEX IF NOT EXISTS idx_drafts_league_status
  ON drafts(league_id, status);
