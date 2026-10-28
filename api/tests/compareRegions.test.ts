import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Regions are leagues; a team belongs to the league of most of its domestic games in the year of the game.
 *  Domestic 2025: Alpha, Echo in LCK; Bravo, Charlie in LPL.   Domestic 2026: Alpha, Echo in LCK; Bravo, Foxtrot in LPL;
 *  Charlie (moved) and Golf in LEC. "Wild" never plays a domestic game, so it has no region.
 *  MSI 2025: Alpha beats Bravo 2-1 (Alpha blue, red, blue), Alpha beats Charlie once (Alpha red), Alpha beats Wild once.
 *  Worlds 2026: Bravo beats Alpha once (Bravo blue), Charlie beats Alpha once (Charlie blue).
 *  LTA 2025 Playoffs (multi-league, no league of its own): North (LCS) beats South (CBLOL) once.
 *  Alpha plays Azir, everybody else Ornn. Winners get 15 kills and the loser 8.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let n = 0

beforeAll(async () => {
  await resetDb()
  const league = (name: string, area: string) => one(`INSERT INTO league (name, region) VALUES ($1,$2) RETURNING id`, [name, area])
  const [lck, lpl, lec, lcs, cblol] = [
    await league('LCK', 'Korea'),
    await league('LPL', 'China'),
    await league('LEC', 'Europe'),
    await league('LCS', 'North America'),
    await league('CBLOL', 'Brazil'),
  ]
  const team = (name: string) => one(`INSERT INTO team (name, region) VALUES ($1,'x') RETURNING id`, [name])
  const t: Record<string, number> = {}
  for (const name of ['Alpha', 'Bravo', 'Charlie', 'Echo', 'Foxtrot', 'Golf', 'Wild', 'North', 'South']) t[name] = await team(name)
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, ornn] = [await champ('Azir'), await champ('Ornn')]
  const players: Record<string, number> = {}
  for (const name of Object.keys(t)) players[name] = await player(`${name} Mid`)

  const tour = (name: string, year: number, intl: boolean, leagueId: number | null) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,$3,NULL,'Regular season',$4,$5,$5) RETURNING id`,
      [name, leagueId, year, intl, `${year}-06-01`],
    )
  const lck25 = await tour('LCK 2025', 2025, false, lck)
  const lpl25 = await tour('LPL 2025', 2025, false, lpl)
  const lck26 = await tour('LCK 2026', 2026, false, lck)
  const lpl26 = await tour('LPL 2026', 2026, false, lpl)
  const lec26 = await tour('LEC 2026', 2026, false, lec)
  const lta25 = await tour('LTA 2025 Playoffs', 2025, false, null)
  const msi25 = await tour('MSI 2025', 2025, true, null)
  const worlds26 = await tour('Worlds 2026', 2026, true, null)
  await pool.query(`INSERT INTO tournament_team_league (tournament_id, team_id, league_id) VALUES ($1,$2,$3),($1,$4,$5)`, [lta25, t.North, lcs, t.South, cblol])

  const series = (tournament: number, t1: string, t2: string, winner: string, score: string) =>
    one(`INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [tournament, t[t1], t[t2], t[winner], score])

  /** `blue` plays the blue side; each team gets one player row on its champion. */
  const game = async (tournament: number, seriesId: number | null, at: string, blue: string, red: string, winner: string) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, series_id, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`,
      [`R${++n}`, tournament, seriesId, at],
    )
    for (const [name, side] of [[blue, 'blue'], [red, 'red']] as const) {
      const win = name === winner
      await pool.query(
        `INSERT INTO team_game (game_id, team_id, side, win, kills, gold, towers) VALUES ($1,$2,$3,$4,$5,$6,8)`,
        [g, t[name], side, win, win ? 15 : 8, win ? 60000 : 50000],
      )
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists)
         VALUES ($1,$2,$3,$4,'Mid',$5,$6,4,2,6)`,
        [g, players[name], t[name], name === 'Alpha' ? azir : ornn, side, win],
      )
    }
  }

  await game(lck25, null, '2025-03-01T10:00:00Z', 'Alpha', 'Echo', 'Alpha')
  await game(lpl25, null, '2025-03-02T10:00:00Z', 'Bravo', 'Charlie', 'Bravo')
  await game(lck26, null, '2026-03-01T10:00:00Z', 'Alpha', 'Echo', 'Alpha')
  await game(lpl26, null, '2026-03-02T10:00:00Z', 'Bravo', 'Foxtrot', 'Bravo')
  await game(lec26, null, '2026-03-03T10:00:00Z', 'Charlie', 'Golf', 'Charlie')

  const ltaSeries = await series(lta25, 'North', 'South', 'North', '1-0')
  await game(lta25, ltaSeries, '2025-05-01T10:00:00Z', 'North', 'South', 'North')

  const msiAB = await series(msi25, 'Alpha', 'Bravo', 'Alpha', '2-1')
  await game(msi25, msiAB, '2025-05-10T10:00:00Z', 'Alpha', 'Bravo', 'Alpha')
  await game(msi25, msiAB, '2025-05-10T12:00:00Z', 'Bravo', 'Alpha', 'Bravo')
  await game(msi25, msiAB, '2025-05-10T14:00:00Z', 'Alpha', 'Bravo', 'Alpha')
  const msiAC = await series(msi25, 'Charlie', 'Alpha', 'Alpha', '0-1')
  await game(msi25, msiAC, '2025-05-11T10:00:00Z', 'Charlie', 'Alpha', 'Alpha')
  const msiAW = await series(msi25, 'Alpha', 'Wild', 'Alpha', '1-0')
  await game(msi25, msiAW, '2025-05-12T10:00:00Z', 'Alpha', 'Wild', 'Alpha')

  const worldsAB = await series(worlds26, 'Bravo', 'Alpha', 'Bravo', '1-0')
  await game(worlds26, worldsAB, '2026-10-20T10:00:00Z', 'Bravo', 'Alpha', 'Bravo')
  const worldsCA = await series(worlds26, 'Charlie', 'Alpha', 'Charlie', '1-0')
  await game(worlds26, worldsCA, '2026-10-21T10:00:00Z', 'Charlie', 'Alpha', 'Charlie')
})

