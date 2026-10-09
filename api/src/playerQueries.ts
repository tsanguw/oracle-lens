import type pg from 'pg'
import { buildConditions, hasRangeFilter, MIN_SAMPLE, type Filters } from './filters.js'

export interface PlayerRow {
  id: number
  name: string
  displayName: string
  nationality: string | null
}

export interface ResolvedRange {
  label: string
  description: string
  isDefault: boolean
  domesticOnly: boolean
  from: string | null
  to: string | null
  /** The league/year/split the default range resolved to; null when filters were explicit. */
  resolved: { league: string; year: number; split: string | null } | null
}

export interface PlayerScope {
  /** WHERE conditions (aliases pgm, g, t, l) that select this player's games for the request. */
  conditions: string[]
  params: unknown[]
  range: ResolvedRange
}

/**
 * Joins needed by every scope condition (aliases pgm, g, t, ttl, l). A game's league is the
 * tournament's league, except in multi-league events (2025 LTA playoffs) where each team's games
 * count toward that team's own conference league via tournament_team_league.
 */
const FROM_CORE = `
  FROM player_game pgm
  JOIN game g ON g.id = pgm.game_id
  JOIN tournament t ON t.id = g.tournament_id
  LEFT JOIN tournament_team_league ttl ON ttl.tournament_id = t.id AND ttl.team_id = pgm.team_id
  LEFT JOIN league l ON l.id = COALESCE(ttl.league_id, t.league_id)`

export const FROM = `${FROM_CORE}
  LEFT JOIN team_game tg ON tg.game_id = pgm.game_id AND tg.team_id = pgm.team_id
  LEFT JOIN LATERAL (
    SELECT SUM(x.damage) AS dmg, SUM(x.gold) AS gld
    FROM player_game x WHERE x.game_id = pgm.game_id AND x.team_id = pgm.team_id
  ) tm ON true`

export async function findPlayer(pool: pg.Pool, idOrName: string): Promise<PlayerRow | null> {
  const byId = /^\d+$/.test(idOrName)
  const { rows } = await pool.query(
    `SELECT id, name, COALESCE(display_name, name) AS "displayName", nationality
     FROM player WHERE ${byId ? 'id = $1::int' : 'name = $1'}`,
    [idOrName],
  )
  return rows[0] ?? null
}

/**
 * Explicit filters win. With none, use the player's most recent domestic split plus any
 * international events from that split's start onward (unless domestic=true).
 */
