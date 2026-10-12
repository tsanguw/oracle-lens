import type pg from 'pg'

export interface TeamStint {
  /** Leaguepedia's current name for the team. */
  team: string
  /** Our team page name (/teams/:name) when we hold games for the team; null for a team we only know from the roster log. */
  teamPage: string | null
  region: string | null
  /** Their first in-game role, as of the end of the stint. */
  role: string | null
  /** Leaguepedia's "Sub" or "Trainee". */
  modifier: string | null
  /** YYYY-MM-DD; Leaguepedia is day-precise, the page shows the month. */
  start: string
  /** YYYY-MM-DD; null while the stint is running (or when endUnknown). */
  end: string | null
  /** A Join with no Leave and nothing written about the player for years: not known to be running, and no end date to show. */
  endUnknown: boolean
  /** Inactive when the stint ended (or is now). */
  inactive: boolean
  /** On loan from another team. */
  loan: boolean
}

export interface PlayerTeamHistory {
  /** Newest first. */
  stints: TeamStint[]
}

/** The player's teams and when, from Leaguepedia's roster changes (see sync/lolsync/rosters.py), not from games played. */
export async function loadPlayerTeamHistory(pool: pg.Pool, playerId: number): Promise<PlayerTeamHistory> {
  const { rows } = await pool.query<TeamStint>(
    `SELECT s.team_name AS team, t.name AS "teamPage", s.region, s.role, s.role_modifier AS modifier,
            to_char(s.start_date, 'YYYY-MM-DD') AS start, to_char(s.end_date, 'YYYY-MM-DD') AS "end",
            s.end_unknown AS "endUnknown", s.inactive, s.loan
     FROM player_team_stint s LEFT JOIN team t ON t.id = s.team_id
     WHERE s.player_id = $1
     ORDER BY s.start_date DESC, s.id DESC`,
    [playerId],
  )
  return { stints: rows }
}
