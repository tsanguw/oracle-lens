import type pg from 'pg'

/*
 * An event's series grouped into stages (play-in, swiss, groups, knockout) from the round each one belongs to on
 * Leaguepedia ("Quarterfinals", "Bracket Round 2", "Swiss Round 3"). For the knockout stage each series also says where
 * its two teams came from, so the page can draw the bracket: a team arrives either as the winner of an earlier series or,
 * in a double-elimination bracket, as the loser of one (it dropped down). Nothing here is stored; it is derived on request.
 */

export type StageKind = 'playin' | 'groups' | 'swiss' | 'knockout'

export interface StageSeriesRow {
  seriesId: number
  tab: string
  tabOrder: number
  n: number | null
  team1: string | null
  team2: string | null
  region1: string | null
  region2: string | null
  winner: string | null
  score: string | null
  bestOf: number | null
  at: string | null
}

export interface BracketSlot {
  team: string | null
  region: string | null
  score: number | null
  won: boolean
  /** The earlier series this team came from, and whether it won or lost there; null for a team's first series. */
  from: { seriesId: number; as: 'won' | 'lost' | null } | null
}

/** upper: nobody has lost yet; lower: at least one team already lost once; final: the last round's single series. */
export type Lane = 'upper' | 'lower' | 'final'

export interface StageSeries {
  seriesId: number
  n: number | null
  bestOf: number | null
  at: string | null
  played: boolean
  slots: [BracketSlot, BracketSlot]
  /** Knockout only. */
  lane?: Lane
}

export interface StageRound {
  name: string
  order: number
  series: StageSeries[]
}

export interface Stage {
  key: StageKind
  label: string
  rounds: StageRound[]
}

const KNOCKOUT_WORDS = /quarter|semi|final|bracket|playoff|knockout|elimination|upper|lower/i

/** What kind of stage a round belongs to. `swissLike` says plain "Round N" rounds are swiss rounds (the event also has a knockout). */
export function tabKind(tab: string, ctx: { playoffs: boolean; swissLike: boolean }): StageKind {
  if (/play-?in/i.test(tab)) return 'playin'
  if (/swiss/i.test(tab)) return 'swiss'
  if (/group|^week\b|^day\b/i.test(tab)) return 'groups'
  if (KNOCKOUT_WORDS.test(tab)) return 'knockout'
  if (/^round\s*\d+$/i.test(tab)) return ctx.playoffs ? 'knockout' : ctx.swissLike ? 'swiss' : 'groups'
  return ctx.playoffs ? 'knockout' : 'groups'
}

const ORDER: StageKind[] = ['playin', 'groups', 'swiss', 'knockout']

function labelFor(kind: StageKind, playoffs: boolean): string {
  return { playin: 'Play-In', groups: 'Group stage', swiss: 'Swiss', knockout: playoffs ? 'Playoffs' : 'Knockout' }[kind]
}

const scoreOf = (score: string | null, side: 0 | 1): number | null => {
  const m = score?.match(/^(\d+)-(\d+)$/)
  return m ? Number(m[side + 1]) : null
}

/** "Bracket Round 2" reads as "Round 2" inside a bracket. */
const roundName = (tab: string) => tab.replace(/^bracket\s+/i, '')

export function buildStages(rows: StageSeriesRow[], tournamentName: string): Stage[] {
  const playoffs = /playoffs?|knockout/i.test(tournamentName)
  const swissLike = rows.some((r) => /quarter|semi/i.test(r.tab))
  const ctx = { playoffs, swissLike }

  const byKind = new Map<StageKind, StageSeriesRow[]>()
  for (const r of rows) {
    const kind = tabKind(r.tab, ctx)
    byKind.set(kind, [...(byKind.get(kind) ?? []), r])
  }

  const stages: Stage[] = []
  for (const kind of ORDER) {
    const list = byKind.get(kind)
    if (!list?.length) continue
    list.sort((a, b) => a.tabOrder - b.tabOrder || (a.n ?? 0) - (b.n ?? 0) || a.seriesId - b.seriesId)
    const rounds = kind === 'knockout' ? bracketRounds(list) : plainRounds(list)
    stages.push({ key: kind, label: labelFor(kind, playoffs), rounds })
  }
  return stages
}

