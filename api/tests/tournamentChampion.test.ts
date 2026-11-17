import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * "Worlds 2026" = Play-In (stored as a Qualifier) + Main Event, both international. 7 games:
 *   Play-In: 2 games, Charlie (mid "C Mid") beats Delta ("D Mid") both times. Charlie plays Azir, Delta plays Ahri.
 *   Main:    5 games, Alpha ("A Mid", Azir) beats Bravo ("B Mid", Zed) in every game; Alpha bans Ahri in game 1.
 * So Azir: 7 picks, 7 wins, no bans, in all 7 games, by two players. Ahri: 2 picks (0 wins), 1 ban, in 3 games.
 * Zed: 5 picks, 0 wins. Lux is only banned (once, a play-in game). Nami exists but never appears.
 * "Worlds 2027" has a scheduled series and no games.
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
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [A, B, C, D] = [await team('Alpha'), await team('Bravo'), await team('Charlie'), await team('Delta')]
  const mid: Record<number, number> = {}
  for (const [id, name] of [[A, 'A Mid'], [B, 'B Mid'], [C, 'C Mid'], [D, 'D Mid']] as const) {
    mid[id] = await one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  }
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, ahri, zed, lux] = [await champ('Azir'), await champ('Ahri'), await champ('Zed'), await champ('Lux')]
  await champ('Nami')
  const pick: Record<number, number> = { [A]: azir, [B]: zed, [C]: azir, [D]: ahri }

  const tour = (page: string, name: string, year: number, stage: string, start: Date, end: Date) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$2,$3,'Summer',$4,true,$5,$6) RETURNING id`,
      [page, name, year, stage, dateOnly(start), dateOnly(end)],
    )
  ids.playIn = await tour('2026 Season World Championship/Play-In', 'Worlds 2026 Play-In', 2026, 'Qualifier', day(-30), day(-28))
  ids.main = await tour('2026 Season World Championship/Main Event', 'Worlds 2026', 2026, 'Regular season', day(-20), day(-1))
  ids.next = await tour('2027 Season World Championship/Main Event', 'Worlds 2027', 2027, 'Regular season', day(20), day(30))

  const series = (tournament: number, t1: number, t2: number, winner: number | null, score: string | null, at: Date) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,3,$6,$7) RETURNING id`,
      [tournament, t1, t2, winner, score, `S${++n}`, at.toISOString()],
    )
  const play = async (tournament: number, win: number, lose: number, games: number, at: Date, bans: [number, number][] = []) => {
    const s = await series(tournament, win, lose, win, `${games}-0`, at)
    for (let i = 0; i < games; i++) {
      const when = new Date(at.getTime() + i * 3600000)
      const g = await one(
        `INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec) VALUES ($1,$2,$3,'26.9',$4,1800) RETURNING id`,
        [`G${++n}`, s, tournament, when.toISOString()],
      )
      await pool.query(`INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,'blue',true,10), ($1,$3,'red',false,8)`, [g, win, lose])
      for (const [teamId, side, w] of [[win, 'blue', true], [lose, 'red', false]] as const) {
        await pool.query(
          `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists) VALUES ($1,$2,$3,$4,'Mid',$5,$6,3,1,5)`,
          [g, mid[teamId], teamId, pick[teamId], side, w],
        )
      }
      if (i === 0) {
        for (const [teamId, championId] of bans) {
          await pool.query(`INSERT INTO game_ban (game_id, team_id, champion_id, draft_order) VALUES ($1,$2,$3,1)`, [g, teamId, championId])
        }
      }
    }
  }
  await play(ids.playIn, C, D, 2, day(-29), [[C, lux]])
  await play(ids.main, A, B, 5, day(-15), [[A, ahri]])
  await series(ids.next, A, B, null, null, day(21))
})

afterAll(() => pool.end())

const detail = (event: number, name: string) => api(`/api/tournaments/${event}/champions/${encodeURIComponent(name)}`)

describe('GET /api/tournaments/:id/champions/:name', () => {
  it('counts the play-in as part of the event, from either id', async () => {
    for (const id of [ids.main, ids.playIn]) {
      const { body, status } = await detail(id, 'Azir')
      expect(status).toBe(200)
      expect(body.champion.name).toBe('Azir')
      expect(body.summary).toMatchObject({ eventGames: 7, presentGames: 7, picks: 7, wins: 7, losses: 0, bans: 0, underMinSample: false })
      expect(body.summary.presence).toBeCloseTo(1)
      expect(body.summary.winRate).toBeCloseTo(1)
    }
  })

  it("gives the same counts as the champion's row in the event list", async () => {
    const list = (await api(`/api/tournaments/${ids.main}/champions`)).body.champions
    expect(list).toHaveLength(4)
    for (const row of list) {
      const { summary } = (await detail(ids.main, row.champion)).body
      expect(summary).toMatchObject({ picks: row.picks, wins: row.wins, bans: row.bans })
      expect(summary.presence).toBeCloseTo(row.presence)
    }
  })

  it('lists who played it, most games first, with a small-sample flag', async () => {
    const { players } = (await detail(ids.main, 'Azir')).body
    expect(players.map((p: { name: string }) => p.name)).toEqual(['A Mid', 'C Mid'])
    expect(players[0]).toMatchObject({ team: 'Alpha', role: 'Mid', games: 5, wins: 5, underMinSample: false })
    expect(players[0].kda).toBeCloseTo(8) // (3 + 5) / 1
    expect(players[1]).toMatchObject({ team: 'Charlie', games: 2, underMinSample: true })
  })

  it('flags a losing champion under the minimum sample and a banned-only one with no picks', async () => {
    const ahri = (await detail(ids.main, 'Ahri')).body.summary
    expect(ahri).toMatchObject({ picks: 2, wins: 0, bans: 1, presentGames: 3, underMinSample: true })
    const lux = (await detail(ids.main, 'Lux')).body
    expect(lux.empty).toBe(false)
    expect(lux.summary).toMatchObject({ picks: 0, wins: 0, bans: 1, winRate: null, underMinSample: true })
    expect(lux.players).toEqual([])
  })

  it('resolves the name in another letter case', async () => {
    expect((await detail(ids.main, 'azir')).body.champion.name).toBe('Azir')
  })

  it('answers empty for a champion that did not appear, and for an event with no games', async () => {
    const absent = await detail(ids.main, 'Nami')
    expect(absent.status).toBe(200)
    expect(absent.body).toMatchObject({ empty: true, summary: null, players: [] })
    const none = await detail(ids.next, 'Azir')
    expect(none.status).toBe(200)
    expect(none.body).toMatchObject({ empty: true, summary: null, players: [] })
  })

  it('404s for an unknown champion or event', async () => {
    expect((await detail(ids.main, 'Nobody')).status).toBe(404)
    expect((await detail(999999, 'Azir')).status).toBe(404)
  })
})

describe('GET /api/tournaments/:id/champions', () => {
  it("still lists the event's champions by presence", async () => {
    const { champions } = (await api(`/api/tournaments/${ids.main}/champions`)).body
    expect(champions.map((c: { champion: string }) => c.champion)).toEqual(['Azir', 'Zed', 'Ahri', 'Lux'])
  })
})
