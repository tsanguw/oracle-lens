import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * LCK 2026 Summer (the default range) has 10 games, Worlds 2026 (international, later) has 2, and a later
 * "Summer Promotion" qualifier has 3 Azir games that must stay out unless asked for. So the default range is 12 games.
 *  - Azir is picked in Summer games 0-5 by Alpha: "Alpha Mid" in games 0-3 (4 wins), "Sub" in games 4-5 (2 losses).
 *    Every Azir game: 4/2/6, 12000 gold vs the lane opponent's 11000, 1800s, team kills 20. So KDA 5, KP 0.5.
 *    Patches: games 0-2 on 26.9, games 3-5 on 26.10 (numeric order must put 26.10 first).
 *  - The lane opponent plays Zed in games 0-2 (Azir wins all) and Syndra in games 3-5 (Azir wins game 3 only).
 *  - Bravo bans Azir in games 2, 3 and 8, so Azir is banned in 3 of 12 games and present (picked or banned) in 7.
 *  - Games 6-9 and the Worlds games: Alpha Mid plays Ahri.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [alpha, bravo, charlie] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [mid, sub, oppMid] = [await player('Alpha Mid'), await player('Sub'), await player('Opp Mid')]
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, ahri, zed, syndra] = [await champ('Azir'), await champ('Ahri'), await champ('Zed'), await champ('Syndra')]
  const tour = (name: string, split: string | null, stage: string, intl: boolean, leagueId: number | null, start: string, end: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,2026,$3,$4,$5,$6,$7) RETURNING id`,
      [name, leagueId, split, stage, intl, start, end],
    )
  const summer = await tour('LCK 2026 Summer', 'Summer', 'Regular season', false, lck, '2026-04-01', '2026-06-01')
  const promo = await tour('LCK 2026 Summer Promotion', 'Summer', 'Qualifier', false, lck, '2026-07-01', '2026-07-10')
  const worlds = await tour('Worlds 2026', null, 'Playoffs', true, null, '2026-10-01', '2026-11-01')

  const game = async (o: {
    tournament: number; at: string; patch: string; opp: number; win: boolean
    alphaMid: [number, number]; oppMid: number; bans?: number[]
  }) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, patch, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`,
      [`C${++n}`, o.tournament, o.patch, o.at],
    )
    await pool.query(
      `INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,'blue',$3,20), ($1,$4,'red',$5,15)`,
      [g, alpha, o.win, o.opp, !o.win],
    )
    await pool.query(
      `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists, cs, damage, gold)
       VALUES ($1,$2,$3,$4,'Mid','blue',$5,4,2,6,270,5400,12000), ($1,$6,$7,$8,'Mid','red',$9,1,3,2,250,4000,11000)`,
      [g, o.alphaMid[0], alpha, o.alphaMid[1], o.win, oppMid, o.opp, o.oppMid, !o.win],
    )
    for (const c of o.bans ?? []) {
      await pool.query(`INSERT INTO pick_ban (game_id, team_id, champion_id, action, draft_order) VALUES ($1,$2,$3,'ban',1)`, [g, o.opp, c])
    }
  }
  const day = (i: number) => `2026-04-${String(i + 10).padStart(2, '0')}T10:00:00Z`
  const wins = [true, true, true, true, false, false, true, false, true, false]
  for (let i = 0; i < 10; i++) {
    const azirGame = i < 6
    await game({
      tournament: summer, at: day(i), patch: i < 3 ? '26.9' : '26.10', opp: bravo, win: wins[i],
      alphaMid: [i >= 4 && i < 6 ? sub : mid, azirGame ? azir : ahri],
      oppMid: i < 3 ? zed : syndra,
      bans: i === 2 || i === 3 || i === 8 ? [azir] : [],
    })
  }
  for (let i = 0; i < 2; i++) {
    await game({ tournament: worlds, at: `2026-10-0${i + 5}T10:00:00Z`, patch: '26.19', opp: charlie, win: false, alphaMid: [mid, ahri], oppMid: zed })
  }
  for (let i = 0; i < 3; i++) {
    await game({ tournament: promo, at: `2026-07-0${i + 2}T10:00:00Z`, patch: '26.14', opp: charlie, win: true, alphaMid: [mid, azir], oppMid: zed })
  }
})

afterAll(() => pool.end())

