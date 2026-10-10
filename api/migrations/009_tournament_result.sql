-- Final placement of each team in each event, from Leaguepedia's TournamentResults.
-- place is the text Leaguepedia shows ("1", "3-4", "9-16", "Q", "NQ"); place_number is its first number.
-- Group-stage events can have two teams with place "1" (one per group), so group_name is kept too.
CREATE TABLE tournament_result (
  tournament_id INT NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  team_id       INT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  place         TEXT NOT NULL,
  place_number  INT,
  group_name    TEXT,
  PRIMARY KEY (tournament_id, team_id)
);
CREATE INDEX tournament_result_team ON tournament_result (team_id);
