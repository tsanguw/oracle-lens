-- Which teams a player has been on and when, from Leaguepedia's RosterChanges (join/leave rows), not from games played:
-- a game only proves a player was on a team that day, never when they signed, were benched or left.
-- One row per stint: a run with one team, with role swaps, contract extensions and renames already merged by the sync.
-- Teams we hold no games for are kept too (team_id NULL, plain team_name) so a career reads complete.
-- end_date NULL means the stint is still running, unless end_unknown: Leaguepedia has a Join and nothing since (no Leave,
-- and no roster row of any kind for the player in years), so it is not known to be running. Dates are day-precise in
-- Leaguepedia but shown to the month.
-- role is the player's first in-game role; role_modifier is Leaguepedia's "Sub" or "Trainee". inactive means the player
-- was inactive when they left; loan marks a stint on loan from another team.
CREATE TABLE player_team_stint (
  id            SERIAL PRIMARY KEY,
  player_id     INT  NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  team_name     TEXT NOT NULL,
  team_id       INT  REFERENCES team(id) ON DELETE SET NULL,
  region        TEXT,
  role          TEXT,
  role_modifier TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE,
  end_unknown   BOOLEAN NOT NULL DEFAULT false,
  inactive      BOOLEAN NOT NULL DEFAULT false,
  loan          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX player_team_stint_player ON player_team_stint (player_id, start_date);
