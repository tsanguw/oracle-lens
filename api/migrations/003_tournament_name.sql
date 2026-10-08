-- Human-readable tournament name (Tournaments.Name), e.g. "LCK 2026 Rounds 3-4".
ALTER TABLE tournament ADD COLUMN name TEXT;
UPDATE tournament SET name = leaguepedia_name WHERE name IS NULL;
ALTER TABLE tournament ALTER COLUMN name SET NOT NULL;
