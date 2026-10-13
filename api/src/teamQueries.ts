import type pg from 'pg'
import { z } from 'zod'
import { filterSchema, MIN_SAMPLE } from './filters.js'
import { FROM, FROM_CORE, ka, ok, perMin, type PlayerScope } from './playerQueries.js'

/** Team pages have no role filter (a team plays all five roles). Unknown query keys are ignored. */
export const teamFilterSchema = filterSchema.omit({ role: true })
export const teamListFilterSchema = teamFilterSchema.extend({ limit: z.coerce.number().int().min(1).max(20).optional() })

export interface TeamRow {
  id: number
  name: string
  region: string | null
}

export async function findTeam(pool: pg.Pool, idOrName: string): Promise<TeamRow | null> {
  const byId = /^\d+$/.test(idOrName)
  const { rows } = await pool.query(
    `SELECT id, name, region FROM team WHERE ${byId ? 'id = $1::int' : 'name = $1'}`,
    [idOrName],
  )
  // A team whose real name is all digits is rare; fall back to a name lookup before giving up.
  if (!rows[0] && byId) {
    const named = await pool.query(`SELECT id, name, region FROM team WHERE name = $1`, [idOrName])
    return named.rows[0] ?? null
  }
  return rows[0] ?? null
}

/** The team's own rows (one per game) in the scope, with the opponent's row alongside. Aliases: pgm = team_game. */
const FROM_TEAM = FROM_CORE.replace('player_game pgm', 'team_game pgm')

/** `base` CTE: one row per team game in scope, with the opponent's kills and gold. */
const base = (scope: PlayerScope) => `
  base AS (
    SELECT pgm.game_id, pgm.team_id, pgm.win, pgm.side, pgm.kills, pgm.gold, g.length_sec,
           pgm.towers, pgm.dragons, pgm.barons, pgm.heralds, pgm.void_grubs,
           opp.team_id AS opp_id, opp.kills AS opp_kills, opp.gold AS opp_gold
    ${FROM_TEAM}
    LEFT JOIN team_game opp ON opp.game_id = pgm.game_id AND opp.team_id <> pgm.team_id
    WHERE ${scope.conditions.join(' AND ')}
  )`

export interface TeamSummary {
  games: number
  wins: number
  losses: number
  winRate: number
  blueGames: number
  blueWins: number
  redGames: number
  redWins: number
  avgGameLengthSec: number | null
  killsPerGame: number | null
  deathsPerGame: number | null
  goldPerMin: number | null
  towersPerGame: number | null
  dragonsPerGame: number | null
  baronsPerGame: number | null
  heraldsPerGame: number | null
  voidGrubsPerGame: number | null
  /** Average final gold difference against opponents (positive = ahead). */
  goldDiff: number | null
}

export async function loadTeamSummary(pool: pg.Pool, scope: PlayerScope): Promise<TeamSummary | null> {
  const { rows } = await pool.query(
    `WITH ${base(scope)}
     SELECT COUNT(*)::int AS games,
       COUNT(*) FILTER (WHERE win)::int AS wins,
       COUNT(*) FILTER (WHERE side = 'blue')::int AS "blueGames",
       COUNT(*) FILTER (WHERE side = 'blue' AND win)::int AS "blueWins",
       COUNT(*) FILTER (WHERE side = 'red')::int AS "redGames",
       COUNT(*) FILTER (WHERE side = 'red' AND win)::int AS "redWins",
       AVG(length_sec)::float8 AS "avgGameLengthSec",
       AVG(kills)::float8 AS "killsPerGame",
       AVG(opp_kills)::float8 AS "deathsPerGame",
       SUM(gold) FILTER (WHERE gold IS NOT NULL AND length_sec > 0)::float8
         / NULLIF(SUM(length_sec) FILTER (WHERE gold IS NOT NULL AND length_sec > 0) / 60.0, 0) AS "goldPerMin",
       AVG(towers)::float8 AS "towersPerGame",
       AVG(dragons)::float8 AS "dragonsPerGame",
       AVG(barons)::float8 AS "baronsPerGame",
       AVG(heralds)::float8 AS "heraldsPerGame",
       AVG(void_grubs)::float8 AS "voidGrubsPerGame",
       AVG(gold - opp_gold)::float8 AS "goldDiff"
     FROM base`,
    scope.params,
  )
  const r = rows[0]
  if (!r || r.games === 0) return null
  return { ...r, losses: r.games - r.wins, winRate: r.wins / r.games }
}