describe('GET /api/champions/:name', () => {
  it('uses the default range and excludes qualifiers', async () => {
    const { body, status } = await api('/api/champions/Azir')
    expect(status).toBe(200)
    expect(body.champion.name).toBe('Azir')
    expect(body.range).toMatchObject({ isDefault: true, label: '2026 Summer + internationals' })
    expect(body.summary.games).toBe(6)
    expect(body.summary.wins).toBe(4)
    expect(body.summary.winRate).toBeCloseTo(4 / 6)
    expect(body.summary.role).toBe('Mid')
  })

  it('computes pick, ban and presence rates over every game in the range', async () => {
    const { summary } = (await api('/api/champions/Azir')).body
    expect(summary.totalGames).toBe(12)
    expect(summary.pickRate).toBeCloseTo(6 / 12)
    expect(summary.banRate).toBeCloseTo(3 / 12)
    expect(summary.presence).toBeCloseTo(7 / 12) // picked in 6 games, banned in one more
  })

  it('computes performance from the raw player rows', async () => {
    const { summary } = (await api('/api/champions/Azir')).body
    expect(summary.kda).toBeCloseTo(5)
    expect(summary.killParticipation).toBeCloseTo(0.5)
    expect(summary.damagePerMin).toBeCloseTo(180)
    expect(summary.goldPerMin).toBeCloseTo(400)
    expect(summary.csPerMin).toBeCloseTo(9)
    expect(summary.avgGameLengthSec).toBeCloseTo(1800)
    expect(summary.blueGames).toBe(6)
  })

  it('includes qualifiers only when asked, and honours explicit filters', async () => {
    const withQ = await api('/api/champions/Azir?league=LCK&year=2026&qualifiers=true')
    expect(withQ.body.summary.games).toBe(9)
    const without = await api('/api/champions/Azir?league=LCK&year=2026')
    expect(without.body.range).toMatchObject({ isDefault: false, label: 'LCK 2026' })
    expect(without.body.summary.games).toBe(6)
    const patch = await api('/api/champions/Azir?patch=26.10&league=LCK&year=2026')
    expect(patch.body.summary.games).toBe(3)
  })

  it('returns an empty payload when the champion has no games in the filters, and 404 for an unknown name', async () => {
    const empty = await api('/api/champions/Azir?role=Top')
    expect(empty.status).toBe(200)
    expect(empty.body).toMatchObject({ empty: true, summary: null })
    expect((await api('/api/champions/Nope')).status).toBe(404)
  })

  it('finds a champion regardless of capitalisation', async () => {
    expect((await api('/api/champions/azir')).body.champion.name).toBe('Azir')
  })
})

describe('GET /api/champions/:name/... lists', () => {
  it('lists the players with the most games on the champion', async () => {
    const { body } = await api('/api/champions/Azir/players')
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alpha Mid', 'Sub'])
    expect(body.players[0]).toMatchObject({ team: 'Alpha', games: 4, wins: 4, underMinSample: true })
    expect(body.players[0].kda).toBeCloseTo(5)
  })

  it('lists teams, and the lane opponent champions with records and gold difference', async () => {
    const teams = (await api('/api/champions/Azir/teams')).body.teams
    expect(teams).toEqual([expect.objectContaining({ name: 'Alpha', games: 6, wins: 4 })])
    const { matchups } = (await api('/api/champions/Azir/matchups')).body
    expect(matchups.map((m: { champion: string }) => m.champion)).toEqual(['Syndra', 'Zed'])
    expect(matchups[0]).toMatchObject({ games: 3, wins: 1, losses: 2 })
    expect(matchups[1]).toMatchObject({ games: 3, wins: 3 })
    expect(matchups[0].goldDiff).toBeCloseTo(1000)
    expect((await api('/api/champions/Azir/matchups?limit=1')).body.matchups).toHaveLength(1)
  })

  it('breaks results down by role, ignoring the role filter', async () => {
    const { body } = await api('/api/champions/Azir/roles?role=Top')
    expect(body.roles).toEqual([{ role: 'Mid', games: 6, wins: 4, winRate: 4 / 6 }])
  })

  it('breaks results down by patch in numeric order with pick rate per patch', async () => {
    const { patches } = (await api('/api/champions/Azir/patches')).body
    expect(patches.map((p: { patch: string }) => p.patch)).toEqual(['26.10', '26.9'])
    expect(patches[0]).toMatchObject({ games: 3, wins: 1 })
    expect(patches[0].pickRate).toBeCloseTo(3 / 7) // 26.10 covers Summer games 3-9 (7 games); Azir is picked in 3 of them
  })
})

describe('GET /api/champions/:name/context', () => {
  it('returns recent players, teams and events, ignoring stat filters', async () => {
    const { body } = await api('/api/champions/Azir/context?role=Top')
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alpha Mid', 'Sub'])
    expect(body.teams[0].name).toBe('Alpha')
    expect(body.events.map((e: { name: string }) => e.name)).toContain('LCK 2026 Summer')
    expect(body.events.map((e: { name: string }) => e.name)).not.toContain('LCK 2026 Summer Promotion')
  })
})
