import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * LCK Summer 2026: one series Alpha 2-1 Bravo. Alpha Mid (Mid) and Alpha Top (Top) play for Alpha, Bravo Mid for Bravo.
 * Worlds 2026 (international): one game and series, Gamma beats Alpha. Alpha Mid plays, Gamma Mid plays for Gamma.
 * LEC Summer 2026: one Gamma game against Delta (no players), so Gamma's own default range is a different league split.
 * LCK Summer 2024: one Omega game against Bravo, Old Mid plays. Omega and Old Mid share no year with Alpha.
 * "Benched" and "Reserve" have no games at all.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const lec = await one(`INSERT INTO league (name, region) VALUES ('LEC','EMEA') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name, region) VALUES ($1,'x') RETURNING id`, [name])
  const [alpha, bravo, gamma, delta, omega] = [
    await team('Alpha'),
    await team('Bravo'),
    await team('Gamma'),
    await team('Delta'),
    await team('Omega'),
  ]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [aMid, aTop, bMid, gMid, oldMid] = [
    await player('Alpha Mid'),
    await player('Alpha Top'),
    await player('Bravo Mid'),
    await player('Gamma Mid'),
    await player('Old Mid'),
  ]
  await player('Benched')
  await player('Reserve')
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, ornn, gnar] = [await champ('Azir'), await champ('Ornn'), await champ('Gnar')]
  const tour = (name: string, year: number, split: string | null, intl: boolean, leagueId: number | null, start: string, end: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,$3,$4,'Regular season',$5,$6,$7) RETURNING id`,
      [name, leagueId, year, split, intl, start, end],
    )
  const summer = await tour('LCK 2026 Summer', 2026, 'Summer', false, lck, '2026-04-01', '2026-06-01')
  const lecSummer = await tour('LEC 2026 Summer', 2026, 'Summer', false, lec, '2026-04-01', '2026-06-01')
  const worlds = await tour('Worlds 2026', 2026, null, true, null, '2026-10-01', '2026-11-01')
  const old = await tour('LCK 2024 Summer', 2024, 'Summer', false, lck, '2024-04-01', '2024-06-01')
  const series = (tournament: number, t1: number, t2: number, winner: number) =>
    one(`INSERT INTO series (tournament_id, team1_id, team2_id, winner_id) VALUES ($1,$2,$3,$4) RETURNING id`, [tournament, t1, t2, winner])

  interface Row {
    player: number
    team: number
    role: string
    champion: number
  }
  /** `teams[0]` is blue side. Player rows get 4/2/6 kills, deaths, assists. */
  const game = async (tournament: number, seriesId: number | null, at: string, teams: [number, number], winner: number, rows: Row[]) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, series_id, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`,
      [`C${++n}`, tournament, seriesId, at],
    )
    const sideOf = (t: number) => (t === teams[0] ? 'blue' : 'red')
    for (const t of teams) {
      await pool.query(`INSERT INTO team_game (game_id, team_id, side, win, kills, gold) VALUES ($1,$2,$3,$4,12,60000)`, [g, t, sideOf(t), t === winner])
    }
    for (const r of rows) {
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists)
         VALUES ($1,$2,$3,$4,$5,$6,$7,4,2,6)`,
        [g, r.player, r.team, r.champion, r.role, sideOf(r.team), r.team === winner],
      )
    }
  }

  const lckSeries = await series(summer, alpha, bravo, alpha)
  for (let i = 0; i < 3; i++) {
    await game(summer, lckSeries, `2026-04-1${i}T10:00:00Z`, [alpha, bravo], i < 2 ? alpha : bravo, [
      { player: aMid, team: alpha, role: 'Mid', champion: azir },
      { player: aTop, team: alpha, role: 'Top', champion: gnar },
      { player: bMid, team: bravo, role: 'Mid', champion: ornn },
    ])
  }
  const worldsSeries = await series(worlds, alpha, gamma, gamma)
  await game(worlds, worldsSeries, '2026-10-05T10:00:00Z', [alpha, gamma], gamma, [
    { player: aMid, team: alpha, role: 'Mid', champion: azir },
    { player: gMid, team: gamma, role: 'Mid', champion: ornn },
  ])
  await game(lecSummer, null, '2026-04-20T10:00:00Z', [gamma, delta], gamma, [{ player: gMid, team: gamma, role: 'Mid', champion: azir }])
  await game(old, null, '2024-04-10T10:00:00Z', [omega, bravo], omega, [{ player: oldMid, team: omega, role: 'Mid', champion: azir }])
})

afterAll(() => pool.end())

describe('GET /api/compare/players/:a/:b', () => {
  it('uses the shared league split when both players default to the same one', async () => {
    const { body, status } = await api('/api/compare/players/Alpha Mid/Bravo Mid')
    expect(status).toBe(200)
    expect(body.range).toMatchObject({ isDefault: true, resolved: { league: 'LCK', year: 2026, split: 'Summer' } })
    expect(body.range.label).toContain('LCK 2026 Summer')
    expect(body.empty).toBe(false)
    expect(body.a.player).toMatchObject({ name: 'Alpha Mid', role: 'Mid', team: 'Alpha', league: 'LCK' })
    expect(body.a.summary).toMatchObject({ games: 4, wins: 2 }) // the three LCK games plus the Worlds game
    expect(body.b.summary).toMatchObject({ games: 3, wins: 1 })
    expect(body.a.champions[0]).toMatchObject({ champion: 'Azir', games: 4 })
    expect(body.b.champions[0]).toMatchObject({ champion: 'Ornn', games: 3 })
  })

  it('counts the head-to-head from player A, split into lane games and games as teammates', async () => {
    const { body } = await api('/api/compare/players/Alpha Mid/Bravo Mid')
    expect(body.headToHead).toEqual({
      games: 3,
      wins: 2,
      losses: 1,
      laneGames: 3,
      laneWins: 2,
      togetherGames: 0,
      togetherWins: 0,
    })
    const flipped = (await api('/api/compare/players/Bravo Mid/Alpha Mid')).body.headToHead
    expect(flipped).toMatchObject({ games: 3, wins: 1, losses: 2 })

    const teammates = (await api('/api/compare/players/Alpha Mid/Alpha Top')).body.headToHead
    expect(teammates).toMatchObject({ games: 0, togetherGames: 3, togetherWins: 2 })
  })

  it('allows mismatched roles: opponents with no shared lane count games but no lane games', async () => {
    const { body, status } = await api('/api/compare/players/Alpha Top/Bravo Mid')
    expect(status).toBe(200)
    expect(body.headToHead).toMatchObject({ games: 3, wins: 2, laneGames: 0, laneWins: 0 })
  })

  it('falls back to the newest year both played in when their default splits differ', async () => {
    const { body } = await api('/api/compare/players/Alpha Mid/Gamma Mid')
    expect(body.range).toMatchObject({
      label: 'All leagues, 2026 + internationals',
      isDefault: true,
      resolved: { year: 2026, split: null },
    })
    expect(body.a.summary.games).toBe(4)
    expect(body.b.summary.games).toBe(2) // the LEC game and the Worlds game
    expect(body.headToHead).toMatchObject({ games: 1, wins: 0, losses: 1 })

    const domestic = (await api('/api/compare/players/Alpha Mid/Gamma Mid?domestic=true')).body
    expect(domestic.range.label).toBe('All leagues, 2026')
    expect(domestic.a.summary.games).toBe(3)
    expect(domestic.headToHead.games).toBe(0)
  })

  it('uses all time when the two share no year', async () => {
    const { body } = await api('/api/compare/players/Alpha Mid/Old Mid')
    expect(body.range).toMatchObject({ label: 'All time', isDefault: false, resolved: null })
    expect(body.a.summary.games).toBe(4)
    expect(body.b.summary.games).toBe(1)
    expect(body.headToHead.games).toBe(0)
  })

  it('applies explicit filters and range=all to both players', async () => {
    const league = (await api('/api/compare/players/Alpha Mid/Bravo Mid?league=LCK&year=2026')).body
    expect(league.range.isDefault).toBe(false)
    expect(league.a.summary.games).toBe(3) // Worlds has no league
    expect(league.b.summary.games).toBe(3)

    const all = (await api('/api/compare/players/Alpha Mid/Bravo Mid?range=all')).body
    expect(all.range.label).toBe('All time')
    expect(all.a.summary.games).toBe(4)

    const blue = (await api('/api/compare/players/Alpha Mid/Bravo Mid?side=blue')).body
    expect(blue.a.summary.games).toBe(4) // Alpha was blue side in every game
    expect(blue.b.summary).toBeNull() // Bravo Mid always played red
    expect(blue.empty).toBe(false)
  })

  it('returns empty: true when neither player has games in the range', async () => {
    const none = (await api('/api/compare/players/Benched/Reserve')).body
    expect(none.empty).toBe(true)
    expect(none.a.summary).toBeNull()
    expect(none.headToHead).toMatchObject({ games: 0, togetherGames: 0 })
    const role = (await api('/api/compare/players/Alpha Mid/Bravo Mid?role=Top')).body
    expect(role.empty).toBe(true)
  })

  it('accepts numeric ids, 404s on an unknown side and 400s on bad input', async () => {
    const id = (await api('/api/players/Alpha Mid')).body.player.id
    expect((await api(`/api/compare/players/${id}/Bravo Mid`)).status).toBe(200)
    const missingA = await api('/api/compare/players/Nobody/Bravo Mid')
    expect(missingA.status).toBe(404)
    expect(missingA.body.error).toContain('a')
    const missingB = await api('/api/compare/players/Alpha Mid/Nobody')
    expect(missingB.status).toBe(404)
    expect(missingB.body.error).toContain('b')
    expect((await api('/api/compare/players/Alpha Mid/Alpha Mid')).status).toBe(400)
    expect((await api('/api/compare/players/Alpha Mid/Bravo Mid?year=abc')).status).toBe(400)
  })
})

describe('GET /api/compare/teams/:a/:b', () => {
  it('compares two teams on their shared split with lineups side by side', async () => {
    const { body, status } = await api('/api/compare/teams/Alpha/Bravo')
    expect(status).toBe(200)
    expect(body.range).toMatchObject({ isDefault: true, resolved: { league: 'LCK', year: 2026, split: 'Summer' } })
    expect(body.a.team).toMatchObject({ name: 'Alpha', league: 'LCK' })
    expect(body.a.summary).toMatchObject({ games: 4, wins: 2 })
    expect(body.b.summary).toMatchObject({ games: 3, wins: 1 })
    expect(body.a.players.map((p: { name: string }) => p.name)).toEqual(['Alpha Top', 'Alpha Mid'])
    expect(body.b.players.map((p: { name: string }) => p.name)).toEqual(['Bravo Mid'])
  })

  it('lists each team’s most picked champions for the page header slideshow', async () => {
    const { body } = await api('/api/compare/teams/Alpha/Bravo')
    expect(body.a.picks).toEqual([
      expect.objectContaining({ champion: 'Azir', games: 4, wins: 2 }),
      expect.objectContaining({ champion: 'Gnar', games: 3, wins: 2 }),
    ])
    expect(body.b.picks).toEqual([expect.objectContaining({ champion: 'Ornn', games: 3, wins: 1 })])
  })

  it('records the game and series head-to-head from team A, with the recent meetings', async () => {
    const { headToHead } = (await api('/api/compare/teams/Alpha/Bravo')).body
    expect(headToHead).toMatchObject({ games: 3, wins: 2, losses: 1, seriesPlayed: 1, seriesWins: 1, seriesLosses: 0 })
    expect(headToHead.recent).toHaveLength(1)
    expect(headToHead.recent[0]).toMatchObject({ tournament: 'LCK 2026 Summer', winner: 'Alpha' })

    const flipped = (await api('/api/compare/teams/Bravo/Alpha')).body.headToHead
    expect(flipped).toMatchObject({ games: 3, wins: 1, seriesWins: 0, seriesLosses: 1 })
  })

  it('shares the newest common year across leagues, and all time when there is none', async () => {
    const gamma = (await api('/api/compare/teams/Alpha/Gamma')).body
    expect(gamma.range.label).toBe('All leagues, 2026 + internationals')
    expect(gamma.headToHead).toMatchObject({ games: 1, wins: 0, seriesPlayed: 1, seriesWins: 0, seriesLosses: 1 })
    expect(gamma.headToHead.recent[0]).toMatchObject({ tournament: 'Worlds 2026', winner: 'Gamma' })

    const omega = (await api('/api/compare/teams/Alpha/Omega')).body
    expect(omega.range.label).toBe('All time')
    expect(omega.headToHead).toMatchObject({ games: 0, seriesPlayed: 0 })
    expect(omega.headToHead.recent).toEqual([])
  })

  it('applies filters to both teams, ignores the role filter and flags an empty range', async () => {
    const domestic = (await api('/api/compare/teams/Alpha/Bravo?domestic=true')).body
    expect(domestic.a.summary.games).toBe(3)
    expect((await api('/api/compare/teams/Alpha/Bravo?role=Top')).body.a.summary.games).toBe(4)
    const empty = (await api('/api/compare/teams/Alpha/Bravo?year=2020')).body
    expect(empty.empty).toBe(true)
    expect(empty.a.summary).toBeNull()
  })

  it('404s on an unknown side and 400s on the same team twice or a bad filter', async () => {
    expect((await api('/api/compare/teams/Nobody/Bravo')).status).toBe(404)
    expect((await api('/api/compare/teams/Alpha/Nobody')).status).toBe(404)
    expect((await api('/api/compare/teams/Alpha/Alpha')).status).toBe(400)
    expect((await api('/api/compare/teams/Alpha/Bravo?side=green')).status).toBe(400)
  })
})