function slot(r: StageSeriesRow, side: 0 | 1): BracketSlot {
  const team = side === 0 ? r.team1 : r.team2
  return { team, region: side === 0 ? r.region1 : r.region2, score: scoreOf(r.score, side), won: team !== null && team === r.winner, from: null }
}

function toSeries(r: StageSeriesRow): StageSeries {
  return { seriesId: r.seriesId, n: r.n, bestOf: r.bestOf, at: r.at, played: r.winner !== null, slots: [slot(r, 0), slot(r, 1)] }
}

/** Rounds as Leaguepedia lists them: one per tab, in order. */
function plainRounds(list: StageSeriesRow[]): StageRound[] {
  const rounds: StageRound[] = []
  for (const r of list) {
    let round = rounds.find((x) => x.order === r.tabOrder && x.name === roundName(r.tab))
    if (!round) rounds.push((round = { name: roundName(r.tab), order: r.tabOrder, series: [] }))
    round.series.push(toSeries(r))
  }
  return rounds
}

/**
 * Knockout rounds from the games themselves. A tab is not always a bracket round: in a double-elimination bracket a
 * lower-bracket series can sit in the same tab as the upper-bracket series whose losers play it. So each series goes
 * one column after the latest series that fed it (or into its tab's column, if that is later, for teams with a bye),
 * and series are walked in order so results are known when the next one is placed.
 */
function bracketRounds(list: StageSeriesRow[]): StageRound[] {
  const last = new Map<string, { seriesId: number; as: 'won' | 'lost' | null; column: number }>()
  const losses = new Map<string, number>()
  const tabRank = new Map<number, number>()
  for (const r of list) if (!tabRank.has(r.tabOrder)) tabRank.set(r.tabOrder, tabRank.size + 1)

  const placed = list.map((r) => {
    const series = toSeries(r)
    const lower = series.slots.some((x) => x.team !== null && (losses.get(x.team) ?? 0) > 0)
    let column = tabRank.get(r.tabOrder) ?? 1
    for (const x of series.slots) {
      const from = x.team !== null ? (last.get(x.team) ?? null) : null
      x.from = from && { seriesId: from.seriesId, as: from.as }
      if (from) column = Math.max(column, from.column + 1)
    }
    series.lane = lower ? 'lower' : 'upper'
    for (const x of series.slots) {
      if (x.team === null) continue
      const as = !series.played ? null : x.won ? 'won' : 'lost'
      last.set(x.team, { seriesId: series.seriesId, as, column })
      if (as === 'lost') losses.set(x.team, (losses.get(x.team) ?? 0) + 1)
    }
    return { series, column, tab: roundName(r.tab) }
  })

  const columns = [...new Set(placed.map((p) => p.column))].sort((a, b) => a - b)
  const double = placed.some((p) => p.series.lane === 'lower')
  const rounds = columns.map((column, i) => {
    const items = placed.filter((p) => p.column === column)
    const tabs = new Set(items.map((p) => p.tab))
    // a column of a double-elimination bracket mixes tabs, so those are just numbered; a single-elimination one keeps its tab's name
    const name = double || tabs.size > 1 ? `Round ${i + 1}` : [...tabs][0]
    return { name, order: column, series: items.map((p) => p.series) }
  })
  const finalRound = rounds[rounds.length - 1]
  if (finalRound?.series.length === 1) {
    finalRound.series[0].lane = 'final'
    if (double) finalRound.name = 'Finals'
  }
  return rounds
}

export async function loadStages(pool: pg.Pool, tournamentId: number, tournamentName: string): Promise<Stage[]> {
  const { rows } = await pool.query<StageSeriesRow>(
    `SELECT s.id AS "seriesId", s.stage_tab AS tab, s.stage_order AS "tabOrder", s.stage_match AS n,
            t1.name AS team1, t2.name AS team2, t1.region AS region1, t2.region AS region2,
            w.name AS winner, s.score, s.best_of AS "bestOf", s.scheduled_at AS at
     FROM series s
     LEFT JOIN team t1 ON t1.id = s.team1_id LEFT JOIN team t2 ON t2.id = s.team2_id LEFT JOIN team w ON w.id = s.winner_id
     WHERE s.tournament_id = $1 AND s.stage_tab IS NOT NULL AND s.stage_order IS NOT NULL`,
    [tournamentId],
  )
  return buildStages(rows, tournamentName)
}
