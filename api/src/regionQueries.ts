import type pg from 'pg'
import { buildConditions, filterSchema, hasRangeFilter, isAllTime, MIN_SAMPLE, type Filters } from './filters.js'
import { TEAM_SUMMARY_COLUMNS, type TeamPick, type TeamSummary } from './teamQueries.js'
import type { CompareRange } from './compareQueries.js'

/** Regions have no league, split, side or role: internationals have none of them, and the tape splits blue and red itself. */
export const compareRegionsSchema = filterSchema.pick({ year: true, tournament: true, patch: true, range: true })

export interface RegionRow {
  id: number
  name: string
  area: string | null
}

/** A region is one of the leagues the sync loads (LCK, LPL, LEC, LCS, CBLOL, LCP); the name is matched ignoring case. */
export async function findRegion(pool: pg.Pool, name: string): Promise<RegionRow | null> {
  const { rows } = await pool.query(`SELECT id, name, region AS area FROM league WHERE lower(name) = lower($1)`, [name])
  return rows[0] ?? null
}

const POOL_LIMIT = 10
const RECENT_LIMIT = 20

/**
 * `team_year`: a team's region in a year is the league of most of its domestic games that year (the latest game breaks a
 * tie); a game's league is the tournament's, or the team's own conference league in a multi-league event. A team with no
 * domestic game in a year has no region then. `meetings`: one row per team per game in which the two regions' teams
 * played each other, from that team's side, with the columns `TEAM_SUMMARY_COLUMNS` reads.
 * $1 and $2 are the region ids; `yearParam` limits team_year to one year when the range fixes it.
 */
function meetingsCte(yearParam: string | null, conds: string[]): string {
  return `
  team_year AS (
    SELECT DISTINCT ON (tg.team_id, t.year) tg.team_id, t.year, COALESCE(ttl.league_id, t.league_id) AS league_id
    FROM team_game tg
    JOIN game g ON g.id = tg.game_id
    JOIN tournament t ON t.id = g.tournament_id
    LEFT JOIN tournament_team_league ttl ON ttl.tournament_id = t.id AND ttl.team_id = tg.team_id
    WHERE NOT t.is_international AND COALESCE(ttl.league_id, t.league_id) IS NOT NULL
      ${yearParam ? `AND t.year = ${yearParam}` : ''}
    GROUP BY tg.team_id, t.year, COALESCE(ttl.league_id, t.league_id)
    ORDER BY tg.team_id, t.year, COUNT(*) DESC, MAX(g.played_at) DESC NULLS LAST
  ),
  meetings AS (
    SELECT ry.league_id AS region, t.year, g.series_id, g.played_at, g.length_sec,
           pgm.game_id, pgm.team_id, pgm.win, pgm.side, pgm.kills, pgm.gold,
           pgm.towers, pgm.dragons, pgm.barons, pgm.heralds, pgm.void_grubs,
           opp.team_id AS opp_id, opp.kills AS opp_kills, opp.gold AS opp_gold
    FROM team_game pgm
    JOIN game g ON g.id = pgm.game_id
    JOIN tournament t ON t.id = g.tournament_id
    JOIN team_game opp ON opp.game_id = pgm.game_id AND opp.team_id <> pgm.team_id
    JOIN team_year ry ON ry.team_id = pgm.team_id AND ry.year = t.year
    JOIN team_year oy ON oy.team_id = opp.team_id AND oy.year = t.year
    WHERE ry.league_id IN ($1, $2) AND oy.league_id IN ($1, $2) AND ry.league_id <> oy.league_id
      ${conds.map((c) => `AND ${c}`).join(' ')}
  )`
}

/** Explicit filters and `range=all` mean what they mean on the other Versus pages; otherwise the newest year the regions met. */
async function resolveRegionRange(
  pool: pg.Pool,
  a: RegionRow,
  b: RegionRow,
  filters: Filters,
): Promise<{ range: CompareRange; year: number | null; conds: string[]; params: unknown[] }> {
  const params: unknown[] = [a.id, b.id]
  const base = { domesticOnly: false, from: null, to: null }

  if (hasRangeFilter(filters)) {
    const conds = buildConditions(filters, params)
    const parts = [filters.year, filters.tournament, filters.patch].filter(Boolean)
    return {
      conds,
      params,
      year: filters.year ?? null,
      range: { ...base, label: parts.join(' '), description: 'Custom filters', isDefault: false, resolved: null },
    }
  }
  if (isAllTime(filters)) {
    return {
      conds: [],
      params,
      year: null,
      range: { ...base, label: 'All time', description: 'Tier 1 leagues and internationals only', isDefault: false, resolved: null },
    }
  }

  const { rows } = await pool.query(`WITH ${meetingsCte(null, [])} SELECT MAX(year)::int AS year FROM meetings`, params)
  const year: number | null = rows[0]?.year ?? null
  if (year === null) {
    return {
      conds: [],
      params,
      year: null,
      range: { ...base, label: 'All time', description: 'They have not met in any year', isDefault: true, resolved: null },
    }
  }
  params.push(year)
  return {
    conds: [`t.year = $${params.length}`],
    params,
    year,
    range: { ...base, label: String(year), description: 'Newest year they met', isDefault: true, resolved: { year, split: null } },
  }
}

export interface RegionTeamRow {
  team: string
  games: number
  wins: number
  losses: number
  winRate: number
  underMinSample: boolean
}

