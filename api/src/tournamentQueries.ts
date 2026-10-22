import type pg from 'pg'
import { z } from 'zod'
import { IS_LISTED, STATUS_SQL, statusSql, type EventStatus } from './homeQueries.js'
import { MIN_SAMPLE } from './filters.js'
import { FROM, ka, ok, perMin } from './playerQueries.js'

export const tournamentListSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() })

export interface TournamentRow {
  /** The tournament that heads the event: the main event when this is a play-in (see the `event` view). */
  id: number
  /** The readable address segment (`worlds-2025`), derived from the name; see the `event_slug` view. */
  slug: string
  /** Every tournament in the event, the head included: a competition's play-in and its main event. */
  memberIds: number[]
  name: string
  leaguepediaName: string
  league: string | null
  /** Leagues the teams belong to when the event has no single league (the combined 2025 LTA playoffs). */
  leagues: string[]
  year: number
  split: string | null
  stage: string | null
  isInternational: boolean
  status: EventStatus
  startDate: string | null
  endDate: string | null
}

/**
 * The event an address names: a slug (`worlds-2025`, any case) or an old numeric id. A play-in's id gives its
 * competition (the main event's row, dates stretched over both). The response's `slug` tells the page the address it
 * should be shown at, so numeric ids and play-in ids redirect to the readable one.
 */
export async function findTournament(pool: pg.Pool, ref: string): Promise<TournamentRow | null> {
  const byId = /^\d+$/.test(ref)
  if (!byId && !/^[a-z0-9-]{1,100}$/i.test(ref)) return null
  const { rows } = await pool.query(
    `SELECT t.id, es.slug, t.member_ids AS "memberIds", t.name, t.leaguepedia_name AS "leaguepediaName", l.name AS league, t.year, t.split, t.stage,
            t.is_international AS "isInternational", ${STATUS_SQL} AS status,
            to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
            COALESCE((SELECT array_agg(DISTINCT x.name ORDER BY x.name)
                      FROM tournament_team_league ttl JOIN league x ON x.id = ttl.league_id
                      WHERE ttl.tournament_id = ANY(t.member_ids)), '{}') AS leagues
     FROM event t LEFT JOIN league l ON l.id = t.league_id
     JOIN event_slug es ON es.id = t.id
     WHERE ${byId ? 't.id = (SELECT group_id FROM tournament_group WHERE id = $1::int)' : 'es.slug = lower($1)'}`,
    [ref],
  )
  return rows[0] ?? null
}

export interface TournamentSummary {
  games: number
  series: number
  teams: number
  avgGameLengthSec: number | null
  blueWinRate: number | null
  /** Average kills by both teams combined, per game. */
  killsPerGame: number | null
  patches: string[]
  /** "Leading" while running, "Champion" for finished playoffs and internationals, else "Top record". */
  standingLabel: string
  standingTeam: string | null
}

