import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * LCK: "Spring" playoffs finished long ago (Alpha beat Bravo in the final), "Summer" is running (today is inside
 * its dates; Bravo has two series wins, Alpha one), and a Summer Promotion qualifier that must never be listed.
 * Players: Norvik (Alpha, Mid), Nori (Bravo, Support, plays after Norvik), and "Zed" who is only found via an alias.
 * Champions: Nocturne (played Jungle), Nautilus.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [alpha, bravo] = [await team('Northwind Esports'), await team('Nordlys')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [norvik, nori, zed] = [await player('Norvik'), await player('Nori'), await player('Zed')]
  await pool.query(`INSERT INTO player_alias (old_name, player_id) VALUES ('Shadow Reaper', $1)`, [zed])
  const nocturne = await one(`INSERT INTO champion (name) VALUES ('Nocturne') RETURNING id`)
  await one(`INSERT INTO champion (name) VALUES ('Nautilus') RETURNING id`)

  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
  const tour = (name: string, stage: string, start: string, end: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,2026,'Spring',$3,false,$4,$5) RETURNING id`,
      [name, lck, stage, start, end],
    )
  const spring = await tour('LCK 2026 Spring Playoffs', 'Playoffs', day(-200), day(-150))
  const summer = await tour('LCK 2026 Summer', 'Regular season', day(-30), day(30))
  const promo = await tour('LCK 2026 Summer Promotion', 'Qualifier', day(-100), day(-90))

  const game = async (tournament: number, winner: number, loser: number, daysAgo: number, role?: [number, number, string, number]) => {
    const series = await one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, leaguepedia_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [tournament, winner, loser, winner, `S${++n}`],
    )
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, series_id, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`,
      [`H${n}`, tournament, series, new Date(Date.now() - daysAgo * 86400000).toISOString()],
    )
    for (const [teamId, side, win] of [[winner, 'blue', true], [loser, 'red', false]] as const) {
      await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,$3,$4)`, [g, teamId, side, win])
    }
    if (role) {
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,$5,'blue',true)`,
        [g, role[0], role[1], role[3], role[2]],
      )
    }
  }
  await game(spring, alpha, bravo, 160)
  await game(summer, bravo, alpha, 10, [nori, bravo, 'Support', nocturne])
  await game(summer, bravo, alpha, 9)
  await game(summer, alpha, bravo, 8, [norvik, alpha, 'Mid', nocturne])
  await game(promo, alpha, bravo, 95)
})

afterAll(() => pool.end())

describe('GET /api/search', () => {
  it('returns matches grouped by type, with prefix matches first', async () => {
    const { body, status } = await api('/api/search?q=nor')
    expect(status).toBe(200)
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Nori', 'Norvik'])
    expect(body.players[1]).toMatchObject({ page: 'Norvik', role: 'Mid', team: 'Northwind Esports' })
    expect(body.teams.map((t: { name: string }) => t.name)).toEqual(['Nordlys', 'Northwind Esports'])
    expect(body.teams[0].league).toBe('LCK')
    expect(body.champions).toEqual([])
    expect(body.tournaments).toEqual([])
  })

  it('finds champions with their most played role, and tournaments with their status', async () => {
    const champs = await api('/api/search?q=noc')
    expect(champs.body.champions).toEqual([{ name: 'Nocturne', role: expect.stringMatching(/Support|Mid/) }])
    const tours = await api('/api/search?q=summer')
    expect(tours.body.tournaments.map((t: { name: string; status: string }) => [t.name, t.status])).toEqual([
      ['LCK 2026 Summer', 'In progress'],
      ['LCK 2026 Summer Promotion', 'Completed'],
    ])
  })

  it('matches a player through an old name', async () => {
    const { body } = await api('/api/search?q=shadow')
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Zed'])
  })

  it('is case-insensitive, treats % and _ literally, and ignores very short queries', async () => {
    expect((await api('/api/search?q=NORV')).body.players).toHaveLength(1)
    expect((await api('/api/search?q=%25%25')).body.players).toEqual([])
    const short = await api('/api/search?q=n')
    expect(short.body).toEqual({ players: [], teams: [], champions: [], tournaments: [] })
  })
})

describe('GET /api/tournaments/recent', () => {
  it('lists newest first, skips qualifiers, and tags running events', async () => {
    const { body } = await api('/api/tournaments/recent')
    expect(body.tournaments.map((t: { name: string }) => t.name)).toEqual(['LCK 2026 Summer', 'LCK 2026 Spring Playoffs'])
    expect(body.tournaments[0]).toMatchObject({ league: 'LCK', status: 'In progress', standingLabel: 'Leading', standingTeam: 'Nordlys' })
    expect(body.tournaments[1]).toMatchObject({ status: 'Completed', standingLabel: 'Champion', standingTeam: 'Northwind Esports' })
    expect(body.tournaments[1].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('honours the limit', async () => {
    const { body } = await api('/api/tournaments/recent?limit=1')
    expect(body.tournaments).toHaveLength(1)
  })
})
