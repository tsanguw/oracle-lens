import type pg from 'pg'
import { loadTeamContext, type TeamContext } from './teamContext.js'

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

  const { league, ...rest } = await loadTeamContext(pool, row.teamId, playerId)
  return {
    team: {
      name: row.name,
      league,
      isCurrent: row.isCurrent,
      lastPlayed: row.playedAt ? new Date(row.playedAt).toISOString() : null,
    },
    ...rest,
  }
}
