-- A play-in is part of its competition: "Worlds 2025 Play-In" belongs to "Worlds 2025". Leaguepedia keeps them as two
-- tournament pages ("<name>/Play-In" and "<name>/Main Event"), and the tables keep them as two rows, because their games
-- are different stages and the default leaderboards leave qualifiers out. These views put them back together for anything
-- that lists or opens events, without touching the games, so no statistic changes.
--
--   tournament_group  every tournament -> the tournament that heads its event (itself, unless it is a play-in whose
--                     main event is loaded)
--   event             one row per event: the head tournament's own columns, with the dates stretched over the whole
--                     event and `member_ids` listing every tournament in it
--
-- Which tournament is a play-in of which is read from the Leaguepedia page names, so a new Worlds or MSI joins up on its
-- own: "<x>/Play-In" belongs to "<x>/Main Event", and the LCK's "<x>/Season Play-In" to its "<x>/Season Playoffs".
CREATE VIEW tournament_group AS
SELECT t.id, COALESCE(main.id, t.id) AS group_id
FROM tournament t
LEFT JOIN tournament main
       ON main.id <> t.id
      AND main.leaguepedia_name = CASE
            WHEN t.leaguepedia_name LIKE '%/Play-In' THEN regexp_replace(t.leaguepedia_name, '/Play-In$', '/Main Event')
            WHEN t.leaguepedia_name LIKE '%/Season Play-In' THEN regexp_replace(t.leaguepedia_name, '/Season Play-In$', '/Season Playoffs')
          END;

CREATE VIEW event AS
SELECT m.id, m.leaguepedia_name, m.name, m.league_id, m.year, m.split, m.stage, m.is_international, m.sub_region,
       a.start_date, a.end_date, a.member_ids
FROM tournament m
JOIN (SELECT g.group_id, MIN(t.start_date) AS start_date, MAX(t.end_date) AS end_date, array_agg(t.id ORDER BY t.id) AS member_ids
      FROM tournament_group g JOIN tournament t ON t.id = g.id
      GROUP BY g.group_id) a ON a.group_id = m.id;

-- The competition is just "Worlds 2025", not "Worlds 2025 Main Event" (the sync now stores it that way too).
UPDATE tournament SET name = regexp_replace(name, ' Main Event$', '')
WHERE name LIKE '% Main Event' AND leaguepedia_name LIKE '%/Main Event';
