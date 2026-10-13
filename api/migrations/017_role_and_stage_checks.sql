-- Columns that are free text but only ever hold a small fixed set of values get a CHECK, so a typo or an odd value from
-- the source cannot quietly become a new "category" that shows up in filters and counts.
--
-- player_game.role: the five roles. Production has exactly these (71,372 rows each, none else). sync/lolsync/backfill.py
-- ROLES holds the same list and skips (and counts) any player row whose role is not one of them, so a new value from
-- Leaguepedia is reported instead of failing a tournament's load.
ALTER TABLE player_game
  ADD CONSTRAINT player_game_role_check CHECK (role IN ('Top', 'Jungle', 'Mid', 'Bot', 'Support'));

-- tournament.stage: the sync derives it from Leaguepedia's IsQualifier / IsPlayoffs flags with a fixed rule (never from
-- free text), so it is always one of these three; NULL stays allowed.
ALTER TABLE tournament
  ADD CONSTRAINT tournament_stage_check CHECK (stage IN ('Regular season', 'Playoffs', 'Qualifier'));

-- Not constrained here, on purpose: tournament.split and the region columns grow as Leaguepedia adds events and their
-- spellings differ between tables (team.region 'Latin America', player_team_stint.region 'LAS'), and
-- player_team_stint.role holds non-player rows ('Broadcast Talent', 'Substitute'). They need lookup tables or cleaning first.
