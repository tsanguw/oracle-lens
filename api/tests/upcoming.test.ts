import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * LCK 2026, teams Alpha, Bravo and Charlie:
 *  "LCK 2026 Winter" is running (one game, Alpha beat Bravo).
 *  "LCK 2026 Winter Playoffs" starts in 5 days and has no games: Alpha v Bravo and Bravo v Charlie are scheduled as
 *  semifinals, and the final is TBD (no teams, no date). Its split is "Finals", which no event with games has.
 *  "LCK 2026 Winter Showmatch" ended long ago without a game, so it is never listed.
 * Internationals:
 *  "Worlds 2026 Play-In" finished with one game (Alpha beat Charlie); its "Worlds 2026" Main Event starts in 3 days and
 *  has only a scheduled series, so the two make one running event whose main event has no result yet.
 *  "MSI 2026 Play-In" finished on its own (no main event loaded): Alpha won two series, then Bravo won the last one.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000)
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)
let n = 0
const ids: Record<string, number> = {}

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [A, B, C] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const tour = (lpName: string, name: string, stage: string, intl: boolean, split: string | null, start: number, end: number) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$2,$3,2026,$4,$5,$6,$7,$8) RETURNING id`,
      [lpName, name, intl ? null : lck, split, stage, intl, dateOnly(day(start)), dateOnly(day(end))],
    )
  ids.running = await tour('LCK/2026 Season/Winter', 'LCK 2026 Winter', 'Regular season', false, 'Winter', -10, 10)
  ids.upcoming = await tour('LCK/2026 Season/Winter Playoffs', 'LCK 2026 Winter Playoffs', 'Playoffs', false, 'Finals', 5, 20)
  ids.showmatch = await tour('LCK/2026 Season/Winter Showmatch', 'LCK 2026 Winter Showmatch', 'Regular season', false, 'Winter', -40, -38)
  ids.worldsPlayIn = await tour('2026 Season World Championship/Play-In', 'Worlds 2026 Play-In', 'Qualifier', true, null, -7, -4)
  ids.worlds = await tour('2026 Season World Championship/Main Event', 'Worlds 2026', 'Regular season', true, null, 3, 25)
  ids.msiPlayIn = await tour('2026 Mid-Season Invitational/Play-In', 'MSI 2026 Play-In', 'Qualifier', true, null, -60, -55)

  const series = (
    tournament: number,
    t1: number | null,
    t2: number | null,
    winner: number | null,
    at: Date | null,
    stage?: [string, number, number],
  ) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at, stage_tab, stage_order, stage_match)
       VALUES ($1,$2,$3,$4,$5,5,$6,$7,$8,$9,$10) RETURNING id`,
      [tournament, t1, t2, winner, winner ? '1-0' : null, `S${++n}`, at?.toISOString() ?? null, ...(stage ?? [null, null, null])],
    )
  const played = async (tournament: number, winner: number, loser: number, daysAgo: number, stage?: [string, number, number]) => {
    const s = await series(tournament, winner, loser, winner, day(-daysAgo), stage)
    const g = await one(
      `INSERT INTO game (leaguepedia_id, series_id, tournament_id, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`,
      [`G${++n}`, s, tournament, day(-daysAgo).toISOString()],
    )
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true), ($1,$3,'red',false)`, [g, winner, loser])
  }

  await played(ids.running, A, B, 5)
  await series(ids.upcoming, A, B, null, day(6), ['Semifinals', 1, 1])
  await series(ids.upcoming, B, C, null, day(7), ['Semifinals', 1, 2])
  await series(ids.upcoming, null, null, null, null, ['Finals', 2, 1])
  await played(ids.worldsPlayIn, A, C, 6, ['Play-In Round 1', 1, 1])
  await series(ids.worlds, A, B, null, day(4), ['Round 1', 1, 1])
  await played(ids.msiPlayIn, A, B, 59)
  await played(ids.msiPlayIn, A, C, 58)
  await played(ids.msiPlayIn, B, A, 56)
})

afterAll(() => pool.end())

describe('an event that has not started', () => {
  it('has status Upcoming, and an empty summary because it has no games', async () => {
    const { body, status } = await api(`/api/tournaments/${ids.upcoming}`)
    expect(status).toBe(200)
    expect(body.tournament).toMatchObject({ name: 'LCK 2026 Winter Playoffs', status: 'Upcoming', startDate: dateOnly(day(5)) })
    expect(body.empty).toBe(true)
    expect(body.summary).toBeNull()
  })

  it('serves its schedule: dated series as upcoming matches, and every series in the bracket', async () => {
    const matches = (await api(`/api/tournaments/${ids.upcoming}/matches`)).body
    expect(matches.results).toEqual([])
    expect(matches.upcoming.map((s: { team1: string; team2: string }) => `${s.team1} v ${s.team2}`)).toEqual(['Alpha v Bravo', 'Bravo v Charlie'])
    const stages = (await api(`/api/tournaments/${ids.upcoming}/stages`)).body
    expect(stages.empty).toBe(false)
    // the bracket names rounds by its own rules; what matters is that unplayed series, the TBD final too, are in it
    const rounds: { series: unknown[] }[] = stages.stages.flatMap((s: { rounds: { series: unknown[] }[] }) => s.rounds)
    expect(rounds.reduce((sum, r) => sum + r.series.length, 0)).toBe(3)
    const context = (await api(`/api/tournaments/${ids.upcoming}/context`)).body
    expect(context.teams).toEqual([])
    expect(context.upcoming).toHaveLength(2)
  })

  it('keeps the earlier statuses for running and finished events', async () => {
    expect((await api(`/api/tournaments/${ids.running}`)).body.tournament.status).toBe('In progress')
    expect((await api(`/api/tournaments/${ids.msiPlayIn}`)).body.tournament.status).toBe('Completed')
  })
})

describe('a competition whose main event has no result yet', () => {
  it('is running, counts its play-in games, and names no leader until the main event has a result', async () => {
    const { body } = await api(`/api/tournaments/${ids.worlds}`)
    expect(body.tournament).toMatchObject({ name: 'Worlds 2026', status: 'In progress', startDate: dateOnly(day(-7)) })
    expect(body.summary).toMatchObject({ games: 1, standingLabel: 'Leading', standingTeam: null })
  })
})

describe('where an event with no games is listed', () => {
  type Row = { name: string; status: string; games?: number; standingTeam?: string | null }
  const names = (rows: Row[]) => rows.map((r) => r.name)

  it('lists it in the tournaments list until it ends, newest start first, and filters by Upcoming', async () => {
    const { body } = await api('/api/tournaments')
    expect(names(body.rows)).toEqual(['LCK 2026 Winter Playoffs', 'Worlds 2026', 'LCK 2026 Winter'])
    expect(body.rows[0]).toMatchObject({ status: 'Upcoming', games: 0, standingTeam: null })
    const upcoming = (await api('/api/tournaments?status=Upcoming')).body
    expect(names(upcoming.rows)).toEqual(['LCK 2026 Winter Playoffs'])
  })

  it('finds it in search with its status, but not a past event that never had a game', async () => {
    const { body } = await api('/api/search?q=winter')
    expect(body.tournaments.map((t: Row) => [t.name, t.status])).toEqual([
      ['LCK 2026 Winter Playoffs', 'Upcoming'],
      ['LCK 2026 Winter', 'In progress'],
    ])
  })

  it('shows it among the related events of the same league and year, without the past event that had no games', async () => {
    const { body } = await api(`/api/tournaments/${ids.running}/context`)
    expect(names(body.related)).toEqual(['LCK 2026 Winter Playoffs'])
  })

  it('keeps it out of Recent tournaments and out of the stat filter options', async () => {
    const recent = (await api('/api/tournaments/recent?limit=20')).body
    expect(names(recent.tournaments)).not.toContain('LCK 2026 Winter Playoffs')
    const filters = (await api('/api/filters')).body
    expect(filters.combos.map((c: { split: string | null }) => c.split)).not.toContain('Finals')
  })
})

describe('a finished play-in', () => {
  // Bravo won the last series, so a "Champion" rule would name Bravo; a play-in has no champion.
  it('credits the team with the most series wins as top record on the tournaments list', async () => {
    const { body } = await api('/api/tournaments?stage=Qualifier')
    expect(body.rows.find((r: { name: string }) => r.name === 'MSI 2026 Play-In')).toMatchObject({
      status: 'Completed',
      standingLabel: 'Top record',
      standingTeam: 'Alpha',
    })
  })

  it('credits the same team as top record on its tournament page', async () => {
    const { body } = await api(`/api/tournaments/${ids.msiPlayIn}`)
    expect(body.summary).toMatchObject({ standingLabel: 'Top record', standingTeam: 'Alpha' })
  })
})

describe('Recent tournaments for a competition whose main event has no result yet', () => {
  it('lists it once under its own name, from its play-in games, with no standing label and no team', async () => {
    const { body } = await api('/api/tournaments/recent')
    const worlds = body.tournaments.filter((t: { name: string }) => t.name.startsWith('Worlds 2026'))
    expect(worlds).toEqual([expect.objectContaining({ name: 'Worlds 2026', status: 'In progress', standingLabel: null, standingTeam: null })])
  })
})

describe('the address a play-in had before its main event was loaded', () => {
  it('opens the competition, whose slug the page then redirects to', async () => {
    const { body, status } = await api('/api/tournaments/worlds-2026-play-in')
    expect(status).toBe(200)
    expect(body.tournament).toMatchObject({ id: ids.worlds, name: 'Worlds 2026', slug: 'worlds-2026' })
    // the play-in's sub-pages follow it too
    expect((await api('/api/tournaments/WORLDS-2026-PLAY-IN/matches')).status).toBe(200)
  })

  it('still opens a play-in that stands on its own at its own address, and 404s for a slug nothing has', async () => {
    expect((await api('/api/tournaments/msi-2026-play-in')).body.tournament).toMatchObject({ id: ids.msiPlayIn, slug: 'msi-2026-play-in' })
    expect((await api('/api/tournaments/worlds-2027-play-in')).status).toBe(404)
  })
})

describe('the stages of a competition whose main event has not played yet', () => {
  it("open on the play-in, whose records are its own, while the main event's stage has no record yet", async () => {
    const { body } = await api(`/api/tournaments/${ids.worlds}/stages`)
    expect(body.stages.map((s: { key: string }) => s.key)).toEqual(['playin', 'groups'])
    expect(body.defaultKey).toBe('playin')
    const [playIn, groups] = body.stages
    expect(playIn.records.map((r: { team: string; seriesWins: number }) => [r.team, r.seriesWins])).toEqual([['Alpha', 1], ['Charlie', 0]])
    expect(groups.records).toEqual([])
  })

  it('lead the related-info strip with the play-in leaders rather than nothing', async () => {
    const { body } = await api(`/api/tournaments/${ids.worlds}/context`)
    expect(body.teams.map((t: { team: string }) => t.team)).toEqual(['Alpha', 'Charlie'])
  })
})