export async function resolveScope(
  pool: pg.Pool,
  playerId: number,
  filters: Filters,
): Promise<PlayerScope> {
  const params: unknown[] = [playerId]
  const base = ['pgm.player_id = $1']

  if (hasRangeFilter(filters)) {
    const conds = [...base, ...buildConditions(filters, params)]
    const parts = [filters.league, filters.year, filters.split, filters.tournament].filter(Boolean)
    return {
      conditions: conds,
      params,
      range: {
        label: parts.length ? parts.join(' ') : 'Selected filters',
        description: filters.domestic ? 'Custom filters, domestic only' : 'Custom filters',
        isDefault: false,
        domesticOnly: filters.domestic,
        from: null,
        to: null,
        resolved: null,
      },
    }
  }

  const { rows } = await pool.query(
    `SELECT l.id AS league_id, l.name AS league, t.year, t.split
     ${FROM}
     WHERE pgm.player_id = $1 AND t.is_international = false AND l.id IS NOT NULL
     ORDER BY g.played_at DESC NULLS LAST LIMIT 1`,
    [playerId],
  )

  let splitFilter: string
  let label: string
  let start: string | null = null
  let end: string | null = null
  let internationalFrom: string | null = null
  let resolved: ResolvedRange['resolved'] = null

  if (rows[0]) {
    const { league_id, league, year, split } = rows[0]
    const tour = await pool.query(
      `SELECT MIN(t.start_date) AS start, MAX(t.end_date) AS "end" FROM tournament t
       WHERE (t.league_id = $1 OR EXISTS (
                SELECT 1 FROM tournament_team_league x WHERE x.tournament_id = t.id AND x.league_id = $1))
         AND t.year = $2 AND t.split IS NOT DISTINCT FROM $3`,
      [league_id, year, split],
    )
    start = tour.rows[0].start
    end = tour.rows[0].end
    internationalFrom = start
    resolved = { league, year, split }
    params.push(league_id, year, split)
    splitFilter = `(l.id = $2 AND t.year = $3 AND t.split IS NOT DISTINCT FROM $4)`
    label = [league, year, split].filter(Boolean).join(' ')
  } else {
    // No domestic games at all: fall back to the player's most recent tournament.
    const latest = await pool.query(
      `SELECT t.id, t.name, t.start_date, t.end_date ${FROM}
       WHERE pgm.player_id = $1 ORDER BY g.played_at DESC NULLS LAST LIMIT 1`,
      [playerId],
    )
    if (!latest.rows[0]) {
      return {
        conditions: [...base, 'false'],
        params,
        range: { label: 'No games', description: 'No games recorded', isDefault: true, domesticOnly: false, from: null, to: null, resolved: null },
      }
    }
    params.push(latest.rows[0].id)
    splitFilter = `t.id = $2`
    label = latest.rows[0].name
    start = latest.rows[0].start_date
    end = latest.rows[0].end_date
  }

  const intlClause =
    !filters.domestic && internationalFrom
      ? ` OR (t.is_international = true AND t.end_date >= $${params.push(internationalFrom)})`
      : ''
  const conditions = [...base, `(${splitFilter}${intlClause})`, ...buildConditions({ ...filters, domestic: false }, params)]

  // Name any international events that actually contributed games, e.g. "LCK 2026 Summer + Worlds 2026".
  let internationals: string[] = []
  if (intlClause) {
    const intl = await pool.query(
      `SELECT DISTINCT t.name ${FROM} WHERE ${conditions.join(' AND ')} AND t.is_international = true ORDER BY t.name`,
      params,
    )
    internationals = intl.rows.map((r) => r.name)
  }
  const fullLabel = [label, ...internationals].join(' + ')

  return {
    conditions,
    params,
    range: {
      label: fullLabel,
      description: filters.domestic
        ? 'Most recent split, domestic only'
        : internationals.length
          ? 'Most recent split, internationals included'
          : 'Most recent split',
      isDefault: true,
      domesticOnly: filters.domestic,
      from: start,
      to: end,
      resolved,
    },
  }
}

export const ok = 'pgm.kills IS NOT NULL AND pgm.deaths IS NOT NULL AND pgm.assists IS NOT NULL'
export const ka = '(pgm.kills + pgm.assists)'

/** Sum of `col` per minute, over only the games where both `col` and length are known. */
export const perMin = (col: string) =>
  `(SUM(${col}) FILTER (WHERE ${col} IS NOT NULL AND g.length_sec > 0)::float8
    / NULLIF(SUM(g.length_sec) FILTER (WHERE ${col} IS NOT NULL AND g.length_sec > 0) / 60.0, 0))`

/** Player's share of team total; teamCol comes from the lateral `tm` subquery. */
export const share = (col: string, teamCol: string) =>
  `(SUM(${col}) FILTER (WHERE ${col} IS NOT NULL AND ${teamCol} > 0)::float8
    / NULLIF(SUM(${teamCol}) FILTER (WHERE ${col} IS NOT NULL AND ${teamCol} > 0), 0))`

export interface Summary {
  games: number
  wins: number
  losses: number
  winRate: number
  blueGames: number
  blueWins: number
  redGames: number
  redWins: number
  kills: number | null
  deaths: number | null
  assists: number | null
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  damageShare: number | null
  goldPerMin: number | null
  goldShare: number | null
  csPerMin: number | null
  visionPerMin: number | null
  firstBloodRate: number | null
  championPool: number
  avgGameLengthSec: number | null
}

