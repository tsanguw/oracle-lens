import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * LCK 2026 Summer: Alpha beats Bravo in 5 games and loses 1, and beats Charlie in 2 (8 games). The running Playoffs add
 * one Alpha win over Bravo, so the default range has 9 games: Alpha 9 (8 wins), Bravo 7 (1 win), and Charlie 2
 * (under the 5-game minimum, so never ranked). Every game: Alpha-side kills 12 vs 8, 12000 gold
 * vs 10000 for the winner's side, 1800s, 5 towers vs 2. Alpha's Mid plays Azir in all 9 of its games, Bravo's Mid Ahri in 7,
 * Charlie's Mid Zed in 2. Bravo bans Azir in 3 games, Alpha bans Zed in 1 game (one Charlie never played).
 *
 * Events: "LCK 2026 Summer" (regular season, completed), "LCK 2026 Summer Playoffs" (Playoffs, running now),
 * "LCK 2026 Summer Promotion" (Qualifier), "Worlds 2025 Main Event" (international, 2025).
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000)
const iso = (d: Date) => d.toISOString()
const dateOnly = (d: Date) => iso(d).slice(0, 10)
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [A, B, C] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [pa, pb, pc] = [await player('Ann Mid'), await player('Bob Mid'), await player('Cy Mid')]
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, ahri, zed] = [await champ('Azir'), await champ('Ahri'), await champ('Zed')]
  const tour = (name: string, stage: string, year: number, intl: boolean, leagueId: number | null, start: Date, end: Date) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,$3,'Summer',$4,$5,$6,$7) RETURNING id`,
      [name, leagueId, year, stage, intl, dateOnly(start), dateOnly(end)],
    )
  const summer = await tour('LCK 2026 Summer', 'Regular season', 2026, false, lck, day(-60), day(-30))
  const playoffs = await tour('LCK 2026 Summer Playoffs', 'Playoffs', 2026, false, lck, day(-5), day(5))
  const promo = await tour('LCK 2026 Summer Promotion', 'Qualifier', 2026, false, lck, day(-3), day(3))
  const worlds = await tour('Worlds 2025 Main Event', 'Playoffs', 2025, true, null, new Date('2025-10-15'), new Date('2025-11-09'))

  const mids: Record<number, [number, number]> = { [A]: [pa, azir], [B]: [pb, ahri], [C]: [pc, zed] }
  const game = async (tournament: number, at: Date, win: number, lose: number, bans: [number, number][] = [], seriesId: number | null = null) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec) VALUES ($1,$2,$3,'26.10',$4,1800) RETURNING id`,
      [`L${++n}`, seriesId, tournament, iso(at)],
    )
    await pool.query(
      `INSERT INTO team_game (game_id, team_id, side, win, kills, gold, towers) VALUES ($1,$2,'blue',true,12,12000,5), ($1,$3,'red',false,8,10000,2)`,
      [g, win, lose],
    )
    for (const [teamId, side, w] of [[win, 'blue', true], [lose, 'red', false]] as const) {
      const [pid, cid] = mids[teamId]
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists)
         VALUES ($1,$2,$3,$4,'Mid',$5,$6,3,1,5)`,
        [g, pid, teamId, cid, side, w],
      )
    }
    for (const [teamId, championId] of bans) {
      await pool.query(`INSERT INTO pick_ban (game_id, team_id, champion_id, action, draft_order) VALUES ($1,$2,$3,'ban',1)`, [g, teamId, championId])
    }
  }
  for (let i = 0; i < 5; i++) await game(summer, day(-50 + i), A, B, i < 3 ? [[B, azir]] : [])
  await game(summer, day(-44), B, A, [[A, zed]])
  for (let i = 0; i < 2; i++) await game(summer, day(-40 + i), A, C)

  const s = await one(
    `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, leaguepedia_id, scheduled_at) VALUES ($1,$2,$3,$2,'1-0',$4,$5) RETURNING id`,
    [playoffs, A, B, 'PS1', iso(day(-2))],
  )
  await game(playoffs, day(-2), A, B, [], s)
  await game(promo, day(-1), A, B)
  await game(worlds, new Date('2025-10-20'), B, A)
})

afterAll(() => pool.end())

describe('GET /api/teams', () => {
  it('ranks teams over the default range by win rate and leaves out teams under the minimum', async () => {
    const { body, status } = await api('/api/teams')
    expect(status).toBe(200)
    expect(body.minGames).toBe(5)
    expect(body.range.isDefault).toBe(true)
    // Summer + Playoffs are the latest LCK split; Worlds 2025 is outside the window and the qualifier is excluded.
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Alpha', 'Bravo'])
    expect(body.rows[1]).toMatchObject({ games: 7, wins: 1 })
    expect(body.rows[0]).toMatchObject({ rank: 1, name: 'Alpha', league: 'LCK', games: 9, wins: 8, losses: 1 })
    expect(body.rows[0].winRate).toBeCloseTo(8 / 9)
    expect(body.rows[0].goldDiff).toBeCloseTo((8 * 2000 - 2000) / 9)
    expect(body.rows[0].killsPerGame).toBeCloseTo((8 * 12 + 8) / 9)
    expect(body.rows[0].towersPerGame).toBeCloseTo((8 * 5 + 2) / 9)
    expect(body.rows[0].avgGameLengthSec).toBeCloseTo(1800)
  })

  it('sorts either way, searches by name and pages', async () => {
    const asc = await api('/api/teams?sort=games&dir=asc')
    expect(asc.body.rows.map((r: { name: string }) => r.name)).toEqual(['Bravo', 'Alpha']) // 7 games, then 9
    const q = await api('/api/teams?q=brav')
    expect(q.body.rows.map((r: { name: string }) => r.name)).toEqual(['Bravo'])
    expect((await api('/api/teams?q=%25')).body.empty).toBe(true)
    const page2 = await api('/api/teams?pageSize=1&page=2')
    expect(page2.body.rows[0]).toMatchObject({ rank: 2, name: 'Bravo' })
    expect(page2.body.total).toBe(2)
  })

  it('explicit filters replace the default range, and a bad sort is rejected', async () => {
    const intl = await api('/api/teams?year=2025')
    expect(intl.body.rows).toEqual([]) // one game each: under the minimum
    expect((await api('/api/teams?sort=name')).status).toBe(400)
  })
})

describe('GET /api/champions', () => {
  it('lists champions with pick, ban and presence rates over every game in the range', async () => {
    const { body } = await api('/api/champions')
    const byName = Object.fromEntries(body.rows.map((r: { name: string }) => [r.name, r]))
    // 8 Summer games + 1 Playoffs game = 9 in the range (the qualifier is out).
    expect(byName.Azir).toMatchObject({ games: 9, wins: 8, role: 'Mid', underMinSample: false })
    expect(byName.Azir.pickRate).toBeCloseTo(1)
    expect(byName.Azir.banRate).toBeCloseTo(3 / 9)
    expect(byName.Azir.presence).toBeCloseTo(1)
    expect(byName.Zed).toMatchObject({ games: 2, underMinSample: true })
    expect(byName.Zed.banRate).toBeCloseTo(1 / 9)
    expect(byName.Zed.presence).toBeCloseTo(3 / 9) // picked in 2 games, banned in 1 more
    expect(body.rows[0].name).toBe('Azir') // highest presence first
  })

  it('searches, filters by role, and ranks tiny samples after the rest when sorting by win rate', async () => {
    expect((await api('/api/champions?q=ah')).body.rows.map((r: { name: string }) => r.name)).toEqual(['Ahri'])
    expect((await api('/api/champions?role=Top')).body.empty).toBe(true)
    const byWin = await api('/api/champions?sort=winRate&dir=desc')
    const names = byWin.body.rows.map((r: { name: string }) => r.name)
    expect(names).toEqual(['Azir', 'Ahri', 'Zed']) // Zed is under the minimum, so it ranks last whatever its rate
    const asc = await api('/api/champions?sort=winRate&dir=asc')
    expect(asc.body.rows.every((r: { underMinSample: boolean }, i: number, all: { underMinSample: boolean }[]) => !r.underMinSample || all.slice(i).every((x) => x.underMinSample))).toBe(true)
  })

  it('keeps ban rate champion-level when filtering by role', async () => {
    const { body } = await api('/api/champions?role=Mid')
    const azir = body.rows.find((r: { name: string }) => r.name === 'Azir')
    expect(azir.banRate).toBeCloseTo(3 / 9)
  })
})

describe('GET /api/tournaments', () => {
  it('lists events newest first without qualifiers, with leader or champion', async () => {
    const { body, status } = await api('/api/tournaments')
    expect(status).toBe(200)
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['LCK 2026 Summer Playoffs', 'LCK 2026 Summer', 'Worlds 2025 Main Event'])
    expect(body.rows[0]).toMatchObject({ league: 'LCK', stage: 'Playoffs', status: 'In progress', standingLabel: 'Leading', standingTeam: 'Alpha', games: 1 })
    expect(body.rows[2]).toMatchObject({ league: 'INTL', status: 'Completed', standingLabel: 'Champion' })
    expect(body.total).toBe(3)
  })

  it('filters by league, year, stage and status, and lists qualifiers only on request', async () => {
    const names = async (path: string) => (await api(path)).body.rows.map((r: { name: string }) => r.name)
    expect(await names('/api/tournaments?league=INTL')).toEqual(['Worlds 2025 Main Event'])
    expect(await names('/api/tournaments?league=LCK&year=2026&stage=Playoffs')).toEqual(['LCK 2026 Summer Playoffs'])
    expect(await names('/api/tournaments?status=In%20progress')).toEqual(['LCK 2026 Summer Playoffs'])
    expect(await names('/api/tournaments?stage=Qualifier')).toEqual(['LCK 2026 Summer Promotion'])
    expect(await names('/api/tournaments?year=2025')).toEqual(['Worlds 2025 Main Event'])
  })

  it('searches, sorts by name or date either way and pages', async () => {
    const names = async (path: string) => (await api(path)).body.rows.map((r: { name: string }) => r.name)
    expect(await names('/api/tournaments?q=playoffs')).toEqual(['LCK 2026 Summer Playoffs'])
    expect(await names('/api/tournaments?sort=name&dir=asc')).toEqual(['LCK 2026 Summer', 'LCK 2026 Summer Playoffs', 'Worlds 2025 Main Event'])
    expect((await names('/api/tournaments?dir=asc'))[0]).toBe('Worlds 2025 Main Event')
    const page2 = await api('/api/tournaments?pageSize=2&page=2')
    expect(page2.body.rows.map((r: { name: string }) => r.name)).toEqual(['Worlds 2025 Main Event'])
    expect((await api('/api/tournaments?stage=Nope')).status).toBe(400)
  })

  it('does not shadow the recent and detail routes', async () => {
    expect((await api('/api/tournaments/recent')).status).toBe(200)
    expect((await api('/api/tournaments/999999')).status).toBe(404)
  })
})

describe('player leaderboard search', () => {
  it('filters by a player name', async () => {
    const { body } = await api('/api/leaderboard/players?q=ann&pageSize=5')
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Ann Mid'])
    expect((await api('/api/leaderboard/players?q=zzz')).body.empty).toBe(true)
  })
})
