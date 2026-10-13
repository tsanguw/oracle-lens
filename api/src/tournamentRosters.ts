import type pg from 'pg'
import { loadStandings, type TournamentRow } from './tournamentQueries.js'

export interface RosterPlayer {
  /** The player's page name, for the link. */
  page: string
  name: string
  role: string | null
  /** Games played for the team in this event. */
  games: number
}

export interface TeamRoster {
  team: string
  players: RosterPlayer[]
}

/** One row per team, player and role: how many games that player played in that role for that team. */
export interface RosterRow {
  team: string
  page: string
  name: string
  role: string | null
  games: number
}

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bot', 'adc', 'support']
const roleRank = (role: string | null): number => {
  const i = role ? ROLE_ORDER.indexOf(role.toLowerCase()) : -1
  return i === -1 ? ROLE_ORDER.length : i
}

/**
 * Teams in the order given by `standings` (the main event's table), then teams it does not list (a play-in's teams)
 * by name. A player who played more than one role for a team is one entry, under the role they played most (the first
 * of equals, in role order); players run Top to Support, then by games played.
 */
export function shapeRosters(rows: RosterRow[], standings: string[]): TeamRoster[] {
  const teams = new Map<string, Map<string, { page: string; name: string; games: number; roles: Map<string | null, number> }>>()
  for (const r of rows) {
    const players = teams.get(r.team) ?? new Map()
    const p = players.get(r.page) ?? { page: r.page, name: r.name, games: 0, roles: new Map<string | null, number>() }
    p.games += r.games
    p.roles.set(r.role, (p.roles.get(r.role) ?? 0) + r.games)
    players.set(r.page, p)
    teams.set(r.team, players)
  }
  const rank = new Map(standings.map((t, i) => [t, i]))
  return [...teams.entries()]
    .map(([team, players]) => ({
      team,
      players: [...players.values()]
        .map((p) => ({
          page: p.page,
          name: p.name,
          games: p.games,
          role: [...p.roles.entries()].sort((a, b) => b[1] - a[1] || roleRank(a[0]) - roleRank(b[0]))[0][0],
        }))
        .sort((a, b) => roleRank(a.role) - roleRank(b.role) || b.games - a.games || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (rank.get(a.team) ?? Infinity) - (rank.get(b.team) ?? Infinity) || a.team.localeCompare(b.team))
}

/** Who played for each team in the event (its play-in too): from the games, as a tournament has no roster list of its own. */
export async function loadTournamentRosters(pool: pg.Pool, t: TournamentRow): Promise<TeamRoster[]> {
  const [{ rows }, standings] = await Promise.all([
    pool.query<RosterRow>(
      `SELECT tm.name AS team, p.name AS page, COALESCE(p.display_name, p.name) AS name, pgm.role, COUNT(*)::int AS games
       FROM player_game pgm
       JOIN game g ON g.id = pgm.game_id
       JOIN player p ON p.id = pgm.player_id
       JOIN team tm ON tm.id = pgm.team_id
       WHERE g.tournament_id = ANY($1::int[])
       GROUP BY tm.id, p.id, pgm.role`,
      [t.memberIds],
    ),
    loadStandings(pool, t.id),
  ])
  return shapeRosters(rows, standings.map((s) => s.team))
}
