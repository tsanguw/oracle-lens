-- Changes driven by the Leaguepedia field audit (sync/FIELDS.md).

-- Leaguepedia tracks rift heralds and void grubs separately.
ALTER TABLE team_game ADD COLUMN void_grubs INT;

-- Stable Leaguepedia key so series upserts are idempotent (MatchSchedule.MatchId).
ALTER TABLE series ADD COLUMN leaguepedia_id TEXT UNIQUE;
ALTER TABLE series ADD COLUMN best_of INT;

-- player.name is the unique Leaguepedia page (e.g. "Zeka (Kim Geon-woo)"); display_name is the in-game ID.
ALTER TABLE player ADD COLUMN display_name TEXT;

-- Draft slot within each team's picks or bans (1-5); picks are in draft order.
COMMENT ON COLUMN pick_ban.draft_order IS 'Slot 1-5 within that team''s bans or picks';
