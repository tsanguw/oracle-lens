import type pg from 'pg'
import { z } from 'zod'
import { buildConditions, filterSchema, hasRangeFilter, isAllTime, MIN_SAMPLE, type Filters } from './filters.js'
import { likeEscape } from './homeQueries.js'
import { FROM, ka, ok, perMin } from './playerQueries.js'

export const SORT_KEYS = ['kda', 'winRate', 'games', 'killParticipation', 'damagePerMin', 'csPerMin', 'visionPerMin'] as const

export const leaderboardSchema = filterSchema.extend({
  sort: z.enum(SORT_KEYS).default('kda'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** Matches a player's name or old names. */
  q: z.string().trim().max(60).default(''),
  /** Qualifiers and promotion series are left out unless asked for. */
  qualifiers: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export type LeaderboardQuery = z.infer<typeof leaderboardSchema>

/** What the default-range resolver needs: the stat filters plus whether qualifiers are wanted. */
export type RangeQuery = Filters & { qualifiers: boolean }

export interface LeaderboardRange {
  label: string
  /** A line under the label; only the all-time range has one. */
  description?: string
  isDefault: boolean
  /** The year/split the default range resolved to when every league shares it; otherwise null. */
  resolved: { year: number; split: string | null } | null
  /** Each league's own latest split in the default range, so a league pick can keep that split. */
  leagues: { league: string; year: number; split: string | null }[]
}

export interface LeaderboardRow {
  rank: number
  page: string
  name: string
  team: string | null
  league: string | null
  role: string | null
  games: number
  wins: number
  winRate: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  csPerMin: number | null
  visionPerMin: number | null
}

const NOT_QUALIFIER = `t.stage IS DISTINCT FROM 'Qualifier'`

/**
 * Explicit filters replace the default range, and `range=all` (with none of them) means all history. With neither, each league contributes its most recent
 * split (playoffs included), plus international events from the earliest such split onward. Only
 * leagues that played in the most recent year count, so a league that has stopped adds no stale data.
 */
export async function resolveRange(
  pool: pg.Pool,
  q: RangeQuery,
  params: unknown[],
): Promise<{ conditions: string[]; range: LeaderboardRange }> {
  const base = q.qualifiers ? [] : [NOT_QUALIFIER]

  if (hasRangeFilter(q)) {
    const parts = [q.league, q.year, q.split, q.tournament].filter(Boolean)
    return {
      conditions: [...base, ...buildConditions(q, params)],
      range: { label: parts.length ? parts.join(' ') : 'Selected filters', isDefault: false, resolved: null, leagues: [] },
    }
  }

  if (isAllTime(q)) {
    // With qualifiers wanted and no other filter there is nothing to restrict; callers join conditions into a WHERE.
    const conditions = [...base, ...buildConditions(q, params)]
    return {
      conditions: conditions.length ? conditions : ['true'],
      range: {
        label: 'All time',
        description: q.domestic ? 'Tier 1 leagues only, domestic only' : 'Tier 1 leagues and internationals only',
        isDefault: false,
        resolved: null,
        leagues: [],
      },
    }
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (x.league_id) x.league_id, l.name AS league, t.year, t.split, t.start_date
     FROM (SELECT id, league_id FROM tournament WHERE league_id IS NOT NULL
           UNION SELECT tournament_id, league_id FROM tournament_team_league) x
     JOIN tournament t ON t.id = x.id
     JOIN league l ON l.id = x.league_id
     WHERE t.is_international = false AND ${NOT_QUALIFIER}
       AND EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = t.id)
     ORDER BY x.league_id, t.start_date DESC`,
  )
  const newest = Math.max(...rows.map((r) => r.year as number))
  const latest = rows.filter((r) => r.year === newest)
  if (latest.length === 0) {
    return { conditions: ['false'], range: { label: 'No games', isDefault: true, resolved: null, leagues: [] } }
  }

  const perLeague = latest.map((r) => {
    const l = `$${params.push(r.league_id)}`
    const y = `$${params.push(r.year)}`
    const s = `$${params.push(r.split)}`
    return `(l.id = ${l} AND t.year = ${y} AND t.split IS NOT DISTINCT FROM ${s})`
  })
  const since = latest.map((r) => r.start_date as Date).reduce((a, b) => (a < b ? a : b))
  const intl = q.domestic ? '' : ` OR (t.is_international = true AND t.end_date >= $${params.push(since)})`

  const labels = new Set(latest.map((r) => [r.year, r.split].filter(Boolean).join(' ')))
  const shared = labels.size === 1
  const label = shared ? [...labels][0] : `Latest split of each league, ${newest}`
  return {
    conditions: [...base, `(${perLeague.join(' OR ')}${intl})`, ...buildConditions({ ...q, domestic: false }, params)],
    range: {
      label: q.domestic ? label : `${label} + internationals`,
      isDefault: true,
      resolved: shared ? { year: newest, split: latest[0].split ?? null } : null,
      leagues: latest.map((r) => ({ league: r.league, year: r.year, split: r.split ?? null })),
    },
  }
}

/** Sort keys are a closed enum, so interpolating the expression is safe. Missing values always sort last. */
function sortExpr(q: LeaderboardQuery): string {
  const expr =
    q.sort === 'games' ? 'COUNT(*)' : q.sort === 'winRate' ? '(COUNT(*) FILTER (WHERE pgm.win))::float8 / COUNT(*)' : `"${q.sort}"`
  return `${expr} ${q.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`
}

export async function loadLeaderboard(pool: pg.Pool, q: LeaderboardQuery) {
  const params: unknown[] = []
  const { conditions, range } = await resolveRange(pool, q, params)
  if (q.q) {
    const like = `$${params.push(`%${likeEscape(q.q)}%`)}`
    conditions.push(`(p.name ILIKE ${like} OR p.display_name ILIKE ${like})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = `$${params.push(q.pageSize)}`
  const offset = `$${params.push((q.page - 1) * q.pageSize)}`
  const min = `$${params.push(MIN_SAMPLE)}`

  const { rows } = await pool.query(
    `SELECT p.name AS page, COALESCE(p.display_name, p.name) AS name,
       mode() WITHIN GROUP (ORDER BY pt.name) AS team,
       mode() WITHIN GROUP (ORDER BY l.name) AS league,
       mode() WITHIN GROUP (ORDER BY pgm.role) AS role,
       COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
            THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
            ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
       END AS kda,
       SUM(${ka}) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL)::float8
         / NULLIF(SUM(tg.kills) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL), 0) AS "killParticipation",
       ${perMin('pgm.damage')} AS "damagePerMin",
       ${perMin('pgm.cs')} AS "csPerMin",
       ${perMin('pgm.vision')} AS "visionPerMin",
       COUNT(*) OVER ()::int AS total
     ${FROM}
     JOIN player p ON p.id = pgm.player_id
     JOIN team pt ON pt.id = pgm.team_id
     ${where}
     GROUP BY p.id
     HAVING COUNT(*) >= ${min}
     ORDER BY ${sortExpr(q)}, games DESC, p.name
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  )

  const total: number = rows[0]?.total ?? 0
  const start = (q.page - 1) * q.pageSize
  const players: LeaderboardRow[] = rows.map(({ total: _total, ...r }, i) => ({
    ...r,
    rank: start + i + 1,
    winRate: r.wins / r.games,
  }))
  return { range, minGames: MIN_SAMPLE, total, page: q.page, pageSize: q.pageSize, empty: total === 0, players }
}
