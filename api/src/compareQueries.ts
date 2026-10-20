import type pg from 'pg'
import { filterSchema, hasRangeFilter, isAllTime, MIN_SAMPLE, type Filters } from './filters.js'
import {
  FROM,
  FROM_CORE,
  ka,
  ok,
  perMin,
  loadChampionPool,
  loadIdentity,
  loadSummary,
  resolveScope,
  type ChampionRow,
  type Identity,
  type PlayerRow,
  type PlayerScope,
  type ResolvedRange,
  type Summary,
} from './playerQueries.js'
import {
  base,
  loadTeamLeague,
  loadTeamSummary,
  ROLE_ORDER,
  teamFilterSchema,
  type TeamPick,
  type TeamPlayerRow,
  type TeamRow,
  type TeamSummary,
} from './teamQueries.js'

/** Players take the role filter; teams do not. Unknown query keys are ignored. */
export const comparePlayersSchema = filterSchema
export const compareTeamsSchema = teamFilterSchema

type Column = 'player_id' | 'team_id'

/** Same shape as a subject's own range; `resolved.league` is absent when the range spans leagues. */
export type CompareRange = Omit<ResolvedRange, 'resolved'> & {
  resolved: { league?: string; year: number; split: string | null } | null
}

export interface CompareScopes {
  a: PlayerScope
  b: PlayerScope
  range: CompareRange
}

/** Years in which the subject has at least one game. */
async function yearsPlayed(pool: pg.Pool, id: number, column: Column): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT t.year::int AS year ${FROM_CORE} WHERE pgm.${column} = $1 AND t.year IS NOT NULL`,
    [id],
  )
  return rows.map((r) => r.year)
}

/**
 * One range for both subjects, so their numbers are comparable. Explicit filters and `range=all` mean exactly what they
 * mean on a player or team page. Otherwise: if both subjects' own defaults land on the same league split, that split
 * (plus internationals since it began); else the newest year both played in, across all leagues plus that year's
 * internationals; else all time.
 */
export async function resolveCompareScopes(
  pool: pg.Pool,
  aId: number,
  bId: number,
  filters: Filters,
  column: Column,
): Promise<CompareScopes> {
  const both = (f: Filters) => Promise.all([resolveScope(pool, aId, f, column), resolveScope(pool, bId, f, column)])

  const [a, b] = await both(filters)
  if (hasRangeFilter(filters) || isAllTime(filters)) return { a, b, range: a.range }

  const ra = a.range.resolved
  const rb = b.range.resolved
  if (ra && rb && ra.league === rb.league && ra.year === rb.year && ra.split === rb.split) {
    return { a, b, range: a.range }
  }

  const [yearsA, yearsB] = await Promise.all([yearsPlayed(pool, aId, column), yearsPlayed(pool, bId, column)])
  const shared = yearsA.filter((y) => yearsB.includes(y))
  if (shared.length) {
    const year = Math.max(...shared)
    const [ya, yb] = await both({ ...filters, year })
    return {
      a: ya,
      b: yb,
      range: {
        ...ya.range,
        label: filters.domestic ? `All leagues, ${year}` : `All leagues, ${year} + internationals`,
        description: 'Newest year both played in',
        isDefault: true,
        resolved: { year, split: null },
      },
    }
  }

  const [aa, ab] = await both({ ...filters, range: 'all' })
  return { a: aa, b: ab, range: { ...aa.range, description: `${aa.range.description}; no year in common` } }
}

const POOL_LIMIT = 10
const RECENT_MEETINGS = 5

export interface ComparePlayerSide {
  player: PlayerRow & Identity
  summary: Summary | null
  champions: ChampionRow[]
}

export interface PlayerHeadToHead {
  /** Games where the two were on opposite teams; wins are player A's. */
  games: number
  wins: number
  losses: number
  /** The subset where both played the same role. */
  laneGames: number
  laneWins: number
  /** Games on the same team; wins are the shared result. */
  togetherGames: number
  togetherWins: number
}

export async function loadPlayerHeadToHead(pool: pg.Pool, scope: PlayerScope, otherId: number): Promise<PlayerHeadToHead> {
  const params = [...scope.params, otherId]
  const other = `$${params.length}`
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE opp.team_id <> pgm.team_id)::int AS games,
       COUNT(*) FILTER (WHERE opp.team_id <> pgm.team_id AND pgm.win)::int AS wins,
       COUNT(*) FILTER (WHERE opp.team_id <> pgm.team_id AND opp.role = pgm.role)::int AS "laneGames",
       COUNT(*) FILTER (WHERE opp.team_id <> pgm.team_id AND opp.role = pgm.role AND pgm.win)::int AS "laneWins",
       COUNT(*) FILTER (WHERE opp.team_id = pgm.team_id)::int AS "togetherGames",
       COUNT(*) FILTER (WHERE opp.team_id = pgm.team_id AND pgm.win)::int AS "togetherWins"
     ${FROM_CORE}
     JOIN player_game opp ON opp.game_id = pgm.game_id AND opp.player_id = ${other}
     WHERE ${scope.conditions.join(' AND ')}`,
    params,
  )
  const r = rows[0]
  return { ...r, losses: r.games - r.wins }
}