export async function loadTeamLeague(pool: pg.Pool, scope: PlayerScope): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT l.name ${FROM} WHERE ${scope.conditions.join(' AND ')} AND l.name IS NOT NULL
     GROUP BY l.name ORDER BY COUNT(*) DESC LIMIT 1`,
    scope.params,
  )
  return rows[0]?.name ?? null
}

export interface TeamPlayerRow {
  page: string
  name: string
  role: string | null
  games: number
  wins: number
  winRate: number
  kda: number | null
  killParticipation: number | null
  damagePerMin: number | null
  csPerMin: number | null
  underMinSample: boolean
}

const ROLE_ORDER = `CASE mode() WITHIN GROUP (ORDER BY pgm.role)
  WHEN 'Top' THEN 1 WHEN 'Jungle' THEN 2 WHEN 'Mid' THEN 3 WHEN 'Bot' THEN 4 WHEN 'Support' THEN 5 ELSE 6 END`

/** Everyone who played for the team in the scope, with their stats for this team only. */
export async function loadTeamPlayers(pool: pg.Pool, scope: PlayerScope): Promise<TeamPlayerRow[]> {
  const { rows } = await pool.query(
    `SELECT p.name AS page, COALESCE(p.display_name, p.name) AS name,
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
       ${perMin('pgm.cs')} AS "csPerMin"
     ${FROM}
     JOIN player p ON p.id = pgm.player_id
     WHERE ${scope.conditions.join(' AND ')}
     GROUP BY p.id
     ORDER BY ${ROLE_ORDER}, COUNT(*) DESC, p.name`,
    scope.params,
  )
  return rows.map((r) => ({ ...r, winRate: r.wins / r.games, underMinSample: r.games < MIN_SAMPLE }))
}

export interface TeamPick {
  champion: string
  games: number
  wins: number
  winRate: number
  underMinSample: boolean
}

export interface TeamBan {
  champion: string
  games: number
  /** Share of the team's games in the scope. */
  rate: number
}

export interface TeamDraft {
  picks: TeamPick[]
  bans: TeamBan[]
  bansAgainst: TeamBan[]
}

export const DEFAULT_LIST_LIMIT = 8

export async function loadTeamDraft(pool: pg.Pool, scope: PlayerScope, limit = DEFAULT_LIST_LIMIT): Promise<TeamDraft> {
  const params = [...scope.params, limit]
  const lim = `$${params.length}`
  const withBase = `WITH ${base(scope)}`
  const banQuery = (own: boolean) =>
    pool.query(
      `${withBase}
       SELECT c.name AS champion, COUNT(*)::int AS games,
              COUNT(*)::float8 / NULLIF((SELECT COUNT(*) FROM base), 0) AS rate
       FROM base
       JOIN game_ban gb ON gb.game_id = base.game_id AND gb.team_id ${own ? '=' : '<>'} base.team_id
       JOIN champion c ON c.id = gb.champion_id
       GROUP BY c.name ORDER BY games DESC, c.name LIMIT ${lim}`,
      params,
    )
  const [picks, bans, against] = await Promise.all([
    pool.query(
      `${withBase}
       SELECT c.name AS champion, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE base.win)::int AS wins
       FROM base
       JOIN player_game pg2 ON pg2.game_id = base.game_id AND pg2.team_id = base.team_id
       JOIN champion c ON c.id = pg2.champion_id
       GROUP BY c.name ORDER BY games DESC, wins DESC, c.name LIMIT ${lim}`,
      params,
    ),
    banQuery(true),
    banQuery(false),
  ])
  return {
    picks: picks.rows.map((r) => ({ ...r, winRate: r.wins / r.games, underMinSample: r.games < MIN_SAMPLE })),
    bans: bans.rows,
    bansAgainst: against.rows,
  }
}

export interface OpponentRow {
  team: string
  games: number
  wins: number
  losses: number
  winRate: number
  goldDiff: number | null
  underMinSample: boolean
}

/** Head-to-head record per opposing team, most frequent opponents first. */
export async function loadOpponents(pool: pg.Pool, scope: PlayerScope, limit = DEFAULT_LIST_LIMIT): Promise<OpponentRow[]> {
  const params = [...scope.params, limit]
  const { rows } = await pool.query(
    `WITH ${base(scope)}
     SELECT ot.name AS team, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE base.win)::int AS wins,
            AVG(base.gold - base.opp_gold)::float8 AS "goldDiff"
     FROM base JOIN team ot ON ot.id = base.opp_id
     GROUP BY ot.id ORDER BY games DESC, ot.name LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({
    ...r,
    losses: r.games - r.wins,
    winRate: r.wins / r.games,
    underMinSample: r.games < MIN_SAMPLE,
  }))
}
