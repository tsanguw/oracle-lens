-- Where a series sits in its event, from Leaguepedia's MatchSchedule: the round or stage it belongs to ("Quarterfinals",
-- "Bracket Round 2", "Swiss Round 3", "Play-In Day 1"), that round's order within the event, and the series' order
-- within the round. NULL when unknown. Brackets and stage tabs are built from these.
ALTER TABLE series ADD COLUMN IF NOT EXISTS stage_tab text;
ALTER TABLE series ADD COLUMN IF NOT EXISTS stage_order int;
ALTER TABLE series ADD COLUMN IF NOT EXISTS stage_match int;
