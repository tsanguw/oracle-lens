import { describe, expect, it } from 'vitest'
import { buildStages, tabKind, type StageSeriesRow } from '../src/stages.js'

let id = 0
const row = (tab: string, tabOrder: number, n: number, team1: string, team2: string, winner: 1 | 2 | null, score = '3-1'): StageSeriesRow => ({
  seriesId: ++id,
  tab,
  tabOrder,
  n,
  team1,
  team2,
  region1: 'Korea',
  region2: 'China',
  winner: winner === null ? null : winner === 1 ? team1 : team2,
  score: winner === null ? null : score,
  bestOf: 5,
  at: null,
})

describe('tabKind', () => {
  it('sorts rounds into stages by their names', () => {
    const ctx = { playoffs: false, swissLike: false }
    expect(tabKind('Play-In Day 2', ctx)).toBe('playin')
    expect(tabKind('Swiss Round 3', ctx)).toBe('swiss')
    expect(tabKind('Week 4', ctx)).toBe('groups')
    expect(tabKind('Quarterfinals', ctx)).toBe('knockout')
    expect(tabKind('Bracket Round 2', ctx)).toBe('knockout')
    expect(tabKind('Finals', ctx)).toBe('knockout')
  })

  it('reads a plain "Round N" by what the event is', () => {
    expect(tabKind('Round 2', { playoffs: true, swissLike: false })).toBe('knockout')
    expect(tabKind('Round 2', { playoffs: false, swissLike: true })).toBe('swiss')
    expect(tabKind('Round 2', { playoffs: false, swissLike: false })).toBe('groups')
  })
})

describe('buildStages', () => {
  it('splits a Worlds-style event into swiss rounds and a single-elimination knockout', () => {
    const rows = [
      row('Round 1', 1, 1, 'T1', 'G2', 1),
      row('Round 1', 1, 2, 'BLG', 'HLE', 2),
      row('Quarterfinals', 2, 1, 'T1', 'BLG', 1),
      row('Quarterfinals', 2, 2, 'HLE', 'G2', 1),
      row('Semifinals', 3, 1, 'T1', 'HLE', 1),
      row('Finals', 4, 1, 'T1', 'KT', 1),
    ]
    const stages = buildStages(rows, '2025 Season World Championship Main Event')
    expect(stages.map((s) => [s.key, s.label, s.rounds.map((r) => r.name)])).toEqual([
      ['swiss', 'Swiss', ['Round 1']],
      ['knockout', 'Knockout', ['Quarterfinals', 'Semifinals', 'Finals']],
    ])
  })

  it('links every team to the series it came from and marks the last single series as the final', () => {
    const qf1 = row('Quarterfinals', 1, 1, 'T1', 'AL', 1)
    const qf2 = row('Quarterfinals', 1, 2, 'G2', 'TES', 2)
    const sf = row('Semifinals', 2, 1, 'T1', 'TES', 1)
    const fin = row('Finals', 3, 1, 'T1', 'KT', 1)
    const knockout = buildStages([fin, sf, qf2, qf1], 'Worlds').find((s) => s.key === 'knockout')!
    const [r1, r2, r3] = knockout.rounds
    expect(r1.series.map((s) => s.seriesId)).toEqual([qf1.seriesId, qf2.seriesId])
    expect(r2.series[0].slots.map((x) => x.from)).toEqual([
      { seriesId: qf1.seriesId, as: 'won' },
      { seriesId: qf2.seriesId, as: 'won' },
    ])
    expect(r3.series[0].lane).toBe('final')
    expect(r1.series[0].slots[0]).toMatchObject({ team: 'T1', score: 3, won: true, from: null })
    expect(r1.series[0].slots[1]).toMatchObject({ team: 'AL', score: 1, won: false })
  })

  it('lays out a double-elimination bracket by what feeds what, not by tab, with dropped teams linked as losers', () => {
    // upper round 1 and the lower series it feeds share a tab, as on Leaguepedia's MSI page
    const u1 = row('Bracket Round 1', 1, 1, 'A', 'B', 1)
    const u2 = row('Bracket Round 1', 1, 2, 'C', 'D', 1)
    const l1 = row('Bracket Round 1', 1, 3, 'B', 'D', 1)
    const u3 = row('Bracket Round 2', 2, 1, 'A', 'C', 1)
    const l2 = row('Bracket Round 2', 2, 2, 'B', 'C', 2)
    const fin = row('Finals', 3, 1, 'A', 'C', 1)
    const knockout = buildStages([u1, u2, l1, u3, l2, fin], 'MSI 2026').find((s) => s.key === 'knockout')!

    expect(knockout.rounds.map((r) => r.series.map((s) => [s.seriesId, s.lane]))).toEqual([
      [[u1.seriesId, 'upper'], [u2.seriesId, 'upper']],
      [[l1.seriesId, 'lower'], [u3.seriesId, 'upper']],
      [[l2.seriesId, 'lower']],
      [[fin.seriesId, 'final']],
    ])
    expect(knockout.rounds[0].name).toBe('Round 1')
    expect(knockout.rounds[1].name).toBe('Round 2')
    const lowerFinal = knockout.rounds[2].series[0]
    expect(lowerFinal.slots.map((x) => x.from)).toEqual([
      { seriesId: l1.seriesId, as: 'won' },
      { seriesId: u3.seriesId, as: 'lost' },
    ])
    const grandFinal = knockout.rounds[3].series[0]
    expect(grandFinal.slots.map((x) => x.from)).toEqual([
      { seriesId: u3.seriesId, as: 'won' },
      { seriesId: l2.seriesId, as: 'won' },
    ])
  })

  it('keeps unplayed series in, with no winner and no result links', () => {
    const rows = [row('Quarterfinals', 1, 1, 'A', 'B', null), row('Semifinals', 2, 1, 'A', 'C', null)]
    const knockout = buildStages(rows, 'Worlds')[0]
    expect(knockout.rounds[0].series[0].played).toBe(false)
    expect(knockout.rounds[1].series[0].slots[0].from).toEqual({ seriesId: rows[0].seriesId, as: null })
  })

  it('returns nothing for an event with no round data', () => {
    expect(buildStages([], 'LCK 2026 Summer')).toEqual([])
  })
})
