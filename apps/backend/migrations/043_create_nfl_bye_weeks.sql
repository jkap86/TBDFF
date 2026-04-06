CREATE TABLE nfl_bye_weeks (
  season TEXT NOT NULL,
  team TEXT NOT NULL,
  bye_week INT NOT NULL,
  PRIMARY KEY (season, team)
);
