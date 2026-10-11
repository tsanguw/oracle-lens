import type pg from 'pg'
import { IS_EVENT_HEAD, STATUS_SQL } from './homeQueries.js'
import { EVENT_LIMIT, loadTeamContext, toEvent, type ContextEvent, type TeamContext } from './teamContext.js'

export type { ContextEvent, ContextMatch, RosterPlayer } from './teamContext.js'

/** A player whose last game was longer ago than this is shown with their "last team", not a current one. */
const CURRENT_WINDOW_DAYS = 120

export interface ContextTeam {
  name: string
  league: string | null
  /** False when the player has not played for months (retired, between teams, or the team left the league). */
  isCurrent: boolean
  lastPlayed: string | null
}

export interface PlayerContext extends Omit<TeamContext, 'league'> {
  team: ContextTeam | null
}

/** The player's most recent team, with that team's roster, running events and schedule. */
export async function loadPlayerContext(pool: pg.Pool, playerId: number): Promise<PlayerContext> {
  const latest = await pool.query(
    `SELECT pgm.team_id AS "teamId", tm.name, g.played_at AS "playedAt",
            (g.played_at >= now() - ($2 || ' days')::interval) AS "isCurrent"
     FROM player_game pgm JOIN game g ON g.id = pgm.game_id JOIN team tm ON tm.id = pgm.team_id
     WHERE pgm.player_id = $1 ORDER BY g.played_at DESC NULLS LAST LIMIT 1`,
    [playerId, CURRENT_WINDOW_DAYS],
  )
  const row = latest.rows[0]
  if (!row) return { team: null, roster: [], events: [], upcoming: [], results: [] }

  const [{ league, ...rest }, events] = await Promise.all([
    loadTeamContext(pool, row.teamId, playerId),
    loadPlayerEvents(pool, playerId),
  ])
  return {
    team: {
      name: row.name,
      league,
      isCurrent: row.isCurrent,
      lastPlayed: row.playedAt ? new Date(row.playedAt).toISOString() : null,
    },
    ...rest,
    events,
  }
}

/**
 * The player's own events (not their current team's): running ones first, then the most recent. Each carries the team
 * they played for in it and that team's final placement, so the placement is the one they actually finished with.
 */
async function loadPlayerEvents(pool: pg.Pool, playerId: number): Promise<ContextEvent[]> {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, COALESCE(l.name, 'INTL') AS league, ${STATUS_SQL} AS status,
            to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
            tm.name AS team, tr.place, tr.group_name AS "group"
     FROM (SELECT g.tournament_id, mode() WITHIN GROUP (ORDER BY pgm.team_id) AS team_id
           FROM player_game pgm JOIN game g ON g.id = pgm.game_id
           WHERE pgm.player_id = $1 GROUP BY g.tournament_id) pe
     JOIN tournament t ON t.id = pe.tournament_id
     LEFT JOIN league l ON l.id = t.league_id
     JOIN team tm ON tm.id = pe.team_id
     LEFT JOIN tournament_result tr ON tr.tournament_id = t.id AND tr.team_id = pe.team_id
     WHERE t.stage IS DISTINCT FROM 'Qualifier' AND ${IS_EVENT_HEAD('t')}
     ORDER BY (${STATUS_SQL} = 'In progress') DESC, t.start_date DESC NULLS LAST
     LIMIT ${EVENT_LIMIT}`,
    [playerId],
  )
  return rows.map(toEvent)
}
