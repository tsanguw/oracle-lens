import type pg from 'pg'
import { z } from 'zod'

export const searchSchema = z.object({
  q: z.string().trim().max(60).default(''),
  limit: z.coerce.number().int().min(1).max(10).default(4),
})

export const recentSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

/** Escapes LIKE wildcards so a visitor typing "%" or "_" searches for the literal character. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Prefix matches rank before substring matches; callers add their own tiebreak. */
const rank = (col: string) => `(CASE WHEN ${col} ILIKE $2 THEN 0 ELSE 1 END)`

export interface SearchResults {
  players: { page: string; name: string; role: string | null; team: string | null }[]
  teams: { name: string; league: string | null }[]
  champions: { name: string; role: string | null }[]
  tournaments: { id: number; slug: string; name: string; status: 'In progress' | 'Completed' }[]
}

/**
 * True for a tournament that is an event of its own: everything except a play-in whose main event is loaded (those are
 * part of the main event; see the `event` view). `alias` is the tournament table's alias in the query.
 */
export const IS_EVENT_HEAD = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM tournament_group tg WHERE tg.id = ${alias}.id AND tg.group_id <> ${alias}.id)`

export const STATUS_SQL = `(CASE WHEN t.start_date <= CURRENT_DATE AND t.end_date >= CURRENT_DATE THEN 'In progress' ELSE 'Completed' END)`

export async function search(pool: pg.Pool, { q, limit }: z.infer<typeof searchSchema>): Promise<SearchResults> {
  const empty: SearchResults = { players: [], teams: [], champions: [], tournaments: [] }
  if (q.length < 2) return empty
  const prefix = `${likeEscape(q)}%`
  const contains = `%${likeEscape(q)}%`
  const args = [contains, prefix, limit]

  const [players, teams, champions, tournaments] = await Promise.all([
    pool.query(
      `SELECT p.name AS page, COALESCE(p.display_name, p.name) AS name, last.role, last.team
       FROM player p
       LEFT JOIN LATERAL (
         SELECT pgm.role, tm.name AS team FROM player_game pgm
         JOIN game g ON g.id = pgm.game_id JOIN team tm ON tm.id = pgm.team_id
         WHERE pgm.player_id = p.id ORDER BY g.played_at DESC NULLS LAST LIMIT 1) last ON true
       WHERE p.name ILIKE $1 OR p.display_name ILIKE $1
          OR EXISTS (SELECT 1 FROM player_alias a WHERE a.player_id = p.id AND a.old_name ILIKE $1)
       ORDER BY ${rank('COALESCE(p.display_name, p.name)')}, (last.team IS NULL), p.name LIMIT $3`,
      args,
    ),
    pool.query(
      `SELECT tm.name, last.league
       FROM team tm
       LEFT JOIN LATERAL (
         SELECT l.name AS league, g.played_at FROM team_game tg
         JOIN game g ON g.id = tg.game_id JOIN tournament t ON t.id = g.tournament_id
         LEFT JOIN tournament_team_league ttl ON ttl.tournament_id = t.id AND ttl.team_id = tm.id
         LEFT JOIN league l ON l.id = COALESCE(ttl.league_id, t.league_id)
         WHERE tg.team_id = tm.id AND l.id IS NOT NULL ORDER BY g.played_at DESC NULLS LAST LIMIT 1) last ON true
       WHERE tm.name ILIKE $1 OR EXISTS (SELECT 1 FROM team_alias a WHERE a.team_id = tm.id AND a.old_name ILIKE $1)
       ORDER BY ${rank('tm.name')}, last.played_at DESC NULLS LAST, tm.name LIMIT $3`,
      args,
    ),
    pool.query(
      `SELECT c.name, (SELECT mode() WITHIN GROUP (ORDER BY pgm.role) FROM player_game pgm WHERE pgm.champion_id = c.id) AS role
       FROM champion c WHERE c.name ILIKE $1
       ORDER BY ${rank('c.name')}, c.name LIMIT $3`,
      args,
    ),
    pool.query(
      `SELECT t.id, es.slug, t.name, ${STATUS_SQL} AS status
       FROM event t JOIN event_slug es ON es.id = t.id
       WHERE t.name ILIKE $1 AND EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = ANY(t.member_ids))
       ORDER BY ${rank('t.name')}, t.start_date DESC NULLS LAST, t.name LIMIT $3`,
      args,
    ),
  ])
  return { players: players.rows, teams: teams.rows, champions: champions.rows, tournaments: tournaments.rows }
}

export interface RecentTournament {
  id: number
  slug: string
  name: string
  league: string
  status: 'In progress' | 'Completed'
  startDate: string | null
  endDate: string | null
  /** "Leading" while running, "Champion" for finished playoffs and internationals, "Top record" for other finished events (a play-in too). */
  standingLabel: string | null
  standingTeam: string | null
}

/**
 * Finished events whose standing is the winner of the last series: playoffs and internationals. A play-in is stored as
 * a qualifier and has no champion (several teams go through), so it falls back to the team with the most series wins.
 */
const CROWNS_CHAMPION = `(t.stage = 'Playoffs' OR (t.is_international AND t.stage IS DISTINCT FROM 'Qualifier'))`

/**
 * Most recent official events with games, newest start first. Qualifiers are left out, except an international
 * play-in (Worlds, MSI): it is listed on its own until its main event is loaded, then as part of that event (the
 * `event` view folds it in, so it never shows twice). The standing is the winner of the last series for finished
 * playoffs and internationals, otherwise the team with the most series wins.
 */
export async function recentTournaments(pool: pg.Pool, limit: number): Promise<RecentTournament[]> {
  const { rows } = await pool.query(
    `SELECT t.id, es.slug, t.name, COALESCE(l.name, 'INTL') AS league, ${STATUS_SQL} AS status,
       to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
       CASE WHEN ${STATUS_SQL} = 'In progress' THEN 'Leading'
            WHEN ${CROWNS_CHAMPION} THEN 'Champion'
            ELSE 'Top record' END AS "standingLabel",
       st.name AS "standingTeam"
     FROM (
       SELECT * FROM event x
       WHERE (x.stage IS DISTINCT FROM 'Qualifier' OR (x.is_international AND x.leaguepedia_name LIKE '%/Play-In'))
         AND EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = ANY(x.member_ids))
       ORDER BY x.start_date DESC NULLS LAST, x.id DESC LIMIT $1) t
     LEFT JOIN league l ON l.id = t.league_id
     JOIN event_slug es ON es.id = t.id
     LEFT JOIN LATERAL (
       SELECT w.name
       FROM (SELECT s.winner_id, MAX(g.played_at) AS last_game
             FROM series s JOIN game g ON g.series_id = s.id
             WHERE s.tournament_id = t.id AND s.winner_id IS NOT NULL
             GROUP BY s.id, s.winner_id) x
       JOIN team w ON w.id = x.winner_id
       GROUP BY w.id, w.name
       ORDER BY (CASE WHEN ${STATUS_SQL} = 'Completed' AND ${CROWNS_CHAMPION}
                      THEN MAX(x.last_game) END) DESC NULLS LAST,
                COUNT(*) DESC, w.name
       LIMIT 1) st ON true
     ORDER BY t.start_date DESC NULLS LAST, t.id DESC`,
    [limit],
  )
  return rows
}