export interface RegionSide {
  region: { name: string; area: string | null }
  summary: TeamSummary | null
  /** Teams of the region that played in these meetings, most games first. */
  teams: RegionTeamRow[]
  /** The region's most picked champions in these meetings, for the slideshow in the page header. */
  picks: TeamPick[]
}

export interface RegionMeeting {
  seriesId: number
  playedAt: string | null
  tournament: string
  tournamentId: number
  /** The event's readable address segment; for a play-in's series, its competition's. */
  tournamentSlug: string
  teamA: string
  teamB: string
  /** Series score from region A's team's side, e.g. "2-1". */
  score: string | null
  winner: 'a' | 'b' | null
}

export interface RegionHeadToHead {
  games: number
  wins: number
  losses: number
  seriesPlayed: number
  seriesWins: number
  seriesLosses: number
  avgGameLengthSec: number | null
  /** Most recent series first. */
  recent: RegionMeeting[]
}

export async function loadCompareRegions(pool: pg.Pool, a: RegionRow, b: RegionRow, filters: Filters) {
  const { range, year, conds, params } = await resolveRegionRange(pool, a, b, filters)
  // team_year only needs the year the range fixes, so a default or single-year view skips every other year's team games.
  const queryParams = [...params]
  const yearParam = year === null ? null : `$${queryParams.push(year)}`
  const withMeetings = `WITH ${meetingsCte(yearParam, conds)}`

  const [summaries, series, teams, picks] = await Promise.all([
    pool.query(`${withMeetings} SELECT region, ${TEAM_SUMMARY_COLUMNS} FROM meetings GROUP BY region`, queryParams),
    pool.query(
      `${withMeetings},
       met AS (
         SELECT series_id, team_id, opp_id, MAX(played_at) AS last FROM meetings
         WHERE region = $1 AND series_id IS NOT NULL GROUP BY series_id, team_id, opp_id
       )
       SELECT s.id AS "seriesId", met.last AS "playedAt", t.name AS tournament, t.id AS "tournamentId", ts.slug AS "tournamentSlug",
              ta.name AS "teamA", tb.name AS "teamB", s.score, (s.team1_id = met.team_id) AS "isTeam1",
              CASE WHEN s.winner_id = met.team_id THEN 'a' WHEN s.winner_id = met.opp_id THEN 'b' END AS winner
       FROM met JOIN series s ON s.id = met.series_id
       JOIN tournament t ON t.id = s.tournament_id JOIN tournament_slug ts ON ts.id = t.id
       JOIN team ta ON ta.id = met.team_id JOIN team tb ON tb.id = met.opp_id
       ORDER BY met.last DESC NULLS LAST, s.id DESC`,
      queryParams,
    ),
    pool.query(
      `${withMeetings}
       SELECT m.region, tm.name AS team, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE m.win)::int AS wins
       FROM meetings m JOIN team tm ON tm.id = m.team_id
       GROUP BY m.region, tm.id ORDER BY games DESC, tm.name`,
      queryParams,
    ),
    pool.query(
      `${withMeetings}
       SELECT m.region, c.name AS champion, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE m.win)::int AS wins
       FROM meetings m
       JOIN player_game pg2 ON pg2.game_id = m.game_id AND pg2.team_id = m.team_id
       JOIN champion c ON c.id = pg2.champion_id
       GROUP BY m.region, c.name ORDER BY games DESC, wins DESC, c.name`,
      queryParams,
    ),
  ])

  const side = (r: RegionRow): RegionSide => {
    const found = summaries.rows.find((x) => x.region === r.id)
    const { region: _region, ...summary } = found ?? {}
    return {
      region: { name: r.name, area: r.area },
      summary: found ? ({ ...summary, losses: found.games - found.wins, winRate: found.wins / found.games } as TeamSummary) : null,
      teams: teams.rows
        .filter((x) => x.region === r.id)
        .map(({ region: _r, ...x }) => ({ ...x, losses: x.games - x.wins, winRate: x.wins / x.games, underMinSample: x.games < MIN_SAMPLE })),
      picks: picks.rows
        .filter((x) => x.region === r.id)
        .slice(0, POOL_LIMIT)
        .map(({ region: _r, ...x }) => ({ ...x, winRate: x.wins / x.games, underMinSample: x.games < MIN_SAMPLE })),
    }
  }
  const sa = side(a)
  const sb = side(b)

  const decided = series.rows.filter((r) => r.winner !== null)
  const seriesWins = decided.filter((r) => r.winner === 'a').length
  const headToHead: RegionHeadToHead = {
    games: sa.summary?.games ?? 0,
    wins: sa.summary?.wins ?? 0,
    losses: sa.summary?.losses ?? 0,
    seriesPlayed: decided.length,
    seriesWins,
    seriesLosses: decided.length - seriesWins,
    avgGameLengthSec: sa.summary?.avgGameLengthSec ?? null,
    recent: series.rows.slice(0, RECENT_LIMIT).map(({ isTeam1, score, ...m }) => ({
      ...m,
      // Series scores are stored as team1-team2; show them from region A's team's side.
      score: score && !isTeam1 ? score.split('-').reverse().join('-') : (score ?? null),
    })),
  }
  return { range, empty: sa.summary === null && sb.summary === null, a: sa, b: sb, headToHead }
}