export async function loadSummary(pool: pg.Pool, scope: PlayerScope): Promise<Summary | null> {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       COUNT(*) FILTER (WHERE pgm.side = 'blue')::int AS "blueGames",
       COUNT(*) FILTER (WHERE pgm.side = 'blue' AND pgm.win)::int AS "blueWins",
       COUNT(*) FILTER (WHERE pgm.side = 'red')::int AS "redGames",
       COUNT(*) FILTER (WHERE pgm.side = 'red' AND pgm.win)::int AS "redWins",
       AVG(pgm.kills)::float8 AS kills,
       AVG(pgm.deaths)::float8 AS deaths,
       AVG(pgm.assists)::float8 AS assists,
       CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
            THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
            ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
       END AS kda,
       SUM(${ka}) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL)::float8
         / NULLIF(SUM(tg.kills) FILTER (WHERE ${ok} AND tg.kills IS NOT NULL), 0) AS "killParticipation",
       ${perMin('pgm.damage')} AS "damagePerMin",
       ${share('pgm.damage', 'tm.dmg')} AS "damageShare",
       ${perMin('pgm.gold')} AS "goldPerMin",
       ${share('pgm.gold', 'tm.gld')} AS "goldShare",
       ${perMin('pgm.cs')} AS "csPerMin",
       ${perMin('pgm.vision')} AS "visionPerMin",
       AVG(pgm.first_blood::int)::float8 AS "firstBloodRate",
       COUNT(DISTINCT pgm.champion_id)::int AS "championPool",
       AVG(g.length_sec)::float8 AS "avgGameLengthSec"
     ${FROM}
     WHERE ${scope.conditions.join(' AND ')}`,
    scope.params,
  )
  const r = rows[0]
  if (!r || r.games === 0) return null
  return {
    ...r,
    losses: r.games - r.wins,
    winRate: r.wins / r.games,
  }
}

export interface ChampionRow {
  champion: string
  games: number
  wins: number
  losses: number
  winRate: number
  kda: number | null
  csPerMin: number | null
  damagePerMin: number | null
  underMinSample: boolean
}

export async function loadChampionPool(pool: pg.Pool, scope: PlayerScope): Promise<ChampionRow[]> {
  const { rows } = await pool.query(
    `SELECT c.name AS champion,
       COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       CASE WHEN SUM(pgm.deaths) FILTER (WHERE ${ok}) = 0
            THEN SUM(${ka}) FILTER (WHERE ${ok})::float8
            ELSE SUM(${ka}) FILTER (WHERE ${ok})::float8 / NULLIF(SUM(pgm.deaths) FILTER (WHERE ${ok}), 0)
       END AS kda,
       ${perMin('pgm.cs')} AS "csPerMin",
       ${perMin('pgm.damage')} AS "damagePerMin"
     ${FROM}
     JOIN champion c ON c.id = pgm.champion_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY c.name
     ORDER BY games DESC, wins DESC, c.name`,
    scope.params,
  )
  return rows.map((r) => ({
    ...r,
    losses: r.games - r.wins,
    winRate: r.wins / r.games,
    underMinSample: r.games < MIN_SAMPLE,
  }))
}

export const DEFAULT_LIST_LIMIT = 5

export interface PlayerMatchupRow {
  playerId: number
  /** Unique page name, used for the /players/:name link. */
  page: string
  name: string
  team: string | null
  games: number
  wins: number
  losses: number
  winRate: number
  /** Average final gold difference for the player (positive = ahead); null when not tracked. */
  goldDiff: number | null
  underMinSample: boolean
}

/**
 * Lane matchups are two player_game rows from the same game with the same role on opposite
 * teams. Records are from the viewed player's perspective.
 */
const OPPONENT_JOIN = `
  JOIN player_game opp ON opp.game_id = pgm.game_id AND opp.role = pgm.role AND opp.team_id <> pgm.team_id`

export async function loadPlayerMatchups(
  pool: pg.Pool,
  scope: PlayerScope,
  limit = DEFAULT_LIST_LIMIT,
): Promise<PlayerMatchupRow[]> {
  const params = [...scope.params, limit]
  const { rows } = await pool.query(
    `SELECT op.id AS "playerId", op.name AS page, COALESCE(op.display_name, op.name) AS name,
       (ARRAY_AGG(ot.name ORDER BY g.played_at DESC NULLS LAST))[1] AS team,
       COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       AVG(pgm.gold - opp.gold)::float8 AS "goldDiff"
     ${FROM_CORE}
     ${OPPONENT_JOIN}
     JOIN player op ON op.id = opp.player_id
     JOIN team ot ON ot.id = opp.team_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY op.id, op.name, op.display_name
     ORDER BY games DESC, wins DESC, name
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({
    ...r,
    losses: r.games - r.wins,
    winRate: r.wins / r.games,
    underMinSample: r.games < MIN_SAMPLE,
  }))
}

