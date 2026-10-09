import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * "LCK 2026 Summer Playoffs" (running now) with teams A, B and C:
 *  S1: A beats B 2-1 (games 0-2: B wins game 1). S2: A beats C 2-0. S3: B beats C 2-0 (earliest).
 *  A game record 4-1, B 3-2, C 0-4. Series: A 2-0, B 1-1, C 0-2. 7 games in total.
 *  Every game: team kills 10 + 8 = 18, 1800s. Patch 26.9 for S3, 26.10 for S1 and S2.
 *  A's Mid plays Azir in all 5 of its games, B's Mid plays Ahri in 5, C's Mid plays Zed in 4.
 *  A bans Ahri once, in an S2 game, so Ahri is present in 6 of 7 games and Azir in 5.
 *  Two unplayed series: B v C scheduled in two days (upcoming) and A v C scheduled yesterday (never played).
 * "LCK 2026 Summer" (regular season, same league and year) is a related event; a Qualifier of the same
 * league and year must not be. "Worlds 2026 Play-In" is a 2-game event used for the short-event player fallback.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000)
const iso = (d: Date) => d.toISOString()
const dateOnly = (d: Date) => iso(d).slice(0, 10)
let n = 0
const ids: Record<string, number> = {}

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [A, B, C] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [pa, pb, pc] = [await player('A Mid'), await player('B Mid'), await player('C Mid')]
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, ahri, zed] = [await champ('Azir'), await champ('Ahri'), await champ('Zed')]
  const tour = (name: string, stage: string, intl: boolean, leagueId: number | null, start: Date, end: Date) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,2026,'Summer',$3,$4,$5,$6) RETURNING id`,
      [name, leagueId, stage, intl, dateOnly(start), dateOnly(end)],
    )
  const playoffs = await tour('LCK 2026 Summer Playoffs', 'Playoffs', false, lck, day(-10), day(10))
  ids.playoffs = playoffs
  ids.regular = await tour('LCK 2026 Summer', 'Regular season', false, lck, day(-60), day(-20))
  ids.qualifier = await tour('LCK 2026 Summer Promotion', 'Qualifier', false, lck, day(-5), day(5))
  ids.playin = await tour('Worlds 2026 Play-In', 'Regular season', true, null, day(-3), day(-1))

  const series = (tournament: number, t1: number, t2: number, winner: number | null, score: string | null, at: Date) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,3,$6,$7) RETURNING id`,
      [tournament, t1, t2, winner, score, `S${++n}`, iso(at)],
    )
  const midOf: Record<number, [number, number]> = { [A]: [pa, azir], [B]: [pb, ahri], [C]: [pc, zed] }
  const game = async (tournament: number, seriesId: number, at: Date, patch: string, win: number, lose: number, bans: [number, number][] = []) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec) VALUES ($1,$2,$3,$4,$5,1800) RETURNING id`,
      [`G${++n}`, seriesId, tournament, patch, iso(at)],
    )
    await pool.query(
      `INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,'blue',true,10), ($1,$3,'red',false,8)`,
      [g, win, lose],
    )
    for (const [teamId, side, w] of [[win, 'blue', true], [lose, 'red', false]] as const) {
      const [pid, cid] = midOf[teamId]
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
  const s3 = await series(playoffs, B, C, B, '2-0', day(-8))
  await game(playoffs, s3, day(-8), '26.9', B, C)
  await game(playoffs, s3, day(-8 + 0.01), '26.9', B, C)
  const s1 = await series(playoffs, A, B, A, '2-1', day(-4))
  await game(playoffs, s1, day(-4), '26.10', A, B)
  await game(playoffs, s1, day(-4 + 0.01), '26.10', B, A)
  await game(playoffs, s1, day(-4 + 0.02), '26.10', A, B)
  const s2 = await series(playoffs, A, C, A, '2-0', day(-2))
  await game(playoffs, s2, day(-2), '26.10', A, C, [[A, ahri]])
  await game(playoffs, s2, day(-2 + 0.01), '26.10', A, C)
  await series(playoffs, B, C, null, null, day(2))
  await series(playoffs, A, C, null, null, day(-1))

  const sRegular = await series(ids.regular, A, B, A, '1-0', day(-30))
  await game(ids.regular, sRegular, day(-30), '26.1', A, B)
  const sPlayIn = await series(ids.playin, A, C, A, '1-0', day(-2))
  await game(ids.playin, sPlayIn, day(-2), '26.19', A, C)
  const sQ = await series(ids.qualifier, A, B, A, '1-0', day(-3))
  await game(ids.qualifier, sQ, day(-3), '26.19', A, B)
})

afterAll(() => pool.end())

describe('GET /api/tournaments/:id', () => {
  it('returns the event and its summary, with the current leader while it is running', async () => {
    const { body, status } = await api(`/api/tournaments/${ids.playoffs}`)
    expect(status).toBe(200)
    expect(body.tournament).toMatchObject({ name: 'LCK 2026 Summer Playoffs', league: 'LCK', stage: 'Playoffs', status: 'In progress', isInternational: false })
    expect(body.summary).toMatchObject({ games: 7, series: 3, teams: 3, standingLabel: 'Leading', standingTeam: 'Alpha' })
    expect(body.summary.avgGameLengthSec).toBeCloseTo(1800)
    expect(body.summary.killsPerGame).toBeCloseTo(18)
    expect(body.summary.blueWinRate).toBeCloseTo(1) // the fixture's winner is always blue
    expect(body.summary.patches).toEqual(['26.10', '26.9']) // numeric order
  })

  it('names a champion for a finished international or playoffs, and a top record otherwise', async () => {
    const playIn = (await api(`/api/tournaments/${ids.playin}`)).body
    expect(playIn.tournament.isInternational).toBe(true)
    expect(playIn.tournament.league).toBeNull()
    expect(playIn.summary.standingLabel).toBe('Champion')
    const regular = (await api(`/api/tournaments/${ids.regular}`)).body
    expect(regular.summary.standingLabel).toBe('Top record')
  })

  it('404s for an unknown or malformed id', async () => {
    expect((await api('/api/tournaments/999999')).status).toBe(404)
    expect((await api('/api/tournaments/abc')).status).toBe(404)
  })

  it('does not shadow /api/tournaments/recent', async () => {
    const { body, status } = await api('/api/tournaments/recent')
    expect(status).toBe(200)
    expect(Array.isArray(body.tournaments)).toBe(true)
  })
})

describe('GET /api/tournaments/:id/standings and /matches', () => {
  it('ranks teams by series record, then game difference', async () => {
    const { body } = await api(`/api/tournaments/${ids.playoffs}/standings`)
    expect(body.standings.map((r: { team: string }) => r.team)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(body.standings[0]).toMatchObject({ seriesWins: 2, seriesLosses: 0, gameWins: 4, gameLosses: 1 })
    expect(body.standings[1]).toMatchObject({ seriesWins: 1, seriesLosses: 1, gameWins: 3, gameLosses: 2 })
    expect(body.standings[2]).toMatchObject({ seriesWins: 0, seriesLosses: 2, gameWins: 0, gameLosses: 4 })
    expect(body.standings[0].gameWinRate).toBeCloseTo(0.8)
  })

  it('lists results newest first and only unplayed series scheduled from now as upcoming', async () => {
    const { body } = await api(`/api/tournaments/${ids.playoffs}/matches`)
    expect(body.results.map((r: { team1: string; team2: string; score: string }) => `${r.team1} ${r.score} ${r.team2}`)).toEqual([
      'Alpha 2-0 Charlie',
      'Alpha 2-1 Bravo',
      'Bravo 2-0 Charlie',
    ])
    expect(body.results[0].winner).toBe('Alpha')
    expect(body.upcoming).toHaveLength(1)
    expect(body.upcoming[0]).toMatchObject({ team1: 'Bravo', team2: 'Charlie', score: null, winner: null })
    expect((await api(`/api/tournaments/${ids.playoffs}/matches?limit=1`)).body.results).toHaveLength(1)
  })
})

describe('GET /api/tournaments/:id/players, /champions, /context', () => {
  it('ranks players by KDA among those with the minimum sample', async () => {
    const { body } = await api(`/api/tournaments/${ids.playoffs}/players`)
    expect(body.minGames).toBe(5)
    expect(body.players.map((p: { name: string }) => p.name).sort()).toEqual(['A Mid', 'B Mid'])
    expect(body.players[0].kda).toBeCloseTo(8) // (3 + 5) / 1
    expect(body.players[0]).toMatchObject({ role: 'Mid', games: 5 })
  })

  it('falls back to everyone who played when the event is too short for the minimum', async () => {
    const { body } = await api(`/api/tournaments/${ids.playin}/players`)
    expect(body.minGames).toBe(1)
    expect(body.players.length).toBe(2)
  })

  it('counts picks, bans and presence against the event\'s games', async () => {
    const { champions } = (await api(`/api/tournaments/${ids.playoffs}/champions`)).body
    const byName = Object.fromEntries(champions.map((c: { champion: string }) => [c.champion, c]))
    expect(byName.Azir).toMatchObject({ picks: 5, wins: 4, bans: 0 })
    expect(byName.Azir.presence).toBeCloseTo(5 / 7)
    expect(byName.Ahri).toMatchObject({ picks: 5, bans: 1 })
    expect(byName.Ahri.presence).toBeCloseTo(6 / 7)
    expect(champions[0].champion).toBe('Ahri') // highest presence first
    expect(byName.Zed.winRate).toBeCloseTo(0)
  })

  it('returns leading teams, schedule, results and related events', async () => {
    const { body } = await api(`/api/tournaments/${ids.playoffs}/context`)
    expect(body.teams.map((t: { team: string }) => t.team)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(body.upcoming).toHaveLength(1)
    expect(body.results).toHaveLength(3)
    // Same league and year, never itself and never a qualifier.
    expect(body.related.map((e: { name: string }) => e.name)).toEqual(['LCK 2026 Summer'])
  })

  it('relates an international to the other internationals of the year', async () => {
    const { body } = await api(`/api/tournaments/${ids.playin}/context`)
    expect(body.related).toEqual([])
  })
})
