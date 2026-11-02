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
 * $1 and $2 are the region ids; `yearParam` limits team_year to one year when the range fixes it. With `newest` only the
 * newest year with a meeting is kept, found in the same pass so the team-to-region mapping is worked out once.
 */
function meetingsCte(yearParam: string | null, conds: string[], newest: boolean): string {
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
  found AS MATERIALIZED (
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
  ),
  meetings AS MATERIALIZED (
    SELECT * FROM found ${newest ? 'WHERE year = (SELECT MAX(year) FROM found)' : ''}
  )`
}

interface RegionRange {
  /** Newest-year default: the year is found by the query and the range labelled afterwards. */
  newest: boolean
  conds: string[]
  params: unknown[]
  /** The year an explicit filter fixes, so team_year can skip the other years. */
  year: number | null
  range: CompareRange
}

/** Explicit filters and `range=all` mean what they mean on the other Versus pages; otherwise the newest year the regions met. */
function resolveRegionRange(a: RegionRow, b: RegionRow, filters: Filters): RegionRange {
  const params: unknown[] = [a.id, b.id]
  const base = { domesticOnly: false, from: null, to: null }

  if (hasRangeFilter(filters)) {
    const conds = buildConditions(filters, params)
    const parts = [filters.year, filters.tournament, filters.patch].filter(Boolean)
    return {
      newest: false,
      conds,
      params,
      year: filters.year ?? null,
      range: { ...base, label: parts.join(' '), description: 'Custom filters', isDefault: false, resolved: null },
    }
  }
  const allTime: CompareRange = { ...base, label: 'All time', description: 'Tier 1 leagues and internationals only', isDefault: false, resolved: null }
  if (isAllTime(filters)) return { newest: false, conds: [], params, year: null, range: allTime }
  return { newest: true, conds: [], params, year: null, range: allTime }
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

/**
 * One statement computes the meetings once (the team-to-region mapping is the expensive part) and every figure is read from
 * them as a JSON column: the summaries, the series, the teams and the picks.
 */
export async function loadCompareRegions(pool: pg.Pool, a: RegionRow, b: RegionRow, filters: Filters) {
  const resolved = resolveRegionRange(a, b, filters)
  const { newest, conds, params, year } = resolved
  const queryParams = [...params]
  const yearParam = year === null ? null : `$${queryParams.push(year)}`

  const { rows } = await pool.query(
    `WITH ${meetingsCte(yearParam, conds, newest)},
     met AS (
       SELECT series_id, team_id, opp_id, MAX(played_at) AS last FROM meetings
       WHERE region = $1 AND series_id IS NOT NULL GROUP BY series_id, team_id, opp_id
     )
     SELECT
       (SELECT MAX(year)::int FROM meetings) AS year,
       (SELECT COALESCE(json_agg(s), '[]'::json)
        FROM (SELECT region, ${TEAM_SUMMARY_COLUMNS} FROM meetings GROUP BY region) s) AS summaries,
       (SELECT COALESCE(json_agg(x ORDER BY x."playedAt" DESC NULLS LAST, x."seriesId" DESC), '[]'::json)
        FROM (
          SELECT s.id AS "seriesId", met.last AS "playedAt", t.name AS tournament, t.id AS "tournamentId", ts.slug AS "tournamentSlug",
                 ta.name AS "teamA", tb.name AS "teamB", s.score, (s.team1_id = met.team_id) AS "isTeam1",
                 CASE WHEN s.winner_id = met.team_id THEN 'a' WHEN s.winner_id = met.opp_id THEN 'b' END AS winner
          FROM met JOIN series s ON s.id = met.series_id
          JOIN tournament t ON t.id = s.tournament_id JOIN tournament_slug ts ON ts.id = t.id
          JOIN team ta ON ta.id = met.team_id JOIN team tb ON tb.id = met.opp_id
        ) x) AS series,
       (SELECT COALESCE(json_agg(x ORDER BY x.games DESC, x.team), '[]'::json)
        FROM (
          SELECT m.region, tm.name AS team, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE m.win)::int AS wins
          FROM meetings m JOIN team tm ON tm.id = m.team_id GROUP BY m.region, tm.id
        ) x) AS teams,
       (SELECT COALESCE(json_agg(x ORDER BY x.region, x.rank), '[]'::json)
        FROM (
          SELECT p.*, row_number() OVER (PARTITION BY p.region ORDER BY p.games DESC, p.wins DESC, p.champion) AS rank
          FROM (
            SELECT m.region, c.name AS champion, COUNT(*)::int AS games, COUNT(*) FILTER (WHERE m.win)::int AS wins
            FROM meetings m
            JOIN player_game pg2 ON pg2.game_id = m.game_id AND pg2.team_id = m.team_id
            JOIN champion c ON c.id = pg2.champion_id
            GROUP BY m.region, c.name
          ) p
        ) x WHERE x.rank <= ${POOL_LIMIT}) AS picks`,
    queryParams,
  )
  const found = rows[0]

  const range: CompareRange =
    newest && found.year !== null
      ? { ...resolved.range, label: String(found.year), description: 'Newest year they met', isDefault: true, resolved: { year: found.year, split: null } }
      : newest
        ? { ...resolved.range, description: 'They have not met in any year', isDefault: true }
        : resolved.range

  const side = (r: RegionRow): RegionSide => {
    const summaryRow = (found.summaries as Array<{ region: number; games: number; wins: number }>).find((x) => x.region === r.id)
    const { region: _region, ...summary } = summaryRow ?? ({} as { region: number; games: number; wins: number })
    return {
      region: { name: r.name, area: r.area },
      summary: summaryRow
        ? ({ ...summary, losses: summaryRow.games - summaryRow.wins, winRate: summaryRow.wins / summaryRow.games } as TeamSummary)
        : null,
      teams: (found.teams as Array<{ region: number; games: number; wins: number }>)
        .filter((x) => x.region === r.id)
        .map(({ region: _r, ...x }) => ({ ...x, losses: x.games - x.wins, winRate: x.wins / x.games, underMinSample: x.games < MIN_SAMPLE })) as RegionTeamRow[],
      picks: (found.picks as Array<{ region: number; games: number; wins: number; rank: number }>)
        .filter((x) => x.region === r.id)
        .map(({ region: _r, rank: _rank, ...x }) => ({ ...x, winRate: x.wins / x.games, underMinSample: x.games < MIN_SAMPLE })) as TeamPick[],
    }
  }
  const sa = side(a)
  const sb = side(b)

  const series = found.series as Array<{ winner: 'a' | 'b' | null; isTeam1: boolean; score: string | null }>
  const decided = series.filter((r) => r.winner !== null)
  const seriesWins = decided.filter((r) => r.winner === 'a').length
  const headToHead: RegionHeadToHead = {
    games: sa.summary?.games ?? 0,
    wins: sa.summary?.wins ?? 0,
    losses: sa.summary?.losses ?? 0,
    seriesPlayed: decided.length,
    seriesWins,
    seriesLosses: decided.length - seriesWins,
    avgGameLengthSec: sa.summary?.avgGameLengthSec ?? null,
    recent: series.slice(0, RECENT_LIMIT).map(({ isTeam1, score, ...m }) => ({
      ...m,
      // Series scores are stored as team1-team2; show them from region A's team's side.
      score: score && !isTeam1 ? score.split('-').reverse().join('-') : (score ?? null),
    })) as RegionMeeting[],
  }
  return { range, empty: sa.summary === null && sb.summary === null, a: sa, b: sb, headToHead }
}
