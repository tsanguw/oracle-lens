import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { shapeSeriesGames } from '../src/seriesGames.js'
import { resetDb } from './resetDb.js'

/*
 * "LCK 2026 Spring" has one series, Alpha v Bravo (2-0), whose games are inserted newest first so the numbering has to
 * come from played_at. Game 1 has a full draft (bans inserted out of slot order, Alpha's Mid pick inserted before its
 * Top); game 2 has team rows only. A second event holds a series the first one must not serve.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const ids: Record<string, number> = {}

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const tour = (name: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,2026,'Spring','Playoffs',false,'2026-02-01','2026-03-01') RETURNING id`,
      [name, lck],
    )
  ids.spring = await tour('LCK 2026 Spring')
  ids.other = await tour('LCK 2026 Rival Cup')
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [alpha, bravo] = [await team('Alpha'), await team('Bravo')]
  const player = (name: string, display: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$2) RETURNING id`, [name, display])
  const [aTop, aMid, bTop, bMid] = [await player('A Top', 'ATop'), await player('A Mid', 'AMid'), await player('B Top', 'BTop'), await player('B Mid', 'BMid')]
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [aatrox, azir, jayce, ahri, zed, lulu, orianna] = [
    await champ('Aatrox'),
    await champ('Azir'),
    await champ('Jayce'),
    await champ('Ahri'),
    await champ('Zed'),
    await champ('Lulu'),
    await champ('Orianna'),
  ]
  const series = (tournament: number, id: string) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at)
       VALUES ($1,$2,$3,$2,'2-0',3,$4,'2026-02-10T10:00:00Z') RETURNING id`,
      [tournament, alpha, bravo, id],
    )
  ids.series = await series(ids.spring, 'SERIES-1')
  ids.foreignSeries = await series(ids.other, 'SERIES-2')

  const game = async (leaguepediaId: string, playedAt: string, patch: string) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec) VALUES ($1,$2,$3,$4,$5,1900) RETURNING id`,
      [leaguepediaId, ids.series, ids.spring, patch, playedAt],
    )
    await pool.query(
      `INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,'blue',true,15), ($1,$3,'red',false,9)`,
      [g, alpha, bravo],
    )
    return g
  }
  // Inserted newest first: G-B is game 1 (played earlier), G-A is game 2.
  ids.game2 = await game('G-A', '2026-02-10T12:00:00Z', '26.4')
  ids.game1 = await game('G-B', '2026-02-10T10:00:00Z', '26.3')

  const pick = (g: number, player: number, team: number, champion: number, role: string, side: string, win: boolean, order: number | null) =>
    pool.query(
      `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, pick_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [g, player, team, champion, role, side, win, order],
    )
  await pick(ids.game1, aMid, alpha, azir, 'Mid', 'blue', true, 1)
  await pick(ids.game1, aTop, alpha, aatrox, 'Top', 'blue', true, 2)
  await pick(ids.game1, bTop, bravo, jayce, 'Top', 'red', false, null)
  await pick(ids.game1, bMid, bravo, ahri, 'Mid', 'red', false, 2)
  const ban = (g: number, team: number, champion: number, slot: number | null) =>
    pool.query(`INSERT INTO game_ban (game_id, team_id, champion_id, draft_order) VALUES ($1,$2,$3,$4)`, [g, team, champion, slot])
  await ban(ids.game1, alpha, zed, 2)
  await ban(ids.game1, alpha, lulu, 1)
  await ban(ids.game1, bravo, orianna, 1)
})

afterAll(() => pool.end())

describe('GET /api/tournaments/:id/series/:seriesId', () => {
  const get = (tournament: number, series: number | string) => api(`/api/tournaments/${tournament}/series/${series}`)

  it('returns the series with its games numbered in the order they were played', async () => {
    const { body, status } = await get(ids.spring, ids.series)
    expect(status).toBe(200)
    expect(body.series).toMatchObject({ seriesId: ids.series, team1: 'Alpha', team2: 'Bravo', winner: 'Alpha', score: '2-0' })
    expect(body.games.map((g: { number: number; gameId: number }) => [g.number, g.gameId])).toEqual([
      [1, ids.game1],
      [2, ids.game2],
    ])
    expect(body.games[0]).toMatchObject({ lengthSec: 1900, patch: '26.3' })
  })

  it('lists blue before red with the team, result and kills of each side', async () => {
    const { sides } = (await get(ids.spring, ids.series)).body.games[0]
    expect(sides.map((s: { side: string; team: string; win: boolean; kills: number }) => [s.side, s.team, s.win, s.kills])).toEqual([
      ['blue', 'Alpha', true, 15],
      ['red', 'Bravo', false, 9],
    ])
  })

  it("orders each side's bans by slot", async () => {
    const { sides } = (await get(ids.spring, ids.series)).body.games[0]
    expect(sides[0].bans).toEqual(['Lulu', 'Zed'])
    expect(sides[1].bans).toEqual(['Orianna'])
  })

  it('lists picks from Top to Support with the player, role and pick order', async () => {
    const { sides } = (await get(ids.spring, ids.series)).body.games[0]
    expect(sides[0].picks).toEqual([
      { champion: 'Aatrox', role: 'Top', page: 'A Top', player: 'ATop', pickOrder: 2 },
      { champion: 'Azir', role: 'Mid', page: 'A Mid', player: 'AMid', pickOrder: 1 },
    ])
    expect(sides[1].picks[0]).toMatchObject({ champion: 'Jayce', pickOrder: null })
  })

  it('returns empty bans and picks for a game with no draft data', async () => {
    const { body } = await get(ids.spring, ids.series)
    expect(body.games[1].sides.map((s: { bans: string[]; picks: unknown[] }) => [s.bans, s.picks])).toEqual([
      [[], []],
      [[], []],
    ])
  })

  it('404s for a series that belongs to another event, an unknown series and an unknown event', async () => {
    expect((await get(ids.spring, ids.foreignSeries)).status).toBe(404)
    expect((await get(ids.spring, 999999)).status).toBe(404)
    expect((await get(999999, ids.series)).status).toBe(404)
  })

  it('400s for a series id that is not a positive number', async () => {
    expect((await get(ids.spring, 'abc')).status).toBe(400)
    expect((await get(ids.spring, 0)).status).toBe(400)
  })
})

describe('shapeSeriesGames', () => {
  const row = (gameId: number, number: number, side: 'blue' | 'red') => ({
    gameId,
    number,
    lengthSec: null,
    patch: null,
    team: side === 'blue' ? 'A' : 'B',
    side,
    win: side === 'blue',
    kills: null,
  })

  it('puts games in number order and blue first, whatever order the rows arrive in', () => {
    const shaped = shapeSeriesGames([row(2, 2, 'red'), row(1, 1, 'red'), row(2, 2, 'blue'), row(1, 1, 'blue')], [], [])
    expect(shaped.map((g) => [g.number, g.sides.map((s) => s.side)])).toEqual([
      [1, ['blue', 'red']],
      [2, ['blue', 'red']],
    ])
  })

  it('puts bans without a slot after the numbered ones, and ignores rows for a game that is not in the series', () => {
    const shaped = shapeSeriesGames(
      [row(1, 1, 'blue'), row(1, 1, 'red')],
      [],
      [
        { gameId: 1, side: 'blue', champion: 'Unslotted', slot: null },
        { gameId: 1, side: 'blue', champion: 'Second', slot: 2 },
        { gameId: 1, side: 'blue', champion: 'First', slot: 1 },
        { gameId: 99, side: 'blue', champion: 'Stray', slot: 1 },
      ],
    )
    expect(shaped[0].sides[0].bans).toEqual(['First', 'Second', 'Unslotted'])
  })
})