export async function loadComparePlayers(pool: pg.Pool, a: PlayerRow, b: PlayerRow, filters: Filters) {
  const scopes = await resolveCompareScopes(pool, a.id, b.id, filters, 'player_id')
  const side = async (player: PlayerRow, scope: PlayerScope): Promise<ComparePlayerSide> => {
    const [summary, identity, champions] = await Promise.all([
      loadSummary(pool, scope),
      loadIdentity(pool, scope),
      loadChampionPool(pool, scope),
    ])
    return { player: { ...player, ...identity }, summary, champions: champions.slice(0, POOL_LIMIT) }
  }
  const [sa, sb, headToHead] = await Promise.all([
    side(a, scopes.a),
    side(b, scopes.b),
    loadPlayerHeadToHead(pool, scopes.a, b.id),
  ])
  return { range: scopes.range, empty: sa.summary === null && sb.summary === null, a: sa, b: sb, headToHead }
}

export interface CompareTeamSide {
  team: TeamRow & { league: string | null }
  summary: TeamSummary | null
  players: LineupPlayer[]
  /** The event whose lineup counts as the roster, and whether it is the team's latest event overall; null with no games. */
  rosterEvent: { name: string; isLatest: boolean } | null
  /** The team's most picked champions, for the slideshow in the page header. */
  picks: TeamPick[]
}

export interface LineupPlayer extends TeamPlayerRow {
  /** On the roster: played in the event of the team's last game in the range. Everyone else in the range is a former player. */
  current: boolean
}

export interface TeamMeeting {
  playedAt: string | null
  tournament: string
  /** Name of the series winner; null when none is recorded. */
  winner: string | null
}

export interface TeamHeadToHead {
  games: number
  wins: number
  losses: number
  seriesPlayed: number
  seriesWins: number
  seriesLosses: number
  /** Most recent series first. */
  recent: TeamMeeting[]
}

export async function loadTeamHeadToHead(pool: pg.Pool, scope: PlayerScope, otherId: number): Promise<TeamHeadToHead> {
  const params = [...scope.params, otherId]
  const other = `$${params.length}`
  const [games, series] = await Promise.all([
    pool.query(
      `WITH ${base(scope)}
       SELECT COUNT(*)::int AS games, COUNT(*) FILTER (WHERE win)::int AS wins FROM base WHERE opp_id = ${other}`,
      params,
    ),
    pool.query(
      `WITH ${base(scope)},
       met AS (
         SELECT g.series_id, MAX(g.played_at) AS last
         FROM base JOIN game g ON g.id = base.game_id
         WHERE base.opp_id = ${other} AND g.series_id IS NOT NULL
         GROUP BY g.series_id
       )
       SELECT met.last AS "playedAt", t.name AS tournament, w.name AS winner, s.winner_id AS "winnerId"
       FROM met JOIN series s ON s.id = met.series_id
       JOIN tournament t ON t.id = s.tournament_id
       LEFT JOIN team w ON w.id = s.winner_id
       ORDER BY met.last DESC NULLS LAST, s.id DESC`,
      params,
    ),
  ])
  const g = games.rows[0]
  const decided = series.rows.filter((r) => r.winnerId !== null)
  const seriesWins = decided.filter((r) => r.winnerId === scope.params[0]).length
  return {
    games: g.games,
    wins: g.wins,
    losses: g.games - g.wins,
    seriesPlayed: decided.length,
    seriesWins,
    seriesLosses: decided.length - seriesWins,
    recent: series.rows
      .slice(0, RECENT_MEETINGS)
      .map((r) => ({ playedAt: r.playedAt, tournament: r.tournament, winner: r.winner })),
  }
}

