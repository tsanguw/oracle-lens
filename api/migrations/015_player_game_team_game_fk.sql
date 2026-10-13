-- A player's row must belong to a team that played that game, with the side and result that team had.
--
-- player_game.side and .win are copies of team_game's, kept on purpose: every player page aggregates over player_game and
-- reads them without a join. Until now nothing stopped the copy drifting, or a player row naming a team that was never in
-- the game (sync/verify.py only reported it afterwards). A foreign key over all four columns makes both impossible:
-- (game_id, team_id) must be a team that played the game, and (side, win) must be what that team's own row says.
--
-- CASCADE both ways: deleting a game's team rows (the sync replaces a game's rows wholesale) takes its player rows with it,
-- and repair_names.py merging one team into another updates team_game first, which must carry the player rows along.
ALTER TABLE team_game
  ADD CONSTRAINT team_game_game_team_side_win_key UNIQUE (game_id, team_id, side, win);

ALTER TABLE player_game
  ADD CONSTRAINT player_game_team_game_fkey
  FOREIGN KEY (game_id, team_id, side, win) REFERENCES team_game (game_id, team_id, side, win)
  ON DELETE CASCADE ON UPDATE CASCADE;
