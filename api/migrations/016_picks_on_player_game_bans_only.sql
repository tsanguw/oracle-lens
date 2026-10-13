-- A champion pick was stored twice: as a pick_ban row (action = 'pick') and as player_game.champion_id. The two came from
-- separate sync paths and nothing tied them together. player_game is the one the site reads for picks, so it is now the
-- only record of them, and pick_ban keeps just the bans (it becomes game_ban).
--
-- What a pick row had that player_game did not is its place in the draft, so that moves onto the player's row first.

-- 1. The pick's place in its team's draft (1-5), where Leaguepedia's PicksAndBansS7 gave one. NULL when unknown: games
--    whose picks came only from the scoreboard lists have no real draft order, and a champion listed twice by one team
--    (a source error: two players on the same champion in one game) cannot be told apart.
ALTER TABLE player_game ADD COLUMN pick_order SMALLINT CHECK (pick_order BETWEEN 1 AND 5);

-- 2. Refuse to run if deleting the pick rows would lose a pick: every one must already be on a player_game row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pick_ban pb
    WHERE pb.action = 'pick'
      AND NOT EXISTS (SELECT 1 FROM player_game pg
                      WHERE pg.game_id = pb.game_id AND pg.team_id = pb.team_id AND pg.champion_id = pb.champion_id)
  ) THEN
    RAISE EXCEPTION 'pick_ban has picks that player_game does not; refusing to delete them';
  END IF;
END $$;

-- 3. Carry the draft order across, only where one pick row meets one player row.
WITH ordered AS (
  SELECT game_id, team_id, champion_id, MIN(draft_order) AS draft_order
  FROM pick_ban
  WHERE action = 'pick' AND draft_order IS NOT NULL
  GROUP BY game_id, team_id, champion_id
  HAVING COUNT(*) = 1
)
UPDATE player_game pg SET pick_order = o.draft_order
FROM ordered o
WHERE o.game_id = pg.game_id AND o.team_id = pg.team_id AND o.champion_id = pg.champion_id
  AND (SELECT COUNT(*) FROM player_game x
       WHERE x.game_id = pg.game_id AND x.team_id = pg.team_id AND x.champion_id = pg.champion_id) = 1;

-- 4. Only bans are left in the table, so the action column says nothing; drop it (and its CHECK) and rename.
DELETE FROM pick_ban WHERE action = 'pick';
ALTER TABLE pick_ban DROP COLUMN action;

ALTER TABLE pick_ban RENAME TO game_ban;
ALTER INDEX pick_ban_pkey RENAME TO game_ban_pkey;
ALTER INDEX pick_ban_game RENAME TO game_ban_game;
ALTER SEQUENCE pick_ban_id_seq RENAME TO game_ban_id_seq;
ALTER TABLE game_ban RENAME CONSTRAINT pick_ban_game_id_fkey TO game_ban_game_id_fkey;
ALTER TABLE game_ban RENAME CONSTRAINT pick_ban_team_id_fkey TO game_ban_team_id_fkey;
ALTER TABLE game_ban RENAME CONSTRAINT pick_ban_champion_id_fkey TO game_ban_champion_id_fkey;

COMMENT ON COLUMN game_ban.draft_order IS 'Slot 1-5 within that team''s bans';
COMMENT ON COLUMN player_game.pick_order IS 'Place 1-5 in the team''s draft, NULL when unknown';