afterAll(() => pool.end())

describe('GET /api/compare/regions/:a/:b', () => {
  it('defaults to the newest year the two regions met', async () => {
    const { body, status } = await api('/api/compare/regions/LCK/LPL')
    expect(status).toBe(200)
    expect(body.range).toMatchObject({ label: '2026', isDefault: true, resolved: { year: 2026, split: null } })
    expect(body.empty).toBe(false)
    expect(body.headToHead).toMatchObject({ games: 1, wins: 0, losses: 1, seriesPlayed: 1, seriesWins: 0, seriesLosses: 1 })
  })

  it('counts games and series from region A, split by side, and mirrors them when the regions are swapped', async () => {
    const { body } = await api('/api/compare/regions/LCK/LPL?year=2025')
    expect(body.range).toMatchObject({ label: '2025', isDefault: false })
    expect(body.headToHead).toMatchObject({ games: 4, wins: 3, losses: 1, seriesPlayed: 2, seriesWins: 2, seriesLosses: 0, avgGameLengthSec: 1800 })
    expect(body.a.summary).toMatchObject({ games: 4, wins: 3, blueGames: 2, blueWins: 2, redGames: 2, redWins: 1, killsPerGame: 13.25 })
    expect(body.b.summary).toMatchObject({ games: 4, wins: 1, blueGames: 2, blueWins: 1, redGames: 2, redWins: 0, killsPerGame: 9.75 })

    const swapped = (await api('/api/compare/regions/LPL/LCK?year=2025')).body
    expect(swapped.headToHead).toMatchObject({ games: 4, wins: 1, losses: 3, seriesWins: 0, seriesLosses: 2 })
  })

  it('gives every game with range=all and keeps an explicit year over it', async () => {
    const all = (await api('/api/compare/regions/LCK/LPL?range=all')).body
    expect(all.range).toMatchObject({ label: 'All time', isDefault: false })
    expect(all.headToHead).toMatchObject({ games: 5, wins: 3, seriesPlayed: 3, seriesWins: 2 })
    const both = (await api('/api/compare/regions/LCK/LPL?range=all&year=2026')).body
    expect(both.headToHead.games).toBe(1)
  })

  it('puts a team in the league it played in that year', async () => {
    // Charlie was LPL in 2025 (against Alpha at MSI) and LEC in 2026 (against Alpha at Worlds).
    const lpl25 = (await api('/api/compare/regions/LCK/LPL?year=2025')).body
    expect(lpl25.b.teams.map((x: { team: string }) => x.team).sort()).toEqual(['Bravo', 'Charlie'])
    const lec = (await api('/api/compare/regions/LCK/LEC')).body
    expect(lec.range.label).toBe('2026')
    expect(lec.b.teams).toEqual([expect.objectContaining({ team: 'Charlie', games: 1, wins: 1 })])
    expect(lec.headToHead).toMatchObject({ games: 1, wins: 0, losses: 1 })
  })

  it('leaves out teams with no domestic games in that year', async () => {
    const { body } = await api('/api/compare/regions/LCK/LPL?range=all')
    const names = [...body.a.teams, ...body.b.teams].map((x: { team: string }) => x.team)
    expect(names).not.toContain('Wild')
    expect(body.a.teams).toEqual([expect.objectContaining({ team: 'Alpha', games: 5, wins: 3, losses: 2 })])
  })

  it('counts games between conferences of a multi-league event for their leagues', async () => {
    const { body } = await api('/api/compare/regions/LCS/CBLOL')
    expect(body.range.label).toBe('2025')
    expect(body.headToHead).toMatchObject({ games: 1, wins: 1, seriesPlayed: 1, seriesWins: 1 })
    expect(body.headToHead.recent[0]).toMatchObject({ tournament: 'LTA 2025 Playoffs', teamA: 'North', teamB: 'South' })
  })

  it('lists recent meetings newest first, with the score from region A and the winning side', async () => {
    const { body } = await api('/api/compare/regions/LPL/LCK?range=all')
    const recent = body.headToHead.recent
    expect(recent.map((m: { tournament: string }) => m.tournament)).toEqual(['Worlds 2026', 'MSI 2025', 'MSI 2025'])
    expect(recent[0]).toMatchObject({ teamA: 'Bravo', teamB: 'Alpha', score: '1-0', winner: 'a', tournamentSlug: 'worlds-2026' })
    // Alpha (team1) won 2-1 over Bravo, so from the LPL side it reads 1-2.
    expect(recent[2]).toMatchObject({ teamA: 'Bravo', teamB: 'Alpha', score: '1-2', winner: 'b', tournamentSlug: 'msi-2025' })
    expect(recent[0].seriesId).toEqual(expect.any(Number))
    expect(recent[0].tournamentId).toEqual(expect.any(Number))
  })

  it('lists each region’s most picked champions in the meetings', async () => {
    const { body } = await api('/api/compare/regions/LCK/LPL?year=2025')
    expect(body.a.picks[0]).toMatchObject({ champion: 'Azir', games: 4, wins: 3 })
    expect(body.b.picks[0]).toMatchObject({ champion: 'Ornn', games: 4, wins: 1 })
    expect(body.a.region).toEqual({ name: 'LCK', area: 'Korea' })
  })

  it('answers with empty: true when the regions never met', async () => {
    const { body, status } = await api('/api/compare/regions/LEC/LPL')
    expect(status).toBe(200)
    expect(body.empty).toBe(true)
    expect(body.a.summary).toBeNull()
    expect(body.headToHead).toMatchObject({ games: 0, seriesPlayed: 0, recent: [] })
    expect((await api('/api/compare/regions/LCK/LPL?year=2024')).body.empty).toBe(true)
  })

  it('resolves region names in any case, 404s on an unknown side and 400s on the same region twice or a bad filter', async () => {
    expect((await api('/api/compare/regions/lck/lpl')).body.a.region.name).toBe('LCK')
    const missing = await api('/api/compare/regions/LCK/Nowhere')
    expect(missing.status).toBe(404)
    expect(missing.body.error).toContain('b')
    expect((await api('/api/compare/regions/Nowhere/LCK')).body.error).toContain('a')
    expect((await api('/api/compare/regions/LCK/LCK')).status).toBe(400)
    expect((await api('/api/compare/regions/LCK/lck')).status).toBe(400)
    expect((await api('/api/compare/regions/LCK/LPL?year=abc')).status).toBe(400)
  })
})
