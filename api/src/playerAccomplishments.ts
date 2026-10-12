import type pg from 'pg'
import { STATUS_SQL } from './homeQueries.js'
import { toEvent, type ContextEvent } from './teamContext.js'

export type InternationalKey = 'worlds' | 'msi' | 'firstStand'

export interface InternationalAccomplishment {
  key: InternationalKey
  label: string
  /** Events of this kind the player played at least one game in. */
  appearances: number
  /** Their best finish and every event they had it in, oldest first; null while no placement is known. */
  best: { place: string; events: ContextEvent[] } | null
}

export interface TitleAccomplishment {
  count: number
  mostRecent: ContextEvent | null
}

/** One region's results. A player who changed region has one of these per region, never a blend. */
export interface RegionAccomplishments {
  region: string
  league: string
  /** Splits (Spring, Summer, Lock-In, ...) the player played in. A split and its playoffs count once. */
  splitsPlayed: number
  /** The most recent of them: the year and split's own name, and the event of it the player played last. */
  lastSplit: { year: number; split: string; event: ContextEvent } | null
  /** Playoffs won, and playoffs lost in the final. */
  playoffsFirst: TitleAccomplishment
  playoffsSecond: TitleAccomplishment
}

export interface PlayerAccomplishments {
  international: InternationalAccomplishment[]
  /** Every region the player has played a split in, the region of the most recent one first. */
  regions: RegionAccomplishments[]
}

const INTERNATIONAL: { key: InternationalKey; label: string; pattern: RegExp }[] = [
  { key: 'worlds', label: 'Worlds', pattern: /^Worlds(?! Qualifying)/ },
  { key: 'msi', label: 'MSI', pattern: /^MSI\b/ },
  { key: 'firstStand', label: 'First Stand', pattern: /^First Stand\b/ },
]

interface Row extends Omit<ContextEvent, 'placement'> {
  stage: string | null
  isInternational: boolean
  /** A domestic event shared by several leagues (the 2025 LTA Championship: LCS and CBLOL), so nobody's regional title. */
  multiLeague: boolean
  year: number | null
  split: string | null
  region: string | null
  place: string | null
  placeNumber: number | null
  group: string | null
}

/**
 * Everything the player has won or placed in, from the games they played. Like the context strip, an event counts for the
 * team they played most games for in it, and a play-in counts as part of its competition ("Worlds 2025 Play-In" is
 * "Worlds 2025"), so a team knocked out in the play-in still counts as a Worlds appearance.
 */
export async function loadPlayerAccomplishments(pool: pg.Pool, playerId: number): Promise<PlayerAccomplishments> {
  const { rows } = await pool.query<Row>(
    `SELECT t.id, ts.slug, t.name, t.stage, t.is_international AS "isInternational",
            (NOT t.is_international AND t.league_id IS NULL) AS "multiLeague", t.year, t.split,
            COALESCE(l.name, 'INTL') AS league, l.region, ${STATUS_SQL} AS status,
            to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
            tm.name AS team, tr.place, tr.place_number AS "placeNumber", tr.group_name AS "group"
     FROM (SELECT tg.group_id AS tournament_id, mode() WITHIN GROUP (ORDER BY pgm.team_id) AS team_id
           FROM player_game pgm JOIN game g ON g.id = pgm.game_id JOIN tournament_group tg ON tg.id = g.tournament_id
           WHERE pgm.player_id = $1 GROUP BY tg.group_id) pe
     JOIN tournament t ON t.id = pe.tournament_id JOIN tournament_slug ts ON ts.id = t.id
     JOIN team tm ON tm.id = pe.team_id
     LEFT JOIN tournament_team_league ttl ON ttl.tournament_id = t.id AND ttl.team_id = pe.team_id
     LEFT JOIN league l ON l.id = COALESCE(ttl.league_id, t.league_id)
     LEFT JOIN tournament_result tr ON tr.tournament_id = t.id AND tr.team_id = pe.team_id
     ORDER BY t.start_date DESC NULLS LAST, t.id DESC`,
    [playerId],
  )
  return summarize(rows)
}

/** "3-4" -> 1, "3" -> 0: how many places a finish is shared over. */
const rangeWidth = (place: string) => {
  const m = place.match(/^(\d+)\s*-\s*(\d+)$/)
  return m ? Number(m[2]) - Number(m[1]) : 0
}

/** Rows newest first. */
export function summarize(rows: Row[]): PlayerAccomplishments {
  const event = ({ stage: _s, isInternational: _i, multiLeague: _m, year: _y, split: _p, region: _r, placeNumber: _n, ...row }: Row) =>
    toEvent(row)
  const bump = (to: TitleAccomplishment, row: Row) => {
    to.count++
    to.mostRecent ??= event(row)
  }

  const international = INTERNATIONAL.map(({ key, label, pattern }): InternationalAccomplishment => {
    const played = rows.filter((r) => r.isInternational && pattern.test(r.name))
    const placed = played.filter((r) => r.place != null && r.placeNumber != null)
    // Best is the lowest place, and a flat "3" beats a shared "3-4"; ties are the events with that same place.
    const rank = (r: Row) => [r.placeNumber!, rangeWidth(r.place!)]
    const best = placed.reduce<Row | null>((acc, r) => {
      if (!acc) return r
      const [a, b] = [rank(acc), rank(r)]
      return b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? r : acc
    }, null)
    return {
      key,
      label,
      appearances: played.length,
      best: best
        ? { place: best.place!, events: placed.filter((r) => r.place === best.place).reverse().map(event) }
        : null,
    }
  })

  // Keyed by region and filled newest first, so the region of the latest event comes first and each region's first split is
  // its most recent. Qualifiers into other events are not a split or a result, and events shared by two leagues are no
  // single region's result (they still count as a split played, but are never the event the split links to).
  const regions = new Map<string, RegionAccomplishments>()
  const splits = new Map<string, Set<string>>()
  const none = (): TitleAccomplishment => ({ count: 0, mostRecent: null })
  for (const r of rows) {
    if (r.isInternational || r.region == null) continue
    if (r.stage !== 'Playoffs' && r.stage !== 'Regular season') continue
    let region = regions.get(r.region)
    if (!region) {
      region = { region: r.region, league: r.league, splitsPlayed: 0, lastSplit: null, playoffsFirst: none(), playoffsSecond: none() }
      regions.set(r.region, region)
      splits.set(r.region, new Set())
    }
    if (r.year != null && r.split) {
      splits.get(r.region)!.add(`${r.year}|${r.split}`)
      if (!r.multiLeague) region.lastSplit ??= { year: r.year, split: r.split, event: event(r) }
    }
    if (r.multiLeague || r.stage !== 'Playoffs' || (r.placeNumber !== 1 && r.placeNumber !== 2)) continue
    bump(r.placeNumber === 1 ? region.playoffsFirst : region.playoffsSecond, r)
  }
  for (const [name, region] of regions) region.splitsPlayed = splits.get(name)!.size
  return { international, regions: [...regions.values()] }
}
