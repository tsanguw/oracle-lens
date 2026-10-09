-- Names that look like "no value" markers rather than real entities. Run: psql -f placeholders.sql
SELECT 'player' AS kind, name, (SELECT COUNT(*) FROM player_game x WHERE x.player_id = p.id) AS rows
FROM player p WHERE lower(name) IN ('none', 'null', 'tbd', 'tba', 'unknown', 'missing data', 'missing', 'n/a', '-', '')
   OR name ~ '^\s*$'
UNION ALL
SELECT 'team', name, (SELECT COUNT(*) FROM team_game x WHERE x.team_id = t.id)
FROM team t WHERE lower(name) IN ('none', 'null', 'tbd', 'tba', 'unknown', 'missing data', 'n/a', '-', '')
   OR name ~ '^\s*$'
UNION ALL
SELECT 'champion', name, (SELECT COUNT(*) FROM pick_ban x WHERE x.champion_id = c.id)
FROM champion c WHERE lower(name) IN ('none', 'null', 'tbd', 'unknown', 'missing data', 'n/a', '-', '')
ORDER BY 1, 2;
