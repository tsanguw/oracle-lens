-- Leaguepedia leaves `split` empty on some domestic events that belong to a split: playoffs of some
-- older splits, Regional Finals, and the 2025 LTA playoffs (split and stage are separate concepts, so
-- a playoffs event should carry its split and differ only by stage).
--
-- assign_missing_splits() gives each such event the split of the most recent earlier tournament of the
-- same league and year (same sub-region for LCP's predecessors). For multi-league events (the combined
-- LTA playoffs) the participating teams' leagues are used. Events with no earlier split in their year
-- (e.g. a promotion event that starts the year before) stay NULL; internationals are never touched.
--
-- The sync re-upserts raw values, so it calls this after each run. Returns how many events changed;
-- re-running changes nothing.
CREATE OR REPLACE FUNCTION assign_missing_splits() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  changed integer;
BEGIN
  WITH derived AS (
    SELECT t.id,
           (SELECT x.split
            FROM tournament x
            WHERE x.split IS NOT NULL
              AND NOT x.is_international
              AND x.year = t.year
              AND x.start_date <= t.start_date
              AND x.sub_region IS NOT DISTINCT FROM t.sub_region
              AND (
                (t.league_id IS NOT NULL AND x.league_id = t.league_id)
                OR (t.league_id IS NULL AND x.league_id IN (
                      SELECT ttl.league_id FROM tournament_team_league ttl WHERE ttl.tournament_id = t.id))
              )
            ORDER BY x.start_date DESC, x.id
            LIMIT 1) AS split
    FROM tournament t
    WHERE t.split IS NULL AND NOT t.is_international AND t.start_date IS NOT NULL
  )
  UPDATE tournament t SET split = d.split
  FROM derived d
  WHERE d.id = t.id AND d.split IS NOT NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
