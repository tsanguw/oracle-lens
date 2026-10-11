-- Readable addresses for events: /tournaments/worlds-2025 instead of /tournaments/587.
--
-- The slug is the event's name in lower case with every run of other characters turned into one hyphen. It is derived,
-- not stored, so nothing has to keep it up to date and the sync needs no change. Two events that would get the same slug
-- (the earlier one keeps it, so an address never moves when a later event repeats a name) get "-<id>" added, and a name
-- that is only digits gets "event-" in front, so a slug can never be mistaken for an old numeric address.
--
--   event_slug       one row per event (see the `event` view): its slug
--   tournament_slug  every tournament -> the slug of the event it belongs to (a play-in gives its competition's slug)
CREATE VIEW event_slug AS
SELECT e.id,
       CASE WHEN row_number() OVER (PARTITION BY b.base ORDER BY e.id) = 1 THEN b.base ELSE b.base || '-' || e.id END AS slug
FROM event e
CROSS JOIN LATERAL (
  SELECT CASE
           WHEN s = '' THEN 'event'
           WHEN s ~ '^[0-9]+$' THEN 'event-' || s
           ELSE s
         END AS base
  FROM (SELECT trim(both '-' from regexp_replace(lower(e.name), '[^a-z0-9]+', '-', 'g')) AS s) x
) b;

CREATE VIEW tournament_slug AS
SELECT g.id, s.slug
FROM tournament_group g
JOIN event_slug s ON s.id = g.group_id;
