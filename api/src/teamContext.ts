import type pg from 'pg'
import { STATUS_SQL } from './homeQueries.js'

export interface RosterPlayer {
  page: string
  name: string
  role: string | null
  games: number
  /** The player with the most games in their role for this team's latest event. */
  starter: boolean
  /** True for the player whose page is being viewed (always false on a team page). */
  isViewed: boolean
}

export interface ContextEvent {
  id: number
  name: string
  league: string
  status: 'In progress' | 'Completed'
  startDate: string | null
  endDate: string | null
  /** The team's final placement, once the event is over and Leaguepedia has it. */
  placement: { place: string; group: string | null } | null
  /** The team the player played for in this event (player pages only; team pages leave it out). */
  team?: string
}

export interface ContextMatch {
  seriesId: number
  scheduledAt: string | null
  tournamentId: number
  tournament: string
  opponent: string | null
  bestOf: number | null
  /** Final series score from the team's perspective, e.g. "2-1"; only on results. */
  score: string | null
  won: boolean | null
}

export interface TeamContext {
  league: string | null
  roster: RosterPlayer[]
  events: ContextEvent[]
  /** Upcoming series. Empty when Leaguepedia has not scheduled any for events we hold. */
  upcoming: ContextMatch[]
  results: ContextMatch[]
}

const EVENT_LIMIT = 5

/** Row from the events queries -> ContextEvent: the placement columns become one object. */
export function toEvent({ place, group, ...event }: Omit<ContextEvent, 'placement'> & { place: string | null; group: string | null }): ContextEvent {
  return { ...event, placement: place ? { place, group } : null }
}

const ROLE_ORDER = `CASE pgm.role WHEN 'Top' THEN 1 WHEN 'Jungle' THEN 2 WHEN 'Mid' THEN 3 WHEN 'Bot' THEN 4 WHEN 'Support' THEN 5 ELSE 6 END`

/** Roster, running events, upcoming series and recent results for one team. Shared by the player and team pages. */
export { EVENT_LIMIT }

export async function loadTeamContext(pool: pg.Pool, teamId: number, viewedPlayerId?: number): Promise<TeamContext> {
  const [league, roster, events, upcoming, results] = await Promise.all([
    pool.query(
      `SELECT l.name FROM team_game tg
       JOIN game g ON g.id = tg.game_id JOIN tournament t ON t.id = g.tournament_id
       LEFT JOIN tournament_team_league ttl ON ttl.tournament_id = t.id AND ttl.team_id = tg.team_id
       JOIN league l ON l.id = COALESCE(ttl.league_id, t.league_id)
       WHERE tg.team_id = $1 ORDER BY g.played_at DESC NULLS LAST LIMIT 1`,
      [teamId],
    ),
    // Roster = everyone who played for the team in the event of its most recent game.
    pool.query(
      `WITH last_event AS (
         SELECT g.tournament_id FROM team_game tg JOIN game g ON g.id = tg.game_id
         WHERE tg.team_id = $1 ORDER BY g.played_at DESC NULLS LAST LIMIT 1)
       SELECT p.id, p.name AS page, COALESCE(p.display_name, p.name) AS name,
              mode() WITHIN GROUP (ORDER BY pgm.role) AS role, COUNT(*)::int AS games
       FROM player_game pgm
       JOIN game g ON g.id = pgm.game_id
       JOIN player p ON p.id = pgm.player_id
       WHERE pgm.team_id = $1 AND g.tournament_id = (SELECT tournament_id FROM last_event)
       GROUP BY p.id
       ORDER BY MIN(${ROLE_ORDER}), COUNT(*) DESC, p.name`,
      [teamId],
    ),
    // Events the team is playing right now; if none, the ones it played most recently.
    pool.query(
      `SELECT t.id, t.name, COALESCE(l.name, 'INTL') AS league, ${STATUS_SQL} AS status,
              to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
              tr.place, tr.group_name AS "group"
       FROM tournament t LEFT JOIN league l ON l.id = t.league_id
       LEFT JOIN tournament_result tr ON tr.tournament_id = t.id AND tr.team_id = $1
       WHERE t.id IN (SELECT DISTINCT g.tournament_id FROM team_game tg JOIN game g ON g.id = tg.game_id WHERE tg.team_id = $1)
         AND t.stage IS DISTINCT FROM 'Qualifier'
       ORDER BY (${STATUS_SQL} = 'In progress') DESC, t.start_date DESC NULLS LAST
       LIMIT ${EVENT_LIMIT}`,
      [teamId],
    ),
    pool.query(
      `SELECT s.id AS "seriesId", s.scheduled_at AS "scheduledAt", t.id AS "tournamentId", t.name AS tournament,
              opp.name AS opponent, s.best_of AS "bestOf"
       FROM series s
       JOIN tournament t ON t.id = s.tournament_id
       LEFT JOIN team opp ON opp.id = (CASE WHEN s.team1_id = $1 THEN s.team2_id ELSE s.team1_id END)
       WHERE $1 IN (s.team1_id, s.team2_id) AND s.winner_id IS NULL AND s.scheduled_at >= now()
       ORDER BY s.scheduled_at LIMIT 5`,
      [teamId],
    ),
    pool.query(
      `SELECT s.id AS "seriesId", COALESCE(s.scheduled_at, last.played_at) AS "scheduledAt",
              t.id AS "tournamentId", t.name AS tournament, opp.name AS opponent, s.best_of AS "bestOf",
              s.score, (s.winner_id = $1) AS won, (s.team1_id = $1) AS "isTeam1"
       FROM series s
       JOIN tournament t ON t.id = s.tournament_id
       LEFT JOIN team opp ON opp.id = (CASE WHEN s.team1_id = $1 THEN s.team2_id ELSE s.team1_id END)
       LEFT JOIN LATERAL (SELECT MAX(g.played_at) AS played_at FROM game g WHERE g.series_id = s.id) last ON true
       WHERE $1 IN (s.team1_id, s.team2_id) AND s.winner_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM game g WHERE g.series_id = s.id)
       ORDER BY last.played_at DESC NULLS LAST LIMIT 5`,
      [teamId],
    ),
  ])

  // Starters: the most-played player per role.
  const starters = new Set<string>()
  const seen = new Set<string>()
  for (const p of roster.rows) {
    if (p.role && !seen.has(p.role)) {
      seen.add(p.role)
      starters.add(p.page)
    }
  }

  return {
    league: league.rows[0]?.name ?? null,
    roster: roster.rows.map((p) => ({
      page: p.page,
      name: p.name,
      role: p.role,
      games: p.games,
      starter: starters.has(p.page),
      isViewed: p.id === viewedPlayerId,
    })),
    events: events.rows.map(toEvent),
    upcoming: upcoming.rows.map((m) => ({ ...m, score: null, won: null })),
    results: results.rows.map(({ isTeam1, score, ...m }) => ({
      ...m,
      // Series scores are stored as team1-team2; show them from this team's side.
      score: score && !isTeam1 ? score.split('-').reverse().join('-') : (score ?? null),
    })),
  }
}
