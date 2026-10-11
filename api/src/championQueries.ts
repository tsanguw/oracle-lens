import type pg from 'pg'
import { z } from 'zod'
import { filterSchema, MIN_SAMPLE } from './filters.js'
import { IS_EVENT_HEAD } from './homeQueries.js'
import { resolveRange, type LeaderboardRange } from './leaderboardQueries.js'
import { FROM, FROM_CORE, ka, ok, perMin } from './playerQueries.js'

/** Same filters as the leaderboard (default range = each league's latest split plus internationals). */
export const championSchema = filterSchema.extend({
  qualifiers: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(20).optional(),
})
export type ChampionQuery = z.infer<typeof championSchema>

export const DEFAULT_LIST_LIMIT = 8

export interface ChampionRow {
  id: number
  name: string
}

export async function findChampion(pool: pg.Pool, name: string): Promise<ChampionRow | null> {
  const exact = await pool.query(`SELECT id, name FROM champion WHERE name = $1`, [name])
  if (exact.rows[0]) return exact.rows[0]
  // Tolerate a different capitalisation, but only when it is unambiguous.
  const loose = await pool.query(`SELECT id, name FROM champion WHERE lower(name) = lower($1)`, [name])
  return loose.rows.length === 1 ? loose.rows[0] : null
}

interface Scope {
  conditions: string[]
  params: unknown[]
  range: LeaderboardRange
}

/** Range conditions (aliases pgm, g, t, l, ttl) plus, optionally, `pgm.champion_id = ?`. */
async function scopeFor(
  pool: pg.Pool,
  q: ChampionQuery,
  championId: number | null,
  without: { role?: boolean; side?: boolean } = {},
): Promise<Scope> {
  const params: unknown[] = []
  const filters = { ...q, ...(without.role ? { role: undefined } : {}), ...(without.side ? { side: undefined } : {}) }
  const { conditions, range } = await resolveRange(pool, filters, params)
  if (championId !== null) conditions.push(`pgm.champion_id = $${params.push(championId)}`)
  return { conditions, params, range }
}

/** Same joins, but one row per team game (alias pgm = team_game), for game-level counts like pick and ban rate. */
const FROM_TEAM = FROM_CORE.replace('player_game pgm', 'team_game pgm')

export interface ChampionSummary {
  games: number
  wins: number
  losses: number
  winRate: number
  blueGames: number
  blueWins: number
  redGames: number
  redWins: number
  /** Share of all games in the range in which the champion was picked. */
  pickRate: number | null
  /** Share of games in which it was banned by either team. */
  banRate: number | null
  /** Share of games in which it was picked or banned. */
  presence: number | null
  totalGames: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  goldPerMin: number | null
  csPerMin: number | null
  avgGameLengthSec: number | null
  /** The role it is played in most often in the range. */
  role: string | null
}