/** Most picked champions of a team in the scope, most picked first. */
async function loadTeamPicks(pool: pg.Pool, scope: PlayerScope): Promise<TeamPick[]> {
  const { rows } = await pool.query(
    `WITH ${base(scope)}
     SELECT c.name AS champion, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE base.win)::int AS wins
     FROM base
     JOIN player_game pg2 ON pg2.game_id = base.game_id AND pg2.team_id = base.team_id
     JOIN champion c ON c.id = pg2.champion_id
     GROUP BY c.name ORDER BY games DESC, wins DESC, c.name LIMIT $${scope.params.length + 1}`,
    [...scope.params, POOL_LIMIT],
  )
  return rows.map((r) => ({ ...r, winRate: r.wins / r.games, underMinSample: r.games < MIN_SAMPLE }))
}

/**
 * Everyone who played for the team in the range, split into the roster and former players. The roster is the same rule as the
 * team page ("who played in the event of its most recent game"), applied inside the range, so narrowing the range to an
 * earlier year gives the roster the team had then. Roster first, each group in role order.
 */
export async function loadTeamLineup(
  pool: pg.Pool,
  scope: PlayerScope,
): Promise<{ players: LineupPlayer[]; rosterEvent: CompareTeamSide['rosterEvent'] }> {
  const where = scope.conditions.join(' AND ')
  const { rows } = await pool.query(
    `WITH last_event AS (
       SELECT g.tournament_id ${FROM} WHERE ${where} ORDER BY g.played_at DESC NULLS LAST LIMIT 1)
     SELECT p.name AS page, COALESCE(p.display_name, p.name) AS name,
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
       bool_or(g.tournament_id = (SELECT tournament_id FROM last_event)) AS current
     ${FROM}
     JOIN player p ON p.id = pgm.player_id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY bool_or(g.tournament_id = (SELECT tournament_id FROM last_event)) DESC, ${ROLE_ORDER}, COUNT(*) DESC, p.name`,
    scope.params,
  )
  const players: LineupPlayer[] = rows.map((r) => ({ ...r, winRate: r.wins / r.games, underMinSample: r.games < MIN_SAMPLE }))
  if (players.length === 0) return { players, rosterEvent: null }
  // $1 is the team in every team scope.
  const event = await pool.query(
    `WITH scoped AS (
       SELECT g.tournament_id ${FROM} WHERE ${where} ORDER BY g.played_at DESC NULLS LAST LIMIT 1),
     overall AS (
       SELECT g.tournament_id FROM team_game tg JOIN game g ON g.id = tg.game_id
       WHERE tg.team_id = $1 ORDER BY g.played_at DESC NULLS LAST LIMIT 1)
     SELECT t.name, t.id = (SELECT tournament_id FROM overall) AS "isLatest"
     FROM tournament t WHERE t.id = (SELECT tournament_id FROM scoped)`,
    scope.params,
  )
  return { players, rosterEvent: event.rows[0] ?? null }
}

export async function loadCompareTeams(pool: pg.Pool, a: TeamRow, b: TeamRow, filters: Filters) {
  const scopes = await resolveCompareScopes(pool, a.id, b.id, filters, 'team_id')
  const side = async (team: TeamRow, scope: PlayerScope): Promise<CompareTeamSide> => {
    const [summary, league, lineup, picks] = await Promise.all([
      loadTeamSummary(pool, scope),
      loadTeamLeague(pool, scope),
      loadTeamLineup(pool, scope),
      loadTeamPicks(pool, scope),
    ])
    return { team: { ...team, league }, summary, ...lineup, picks }
  }
  const [sa, sb, headToHead] = await Promise.all([
    side(a, scopes.a),
    side(b, scopes.b),
    loadTeamHeadToHead(pool, scopes.a, b.id),
  ])
  return { range: scopes.range, empty: sa.summary === null && sb.summary === null, a: sa, b: sb, headToHead }
}