export interface ChampionMatchupRow {
  champion: string
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

export async function loadChampionMatchups(
  pool: pg.Pool,
  scope: PlayerScope,
  limit = DEFAULT_LIST_LIMIT,
): Promise<ChampionMatchupRow[]> {
  const params = [...scope.params, limit]
  const { rows } = await pool.query(
    `SELECT c.name AS champion,
       COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE pgm.win)::int AS wins,
       AVG(pgm.gold - opp.gold)::float8 AS "goldDiff"
     ${FROM_CORE}
     ${OPPONENT_JOIN}
     JOIN champion c ON c.id = opp.champion_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY c.name
     ORDER BY games DESC, wins DESC, c.name
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({
    ...r,
    losses: r.games - r.wins,
    winRate: r.wins / r.games,
    underMinSample: r.games < MIN_SAMPLE,
  }))
}

export interface TargetBanRow {
  champion: string
  games: number
  /** Share of the player's games in range where the opposing team banned this champion. */
  rate: number
}

/**
 * Target bans: champions the player has played in this range that the opposing team banned,
 * ranked by how often. Bans by the player's own team never count, and neither do bans of
 * champions the player hasn't played (those are general meta bans, not aimed at the player).
 */
export async function loadTargetBans(
  pool: pg.Pool,
  scope: PlayerScope,
  limit = DEFAULT_LIST_LIMIT,
): Promise<TargetBanRow[]> {
  const params = [...scope.params, limit]
  const { rows } = await pool.query(
    `WITH mine AS (
       SELECT pgm.game_id, pgm.team_id, pgm.champion_id
       ${FROM_CORE}
       WHERE ${scope.conditions.join(' AND ')}
     ),
     total AS (SELECT COUNT(*)::float8 AS n FROM mine)
     SELECT c.name AS champion,
            COUNT(DISTINCT m.game_id)::int AS games,
            COUNT(DISTINCT m.game_id)::float8 / (SELECT n FROM total) AS rate
     FROM mine m
     JOIN pick_ban pb ON pb.game_id = m.game_id AND pb.action = 'ban' AND pb.team_id <> m.team_id
     JOIN champion c ON c.id = pb.champion_id
     WHERE pb.champion_id IN (SELECT champion_id FROM mine)
     GROUP BY c.name
     ORDER BY rate DESC, c.name
     LIMIT $${params.length}`,
    params,
  )
  return rows
}

export interface Identity {
  role: string | null
  team: string | null
  league: string | null
}

/** Most common role, most recent team, and most common domestic league within the scope. */
export async function loadIdentity(pool: pg.Pool, scope: PlayerScope): Promise<Identity> {
  const where = scope.conditions.join(' AND ')
  const [role, team, league] = await Promise.all([
    pool.query(`SELECT pgm.role ${FROM} WHERE ${where} GROUP BY pgm.role ORDER BY COUNT(*) DESC LIMIT 1`, scope.params),
    pool.query(
      `SELECT tm2.name FROM (SELECT pgm.team_id, g.played_at ${FROM} WHERE ${where} ORDER BY g.played_at DESC NULLS LAST LIMIT 1) latest
       JOIN team tm2 ON tm2.id = latest.team_id`,
      scope.params,
    ),
    pool.query(
      `SELECT l.name ${FROM} WHERE ${where} AND l.name IS NOT NULL GROUP BY l.name ORDER BY COUNT(*) DESC LIMIT 1`,
      scope.params,
    ),
  ])
  return {
    role: role.rows[0]?.role ?? null,
    team: team.rows[0]?.name ?? null,
    league: league.rows[0]?.name ?? null,
  }
}
