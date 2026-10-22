import type pg from 'pg'
import { z } from 'zod'
import { filterSchema, isAllTime, MIN_SAMPLE } from './filters.js'
import { IS_LISTED, likeEscape, STATUS_SQL, type EventStatus } from './homeQueries.js'
import { resolveChampionRange } from './championQueries.js'
import { resolveRange, type LeaderboardRange } from './leaderboardQueries.js'
import { ka, ok, FROM_CORE, perMin } from './playerQueries.js'
import type { ResponseCache } from './responseCache.js'

const paging = {
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(60).default(''),
}
const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true')

const dirSql = (dir: 'asc' | 'desc') => (dir === 'asc' ? 'ASC' : 'DESC')

/** Same joins as the player stats, but one row per team game (alias pgm = team_game). */
const FROM_TEAM = FROM_CORE.replace('player_game pgm', 'team_game pgm')

/* ------------------------------------------------------------------ teams */

export const TEAM_SORTS = ['winRate', 'games', 'goldDiff', 'killsPerGame', 'towersPerGame', 'avgGameLengthSec'] as const

export const teamsListSchema = filterSchema.omit({ role: true }).extend({
  ...paging,
  sort: z.enum(TEAM_SORTS).default('winRate'),
  qualifiers: flag,
})
export type TeamsListQuery = z.infer<typeof teamsListSchema>

export interface TeamListRow {
  rank: number
  name: string
  league: string | null
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  killsPerGame: number | null
  towersPerGame: number | null
  avgGameLengthSec: number | null
}

export interface ListResult<T> {
  range: LeaderboardRange
  minGames: number
  total: number
  page: number
  pageSize: number
  empty: boolean
  rows: T[]
}

