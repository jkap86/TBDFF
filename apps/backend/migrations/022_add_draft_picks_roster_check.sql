-- Validate that draft_picks.roster_id references a valid roster within the draft's league.
-- A simple FK is not possible because rosters.roster_id is only unique per-league, not globally.
CREATE OR REPLACE FUNCTION validate_draft_pick_roster()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.roster_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM rosters r
    JOIN drafts d ON d.league_id = r.league_id
    WHERE d.id = NEW.draft_id
      AND r.roster_id = NEW.roster_id
  ) THEN
    RAISE EXCEPTION 'roster_id % does not exist in league for draft %', NEW.roster_id, NEW.draft_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_draft_pick_roster
  BEFORE INSERT OR UPDATE ON draft_picks
  FOR EACH ROW EXECUTE FUNCTION validate_draft_pick_roster();
