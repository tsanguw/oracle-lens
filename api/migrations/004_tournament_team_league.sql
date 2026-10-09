-- Multi-league tournaments (2025 LTA playoffs, with teams from both North and South) have no single
-- league. Each participating team's games count toward its own conference's league, recorded here.
-- Queries resolve a game's league as COALESCE(tournament_team_league.league_id, tournament.league_id).
CREATE TABLE tournament_team_league (
  tournament_id INT NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  team_id       INT NOT NULL REFERENCES team(id),
  league_id     INT NOT NULL REFERENCES league(id),
  PRIMARY KEY (tournament_id, team_id)
);
CREATE INDEX tournament_team_league_league ON tournament_team_league (league_id);