export async function loadTeamsList(pool: pg.Pool, q: TeamsListQuery): Promise<ListResult<TeamListRow>> {
  const params: unknown[] = []
  const { conditions, range } = await resolveRange(pool, q, params)
  if (q.q) conditions.push(`pt.name ILIKE $${params.push(`%${likeEscape(q.q)}%`)}`)
  const limit = `$${params.push(q.pageSize)}`
  const offset = `$${params.push((q.page - 1) * q.pageSize)}`
  const min = `$${params.push(MIN_SAMPLE)}`
  const order = {
    winRate: '(COUNT(*) FILTER (WHERE pgm.win))::float8 / COUNT(*)',
    games: 'COUNT(*)',
    goldDiff: '"goldDiff"',
    killsPerGame: '"killsPerGame"',
    towersPerGame: '"towersPerGame"',
    avgGameLengthSec: '"avgGameLengthSec"',
  }[q.sort]

  const { rows } = await pool.query(
    `SELECT pt.name, mode() WITHIN GROUP (ORDER BY l.name) AS league,
       COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       AVG(pgm.gold - opp.gold)::float8 AS "goldDiff",
       AVG(pgm.kills)::float8 AS "killsPerGame",
       AVG(pgm.towers)::float8 AS "towersPerGame",
       AVG(g.length_sec)::float8 AS "avgGameLengthSec",
       COUNT(*) OVER ()::int AS total
     ${FROM_TEAM}
     JOIN team pt ON pt.id = pgm.team_id
     LEFT JOIN team_game opp ON opp.game_id = pgm.game_id AND opp.team_id <> pgm.team_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY pt.id HAVING COUNT(*) >= ${min}
     ORDER BY ${order} ${dirSql(q.dir)} NULLS LAST, games DESC, pt.name
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  const total: number = rows[0]?.total ?? 0
  const start = (q.page - 1) * q.pageSize
  return {
    range,
    minGames: MIN_SAMPLE,
    total,
    page: q.page,
    pageSize: q.pageSize,
    empty: total === 0,
    rows: rows.map(({ total: _t, ...r }, i) => ({ ...r, rank: start + i + 1, losses: r.games - r.wins, winRate: r.wins / r.games })),
  }
}

/* -------------------------------------------------------------- champions */

export const CHAMPION_SORTS = ['presence', 'games', 'winRate', 'pickRate', 'banRate', 'kda'] as const

export const championsListSchema = filterSchema.extend({
  ...paging,
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(CHAMPION_SORTS).default('presence'),
  qualifiers: flag,
})
export type ChampionsListQuery = z.infer<typeof championsListSchema>

export interface ChampionListRow {
  rank: number
  name: string
  role: string | null
  games: number
  wins: number
  winRate: number | null
  pickRate: number | null
  banRate: number | null
  presence: number | null
  kda: number | null
  underMinSample: boolean
}

/**
 * Picks (and the stats that go with them) respect the role and side filters; bans and presence are
 * champion-level and always count every game in the range, as on the champion page.
 *
 * Over all history the two queries take over a second, so with a `cache` their rows are kept per filter set
 * (not per sort, search or page: those are applied below, in memory, on every request).
 */
export async function loadChampionsList(pool: pg.Pool, q: ChampionsListQuery, cache?: ResponseCache): Promise<ListResult<ChampionListRow>> {
  const mainParams: unknown[] = []
  const main = await resolveChampionRange(pool, q, mainParams)
  const wideParams: unknown[] = []
  const wide = await resolveChampionRange(pool, { ...q, role: undefined, side: undefined }, wideParams)

  const fetchRows = () => Promise.all([
    pool.query(
      `SELECT c.id, c.name, mode() WITHIN GROUP (ORDER BY pgm.role) AS role,
         COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
         CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
              THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
              ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
         END AS kda
       ${FROM_CORE} JOIN champion c ON c.id = pgm.champion_id
       WHERE ${main.conditions.join(' AND ')}
       GROUP BY c.id`,
      mainParams,
    ),
    pool.query(
      `WITH games AS (SELECT DISTINCT pgm.game_id ${FROM_TEAM} WHERE ${wide.conditions.join(' AND ')}),
       ev AS (
         SELECT p.game_id, p.champion_id, false AS ban FROM player_game p JOIN games USING (game_id)
         UNION ALL
         SELECT b.game_id, b.champion_id, true FROM game_ban b JOIN games USING (game_id))
       SELECT c.id, c.name, COUNT(DISTINCT ev.game_id)::int AS present,
              COUNT(DISTINCT ev.game_id) FILTER (WHERE ev.ban)::int AS banned,
              (SELECT COUNT(*) FROM games)::int AS total
       FROM ev JOIN champion c ON c.id = ev.champion_id GROUP BY c.id`,
      wideParams,
    ),
  ])
  const { league, year, split, tournament, patch, range, side, role, domestic, qualifiers } = q
  const [picks, cover] =
    cache && isAllTime(q)
      ? await cache.get(`champions:${JSON.stringify({ league, year, split, tournament, patch, range, side, role, domestic, qualifiers })}`, fetchRows)
      : await fetchRows()

  const byId = new Map<number, { present: number; banned: number; total: number; name: string }>()
  for (const r of cover.rows) byId.set(r.id, r)
  const pickById = new Map<number, (typeof picks.rows)[number]>()
  for (const r of picks.rows) pickById.set(r.id, r)
  const total = cover.rows[0]?.total ?? 0

  // Every champion with a pick (in the role/side filters) or any presence at all; a role filter keeps only picked ones.
  const roleOrSide = Boolean(q.role || q.side)
  const ids = new Set<number>([...pickById.keys(), ...(roleOrSide ? [] : byId.keys())])
  const needle = q.q.toLowerCase()
  let rows: Omit<ChampionListRow, 'rank'>[] = []
  for (const id of ids) {
    const p = pickById.get(id)
    const c = byId.get(id)
    const name = (p?.name ?? c?.name) as string
    if (needle && !name.toLowerCase().includes(needle)) continue
    const games = p?.games ?? 0
    rows.push({
      name,
      role: p?.role ?? null,
      games,
      wins: p?.wins ?? 0,
      winRate: games > 0 ? p.wins / games : null,
      pickRate: total > 0 ? games / total : null,
      banRate: c && total > 0 ? c.banned / total : total > 0 ? 0 : null,
      presence: c && total > 0 ? c.present / total : total > 0 ? 0 : null,
      kda: p?.kda ?? null,
      underMinSample: games < MIN_SAMPLE,
    })
  }
  const key = q.sort
  const sign = q.dir === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    // Rate stats from tiny samples are noise: rows under the minimum rank after the rest, in either direction.
    if ((key === 'winRate' || key === 'kda') && a.underMinSample !== b.underMinSample) return a.underMinSample ? 1 : -1
    const av = a[key] as number | null
    const bv = b[key] as number | null
    if (av === null && bv === null) return a.name.localeCompare(b.name)
    if (av === null) return 1 // missing values always last
    if (bv === null) return -1
    return av === bv ? b.games - a.games || a.name.localeCompare(b.name) : (av - bv) * sign
  })
  const start = (q.page - 1) * q.pageSize
  const page = rows.slice(start, start + q.pageSize).map((r, i) => ({ ...r, rank: start + i + 1 }))
  return {
    range: main.range,
    minGames: MIN_SAMPLE,
    total: rows.length,
    page: q.page,
    pageSize: q.pageSize,
    empty: rows.length === 0,
    rows: page,
  }
}

/* ------------------------------------------------------------ tournaments */

export const TOURNAMENT_SORTS = ['date', 'name'] as const

export const tournamentsListSchema = z.object({
  league: z.string().min(1).optional(),
  year: z.coerce.number().int().optional(),
  /** Blank leaves qualifiers out; "Qualifier" lists only those. */
  stage: z.enum(['Regular season', 'Playoffs', 'Qualifier']).optional(),
  status: z.enum(['Upcoming', 'In progress', 'Completed']).optional(),
  ...paging,
  sort: z.enum(TOURNAMENT_SORTS).default('date'),
})
export type TournamentsListQuery = z.infer<typeof tournamentsListSchema>

export interface TournamentListRow {
  id: number
  slug: string
  name: string
  league: string
  stage: string | null
  year: number
  status: EventStatus
  startDate: string | null
  endDate: string | null
  games: number
  standingLabel: string
  standingTeam: string | null
}

export async function loadTournamentsList(
  pool: pg.Pool,
  q: TournamentsListQuery,
): Promise<{ total: number; page: number; pageSize: number; empty: boolean; rows: TournamentListRow[] }> {
  const params: unknown[] = []
  const p = (v: unknown) => `$${params.push(v)}`
  // one row per event (a play-in is part of its competition), counted over every tournament in it; an event with no
  // games yet is listed until it ends
  const conds = [IS_LISTED('t')]
  conds.push(q.stage ? `t.stage = ${p(q.stage)}` : `t.stage IS DISTINCT FROM 'Qualifier'`)
  if (q.league === 'INTL') conds.push('t.is_international')
  else if (q.league) {
    const v = p(q.league)
    conds.push(`(l.name = ${v} OR EXISTS (SELECT 1 FROM tournament_team_league z JOIN league zl ON zl.id = z.league_id WHERE z.tournament_id = t.id AND zl.name = ${v}))`)
  }
  if (q.year) conds.push(`t.year = ${p(q.year)}`)
  if (q.status) conds.push(`${STATUS_SQL} = ${p(q.status)}`)
  if (q.q) conds.push(`t.name ILIKE ${p(`%${likeEscape(q.q)}%`)}`)
  const limit = p(q.pageSize)
  const offset = p((q.page - 1) * q.pageSize)
  const dir = dirSql(q.dir)
  const order = q.sort === 'name' ? `t.name ${dir}, t.id` : `t.start_date ${dir} NULLS LAST, t.id ${dir}`

  const { rows } = await pool.query(
    `SELECT t.id, t.slug, t.name, t.league, t.stage, t.year, t.status, t."startDate", t."endDate", t.games, t.total,
       CASE WHEN t.status = 'In progress' THEN 'Leading'
            WHEN t.stage = 'Playoffs' OR t.is_international THEN 'Champion' ELSE 'Top record' END AS "standingLabel",
       st.name AS "standingTeam"
     FROM (
       SELECT t.id, es.slug, t.name, t.stage, t.year, t.is_international, t.start_date,
         COALESCE(l.name, CASE WHEN t.is_international THEN 'INTL' END,
                  (SELECT string_agg(DISTINCT zl.name, ' / ' ORDER BY zl.name) FROM tournament_team_league z
                   JOIN league zl ON zl.id = z.league_id WHERE z.tournament_id = t.id), '—') AS league,
         ${STATUS_SQL} AS status,
         to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
         (SELECT COUNT(*)::int FROM game g WHERE g.tournament_id = ANY(t.member_ids)) AS games,
         COUNT(*) OVER ()::int AS total
       FROM event t LEFT JOIN league l ON l.id = t.league_id JOIN event_slug es ON es.id = t.id
       WHERE ${conds.join(' AND ')}
       ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}) t
     LEFT JOIN LATERAL (
       SELECT w.name
       FROM (SELECT s.winner_id, MAX(g.played_at) AS last_game
             FROM series s JOIN game g ON g.series_id = s.id
             WHERE s.tournament_id = t.id AND s.winner_id IS NOT NULL GROUP BY s.id, s.winner_id) x
       JOIN team w ON w.id = x.winner_id
       GROUP BY w.id, w.name
       ORDER BY (CASE WHEN t.status = 'Completed' AND (t.stage = 'Playoffs' OR t.is_international)
                      THEN MAX(x.last_game) END) DESC NULLS LAST, COUNT(*) DESC, w.name
       LIMIT 1) st ON true
     ORDER BY ${order}`,
    params,
  )
  const total: number = rows[0]?.total ?? 0
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    empty: total === 0,
    rows: rows.map(({ total: _t, ...r }) => r),
  }
}