export async function loadTournamentSummary(pool: pg.Pool, t: TournamentRow): Promise<TournamentSummary | null> {
  const [agg, patches, standing] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT g.id)::int AS games,
              COUNT(DISTINCT g.series_id)::int AS series,
              COUNT(DISTINCT tg.team_id)::int AS teams,
              AVG(g.length_sec) FILTER (WHERE g.length_sec > 0)::float8 AS "avgGameLengthSec",
              AVG((tg.win)::int) FILTER (WHERE tg.side = 'blue')::float8 AS "blueWinRate",
              SUM(tg.kills)::float8 / NULLIF(COUNT(DISTINCT g.id) FILTER (WHERE tg.kills IS NOT NULL), 0) AS "killsPerGame"
       FROM game g JOIN team_game tg ON tg.game_id = g.id WHERE g.tournament_id = ANY($1::int[])`,
      [t.memberIds],
    ),
    pool.query(`SELECT DISTINCT patch FROM game WHERE tournament_id = ANY($1::int[]) AND patch IS NOT NULL`, [t.memberIds]),
    // the champion and the leader come from the main event alone: nobody wins a competition by winning its play-in
    pool.query(
      `SELECT w.name
       FROM (SELECT s.winner_id, s.id, MAX(g.played_at) AS last_game
             FROM series s JOIN game g ON g.series_id = s.id
             WHERE s.tournament_id = $1 AND s.winner_id IS NOT NULL GROUP BY s.id, s.winner_id) x
       JOIN team w ON w.id = x.winner_id
       GROUP BY w.id, w.name
       ORDER BY (CASE WHEN $2::boolean THEN MAX(x.last_game) END) DESC NULLS LAST, COUNT(*) DESC, w.name
       LIMIT 1`,
      [t.id, t.status === 'Completed' && (t.stage === 'Playoffs' || t.isInternational)],
    ),
  ])
  const a = agg.rows[0]
  if (!a || a.games === 0) return null
  return {
    ...a,
    patches: patches.rows
      .map((r) => r.patch as string)
      .sort((x, y) => patchKey(y) - patchKey(x)),
    standingLabel:
      t.status === 'In progress' ? 'Leading' : t.stage === 'Playoffs' || t.isInternational ? 'Champion' : 'Top record',
    standingTeam: standing.rows[0]?.name ?? null,
  }
}

/** Numeric patch order: 14.10 after 14.9. Unparseable labels sort last. */
const patchKey = (patch: string): number => {
  const [major, minor] = patch.split('.').map((p) => Number.parseInt(p, 10))
  return Number.isFinite(major) ? major * 1000 + (Number.isFinite(minor) ? minor : 0) : -1
}

export interface StandingRow {
  team: string
  seriesWins: number
  seriesLosses: number
  gameWins: number
  gameLosses: number
  gameWinRate: number
}

/** Series and game records per team, best series record first. */
export async function loadStandings(pool: pg.Pool, tournamentId: number, limit?: number): Promise<StandingRow[]> {
  const { rows } = await pool.query(
    `WITH games AS (
       SELECT tg.team_id, COUNT(*)::int AS played, COUNT(*) FILTER (WHERE tg.win)::int AS won
       FROM team_game tg JOIN game g ON g.id = tg.game_id WHERE g.tournament_id = $1 GROUP BY tg.team_id),
     decided AS (
       SELECT s.team1_id AS team_id, (s.winner_id = s.team1_id) AS won FROM series s
       WHERE s.tournament_id = $1 AND s.winner_id IS NOT NULL AND EXISTS (SELECT 1 FROM game g WHERE g.series_id = s.id)
       UNION ALL
       SELECT s.team2_id, (s.winner_id = s.team2_id) FROM series s
       WHERE s.tournament_id = $1 AND s.winner_id IS NOT NULL AND EXISTS (SELECT 1 FROM game g WHERE g.series_id = s.id)),
     sers AS (
       SELECT team_id, COUNT(*) FILTER (WHERE won)::int AS sw, COUNT(*) FILTER (WHERE NOT won)::int AS sl
       FROM decided GROUP BY team_id)
     SELECT t.name AS team, COALESCE(s.sw, 0) AS "seriesWins", COALESCE(s.sl, 0) AS "seriesLosses",
            g.won AS "gameWins", (g.played - g.won) AS "gameLosses"
     FROM games g JOIN team t ON t.id = g.team_id LEFT JOIN sers s ON s.team_id = g.team_id
     ORDER BY COALESCE(s.sw, 0) DESC, (g.won - (g.played - g.won)) DESC, t.name
     ${limit ? 'LIMIT $2' : ''}`,
    limit ? [tournamentId, limit] : [tournamentId],
  )
  return rows.map((r) => ({ ...r, gameWinRate: r.gameWins / (r.gameWins + r.gameLosses) }))
}

export interface SeriesRow {
  seriesId: number
  at: string | null
  team1: string | null
  team2: string | null
  winner: string | null
  /** Final score as team1-team2; null for series that have not been played. */
  score: string | null
  bestOf: number | null
}

export const SERIES_SELECT = `
  SELECT s.id AS "seriesId", COALESCE(s.scheduled_at, last.played_at) AS at,
         t1.name AS team1, t2.name AS team2, w.name AS winner, s.score, s.best_of AS "bestOf"
  FROM series s
  LEFT JOIN team t1 ON t1.id = s.team1_id LEFT JOIN team t2 ON t2.id = s.team2_id LEFT JOIN team w ON w.id = s.winner_id
  LEFT JOIN LATERAL (SELECT MAX(g.played_at) AS played_at FROM game g WHERE g.series_id = s.id) last ON true`

/** Every tournament of the event (its play-in too), newest first. */
export async function loadResults(pool: pg.Pool, tournamentIds: number[], limit = 30): Promise<SeriesRow[]> {
  const { rows } = await pool.query(
    `${SERIES_SELECT}
     WHERE s.tournament_id = ANY($1::int[]) AND s.winner_id IS NOT NULL AND EXISTS (SELECT 1 FROM game g WHERE g.series_id = s.id)
     ORDER BY at DESC NULLS LAST, s.id DESC LIMIT $2`,
    [tournamentIds, limit],
  )
  return rows
}

/** Series with both teams set that have not been played and are scheduled from now on. */
export async function loadUpcoming(pool: pg.Pool, tournamentIds: number[], limit = 5): Promise<SeriesRow[]> {
  const { rows } = await pool.query(
    `${SERIES_SELECT}
     WHERE s.tournament_id = ANY($1::int[]) AND s.winner_id IS NULL AND s.scheduled_at >= now()
       AND NOT EXISTS (SELECT 1 FROM game g WHERE g.series_id = s.id)
     ORDER BY s.scheduled_at LIMIT $2`,
    [tournamentIds, limit],
  )
  return rows.map((r) => ({ ...r, score: null }))
}

export interface TournamentPlayer {
  page: string
  name: string
  team: string | null
  role: string | null
  games: number
  winRate: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
}

/** Best KDA among players with the minimum sample; for very short events, everyone who played. */
export async function loadTournamentPlayers(
  pool: pg.Pool,
  tournamentIds: number[],
  limit = 10,
): Promise<{ minGames: number; players: TournamentPlayer[] }> {
  const run = async (minGames: number) =>
    pool.query(
      `SELECT p.name AS page, COALESCE(p.display_name, p.name) AS name,
         mode() WITHIN GROUP (ORDER BY pt.name) AS team,
         mode() WITHIN GROUP (ORDER BY pgm.role) AS role,
         COUNT(*)::int AS games,
         COUNT(*) FILTER (WHERE pgm.win)::float8 / COUNT(*) AS "winRate",
         CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
              THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
              ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
         END AS kda,
         SUM(${ka}) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL)::float8
           / NULLIF(SUM(tg.kills) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL), 0) AS "killParticipation",
         ${perMin('pgm.damage')} AS "damagePerMin"
       ${FROM}
       JOIN player p ON p.id = pgm.player_id JOIN team pt ON pt.id = pgm.team_id
       WHERE t.id = ANY($1::int[])
       GROUP BY p.id HAVING COUNT(*) >= $2
       ORDER BY kda DESC NULLS LAST, games DESC, p.name LIMIT $3`,
      [tournamentIds, minGames, limit],
    )
  let min = MIN_SAMPLE
  let res = await run(min)
  if (res.rows.length === 0) {
    min = 1
    res = await run(min)
  }
  return { minGames: min, players: res.rows }
}

export interface TournamentChampion {
  champion: string
  picks: number
  wins: number
  winRate: number | null
  bans: number
  /** Share of the event's games in which it was picked or banned. */
  presence: number
}

export async function loadTournamentChampions(pool: pg.Pool, tournamentIds: number[], limit = 15): Promise<TournamentChampion[]> {
  const { rows } = await pool.query(
    `WITH ev AS (
       SELECT pgm.game_id, pgm.champion_id, 'pick' AS kind, pgm.win
       FROM player_game pgm JOIN game g ON g.id = pgm.game_id WHERE g.tournament_id = ANY($1::int[])
       UNION ALL
       SELECT gb.game_id, gb.champion_id, 'ban', NULL::boolean
       FROM game_ban gb JOIN game g ON g.id = gb.game_id WHERE g.tournament_id = ANY($1::int[])),
     tot AS (SELECT COUNT(*)::float8 AS n FROM game WHERE tournament_id = ANY($1::int[]))
     SELECT c.name AS champion,
            COUNT(*) FILTER (WHERE ev.kind = 'pick')::int AS picks,
            COUNT(*) FILTER (WHERE ev.kind = 'pick' AND ev.win)::int AS wins,
            COUNT(*) FILTER (WHERE ev.kind = 'ban')::int AS bans,
            COUNT(DISTINCT ev.game_id) / (SELECT n FROM tot) AS presence
     FROM ev JOIN champion c ON c.id = ev.champion_id
     GROUP BY c.id ORDER BY presence DESC, picks DESC, c.name LIMIT $2`,
    [tournamentIds, limit],
  )
  return rows.map((r) => ({ ...r, winRate: r.picks > 0 ? r.wins / r.picks : null }))
}

export interface RelatedEvent {
  id: number
  slug: string
  name: string
  league: string
  status: EventStatus
  startDate: string | null
  endDate: string | null
}

/** Other events of the same league and year (or the other internationals of the year), in date order. */
export async function loadRelatedEvents(pool: pg.Pool, t: TournamentRow, limit = 6): Promise<RelatedEvent[]> {
  const { rows } = await pool.query(
    `SELECT x.id, es.slug, x.name, COALESCE(l.name, 'INTL') AS league, ${statusSql('x')} AS status,
            to_char(x.start_date, 'YYYY-MM-DD') AS "startDate", to_char(x.end_date, 'YYYY-MM-DD') AS "endDate"
     FROM event x LEFT JOIN league l ON l.id = x.league_id JOIN event_slug es ON es.id = x.id
     WHERE x.id <> $1 AND x.year = $2
       AND (CASE WHEN $3::boolean THEN x.is_international ELSE x.league_id IS NOT DISTINCT FROM $4::int AND NOT x.is_international END)
       AND x.stage IS DISTINCT FROM 'Qualifier'
       AND ${IS_LISTED('x')}
     ORDER BY x.start_date, x.id LIMIT $5`,
    [t.id, t.year, t.isInternational, (await leagueId(pool, t.id)) ?? null, limit],
  )
  return rows
}

async function leagueId(pool: pg.Pool, tournamentId: number): Promise<number | null> {
  const { rows } = await pool.query(`SELECT league_id FROM tournament WHERE id = $1`, [tournamentId])
  return rows[0]?.league_id ?? null
}