export async function loadChampionSummary(
  pool: pg.Pool,
  q: ChampionQuery,
  champion: ChampionRow,
): Promise<{ range: LeaderboardRange; summary: ChampionSummary | null }> {
  const main = await scopeFor(pool, q, champion.id)
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       COUNT(*) FILTER (WHERE pgm.side = 'blue')::int AS "blueGames",
       COUNT(*) FILTER (WHERE pgm.side = 'blue' AND pgm.win)::int AS "blueWins",
       COUNT(*) FILTER (WHERE pgm.side = 'red')::int AS "redGames",
       COUNT(*) FILTER (WHERE pgm.side = 'red' AND pgm.win)::int AS "redWins",
       CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
            THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
            ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
       END AS kda,
       SUM(${ka}) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL)::float8
         / NULLIF(SUM(tg.kills) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL), 0) AS "killParticipation",
       ${perMin('pgm.damage')} AS "damagePerMin",
       ${perMin('pgm.gold')} AS "goldPerMin",
       ${perMin('pgm.cs')} AS "csPerMin",
       AVG(g.length_sec)::float8 AS "avgGameLengthSec",
       mode() WITHIN GROUP (ORDER BY pgm.role) AS role
     ${FROM}
     WHERE ${main.conditions.join(' AND ')}`,
    main.params,
  )
  const r = rows[0]
  if (!r || r.games === 0) return { range: main.range, summary: null }

  // Pick, ban and presence rates are shares of every game in the range, whatever the role or side filter.
  const wide = await scopeFor(pool, q, null, { role: true, side: true })
  const idParam = `$${wide.params.push(champion.id)}`
  const cov = await pool.query(
    `SELECT COUNT(DISTINCT pgm.game_id)::int AS total,
            COUNT(DISTINCT pgm.game_id) FILTER (WHERE pp.game_id IS NOT NULL)::int AS picked,
            COUNT(DISTINCT pgm.game_id) FILTER (WHERE pb.id IS NOT NULL)::int AS banned,
            COUNT(DISTINCT pgm.game_id) FILTER (WHERE pp.game_id IS NOT NULL OR pb.id IS NOT NULL)::int AS present
     ${FROM_TEAM}
     LEFT JOIN pick_ban pb ON pb.game_id = pgm.game_id AND pb.champion_id = ${idParam} AND pb.action = 'ban'
     LEFT JOIN player_game pp ON pp.game_id = pgm.game_id AND pp.champion_id = ${idParam}
     WHERE ${wide.conditions.join(' AND ')}`,
    wide.params,
  )
  const c = cov.rows[0]
  const share = (n: number) => (c.total > 0 ? n / c.total : null)
  return {
    range: main.range,
    summary: {
      ...r,
      losses: r.games - r.wins,
      winRate: r.wins / r.games,
      totalGames: c.total,
      pickRate: share(r.games),
      banRate: share(c.banned),
      presence: share(c.present),
    },
  }
}

export interface RoleRow {
  role: string
  games: number
  wins: number
  winRate: number
}

export async function loadChampionRoles(pool: pg.Pool, q: ChampionQuery, champion: ChampionRow): Promise<RoleRow[]> {
  const scope = await scopeFor(pool, q, champion.id, { role: true })
  const { rows } = await pool.query(
    `SELECT pgm.role, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins
     ${FROM_CORE} WHERE ${scope.conditions.join(' AND ')}
     GROUP BY pgm.role ORDER BY games DESC`,
    scope.params,
  )
  return rows.map((r) => ({ ...r, winRate: r.wins / r.games }))
}

export interface ChampionPlayer {
  page: string
  name: string
  team: string | null
  games: number
  wins: number
  winRate: number
  kda: number | null
  underMinSample: boolean
}

export async function loadChampionPlayers(
  pool: pg.Pool,
  q: ChampionQuery,
  champion: ChampionRow,
  limit = DEFAULT_LIST_LIMIT,
): Promise<ChampionPlayer[]> {
  const scope = await scopeFor(pool, q, champion.id)
  const lim = `$${scope.params.push(limit)}`
  const { rows } = await pool.query(
    `SELECT p.name AS page, COALESCE(p.display_name, p.name) AS name,
       mode() WITHIN GROUP (ORDER BY pt.name) AS team,
       COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
            THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
            ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
       END AS kda
     ${FROM_CORE}
     JOIN player p ON p.id = pgm.player_id JOIN team pt ON pt.id = pgm.team_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY p.id ORDER BY games DESC, wins DESC, p.name LIMIT ${lim}`,
    scope.params,
  )
  return rows.map((r) => ({ ...r, winRate: r.wins / r.games, underMinSample: r.games < MIN_SAMPLE }))
}

export interface ChampionTeam {
  name: string
  games: number
  wins: number
  winRate: number
  underMinSample: boolean
}

export async function loadChampionTeams(
  pool: pg.Pool,
  q: ChampionQuery,
  champion: ChampionRow,
  limit = DEFAULT_LIST_LIMIT,
): Promise<ChampionTeam[]> {
  const scope = await scopeFor(pool, q, champion.id)
  const lim = `$${scope.params.push(limit)}`
  const { rows } = await pool.query(
    `SELECT pt.name, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins
     ${FROM_CORE} JOIN team pt ON pt.id = pgm.team_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY pt.id ORDER BY games DESC, wins DESC, pt.name LIMIT ${lim}`,
    scope.params,
  )
  return rows.map((r) => ({ ...r, winRate: r.wins / r.games, underMinSample: r.games < MIN_SAMPLE }))
}

export interface ChampionMatchup {
  champion: string
  games: number
  wins: number
  losses: number
  winRate: number
  /** Average final gold difference for the champion's player (positive = ahead). */
  goldDiff: number | null
  underMinSample: boolean
}

/** Record against each champion played by the lane opponent (same role, opposite team). */
export async function loadChampionCounters(
  pool: pg.Pool,
  q: ChampionQuery,
  champion: ChampionRow,
  limit = DEFAULT_LIST_LIMIT,
): Promise<ChampionMatchup[]> {
  const scope = await scopeFor(pool, q, champion.id)
  const lim = `$${scope.params.push(limit)}`
  const { rows } = await pool.query(
    `SELECT oc.name AS champion, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
            AVG(pgm.gold - opp.gold)::float8 AS "goldDiff"
     ${FROM_CORE}
     JOIN player_game opp ON opp.game_id = pgm.game_id AND opp.role = pgm.role AND opp.team_id <> pgm.team_id
     JOIN champion oc ON oc.id = opp.champion_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY oc.id ORDER BY games DESC, oc.name LIMIT ${lim}`,
    scope.params,
  )
  return rows.map((r) => ({
    ...r,
    losses: r.games - r.wins,
    winRate: r.wins / r.games,
    underMinSample: r.games < MIN_SAMPLE,
  }))
}

export interface PatchRow {
  patch: string
  games: number
  wins: number
  winRate: number
  pickRate: number | null
}

/** Numeric patch order: 14.10 after 14.9, 9.x before 13.x. Unparseable labels sort last. */
const patchKey = (patch: string): number => {
  const [major, minor] = patch.split('.').map((p) => Number.parseInt(p, 10))
  return Number.isFinite(major) ? major * 1000 + (Number.isFinite(minor) ? minor : 0) : -1
}

export async function loadChampionPatches(
  pool: pg.Pool,
  q: ChampionQuery,
  champion: ChampionRow,
  limit = 12,
): Promise<PatchRow[]> {
  const main = await scopeFor(pool, q, champion.id)
  const wide = await scopeFor(pool, q, null, { role: true, side: true })
  const [mine, all] = await Promise.all([
    pool.query(
      `SELECT g.patch, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE pgm.win)::int AS wins
       ${FROM_CORE} WHERE ${main.conditions.join(' AND ')} AND g.patch IS NOT NULL GROUP BY g.patch`,
      main.params,
    ),
    pool.query(
      `SELECT g.patch, COUNT(DISTINCT pgm.game_id)::int AS total
       ${FROM_TEAM} WHERE ${wide.conditions.join(' AND ')} AND g.patch IS NOT NULL GROUP BY g.patch`,
      wide.params,
    ),
  ])
  const totals = new Map<string, number>(all.rows.map((r) => [r.patch, r.total]))
  return mine.rows
    .map((r) => ({
      patch: r.patch as string,
      games: r.games as number,
      wins: r.wins as number,
      winRate: r.wins / r.games,
      pickRate: totals.get(r.patch) ? r.games / (totals.get(r.patch) as number) : null,
    }))
    .sort((a, b) => patchKey(b.patch) - patchKey(a.patch))
    .slice(0, limit)
}

export interface ChampionContext {
  players: ChampionPlayer[]
  teams: ChampionTeam[]
  events: {
    id: number
    slug: string
    name: string
    league: string
    status: 'In progress' | 'Completed'
    startDate: string | null
    endDate: string | null
    games: number
  }[]
}

/** Who is playing the champion now, and where: the default range, ignoring any stat filters. */
export async function loadChampionContext(pool: pg.Pool, champion: ChampionRow): Promise<ChampionContext> {
  const defaults = championSchema.parse({})
  const [players, teams, events] = await Promise.all([
    loadChampionPlayers(pool, defaults, champion, 5),
    loadChampionTeams(pool, defaults, champion, 5),
    pool.query(
      `SELECT t.id, ts.slug, t.name, COALESCE(l.name, 'INTL') AS league,
              (CASE WHEN t.start_date <= CURRENT_DATE AND t.end_date >= CURRENT_DATE THEN 'In progress' ELSE 'Completed' END) AS status,
              to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
              COUNT(*)::int AS games
       FROM player_game pgm JOIN game g ON g.id = pgm.game_id JOIN tournament t ON t.id = g.tournament_id
       JOIN tournament_slug ts ON ts.id = t.id LEFT JOIN league l ON l.id = t.league_id
       WHERE pgm.champion_id = $1 AND t.stage IS DISTINCT FROM 'Qualifier' AND ${IS_EVENT_HEAD('t')}
       GROUP BY t.id, ts.slug, l.name ORDER BY t.start_date DESC NULLS LAST LIMIT 3`,
      [champion.id],
    ),
  ])
  return { players, teams, events: events.rows }
}
