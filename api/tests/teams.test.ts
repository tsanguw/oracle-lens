import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Team "Alpha" (LCK). Every Alpha game: 15 kills (opponent 10), 60000 gold (opponent 55000), 1800s long,
 * 8 towers, 3 dragons, 1 baron, 1 herald, 2 grubs. So kills 15/game, deaths 10/game, gold 2000/min, gold diff +5000.
 *  Spring 2026 (older split): 1 game, must stay out of the default range.
 *  Summer 2026: 6 games vs Bravo (wins in games 0-3). Alpha Top is replaced by "Sub" in game 0.
 *  Worlds 2026 (international, later): 2 games vs Charlie, both lost.
 * Sides alternate blue/red from game 0 across the 8 default-range games (4 blue, 4 red).
 * Alpha Mid plays Azir every game and Alpha Top plays Gnar. Alpha bans Camille every game; Bravo bans Azir in games 0-2.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name, region) VALUES ($1,'Korea') RETURNING id`, [name])
  const [alpha, bravo, charlie] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [top, mid, sub, oppTop] = [await player('Alpha Top'), await player('Alpha Mid'), await player('Sub'), await player('Opp Top')]
  const champ = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])
  const [azir, gnar, camille, ornn] = [await champ('Azir'), await champ('Gnar'), await champ('Camille'), await champ('Ornn')]
  const tour = (name: string, split: string | null, intl: boolean, leagueId: number | null, start: string, end: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,2026,$3,'Regular season',$4,$5,$6) RETURNING id`,
      [name, leagueId, split, intl, start, end],
    )
  const spring = await tour('LCK 2026 Spring', 'Spring', false, lck, '2026-01-10', '2026-03-01')
  const summer = await tour('LCK 2026 Summer', 'Summer', false, lck, '2026-04-01', '2026-06-01')
  const worlds = await tour('Worlds 2026', null, true, null, '2026-10-01', '2026-11-01')

  const game = async (tournament: number, at: string, index: number, win: boolean, opp: number, replaceTop: boolean, oppBansAzir: boolean) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, played_at, length_sec) VALUES ($1,$2,$3,1800) RETURNING id`,
      [`T${++n}`, tournament, at],
    )
    const side = index % 2 === 0 ? 'blue' : 'red'
    const other = side === 'blue' ? 'red' : 'blue'
    await pool.query(
      `INSERT INTO team_game (game_id, team_id, side, win, kills, gold, dragons, barons, heralds, towers, void_grubs)
       VALUES ($1,$2,$3,$4,15,60000,3,1,1,8,2), ($1,$5,$6,$7,10,55000,2,0,0,3,1)`,
      [g, alpha, side, win, opp, other, !win],
    )
    await pool.query(
      `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists)
       VALUES ($1,$2,$3,$4,'Top',$5,$6,2,2,4), ($1,$7,$3,$8,'Mid',$5,$6,4,2,6), ($1,$9,$10,$11,'Top',$12,$13,1,3,2)`,
      [g, replaceTop ? sub : top, alpha, gnar, side, win, mid, azir, oppTop, opp, ornn, other, !win],
    )
    await pool.query(
      `INSERT INTO pick_ban (game_id, team_id, champion_id, action, draft_order) VALUES ($1,$2,$3,'ban',1)`,
      [g, alpha, camille],
    )
    if (oppBansAzir) {
      await pool.query(`INSERT INTO pick_ban (game_id, team_id, champion_id, action, draft_order) VALUES ($1,$2,$3,'ban',1)`, [g, opp, azir])
    }
  }
  await game(spring, '2026-02-01T10:00:00Z', 0, true, bravo, false, false)
  for (let i = 0; i < 6; i++) await game(summer, `2026-04-1${i}T10:00:00Z`, i, i < 4, bravo, i === 0, i < 3)
  for (let i = 6; i < 8; i++) await game(worlds, `2026-10-0${i}T10:00:00Z`, i, false, charlie, false, false)
})

afterAll(() => pool.end())

describe('GET /api/teams/:id', () => {
  it('resolves the default range (latest split plus internationals) and the team identity', async () => {
    const { body, status } = await api('/api/teams/Alpha')
    expect(status).toBe(200)
    expect(body.team).toMatchObject({ name: 'Alpha', region: 'Korea', league: 'LCK' })
    expect(body.range).toMatchObject({
      label: 'LCK 2026 Summer + Worlds 2026',
      isDefault: true,
      resolved: { league: 'LCK', year: 2026, split: 'Summer' },
    })
    expect(body.summary.games).toBe(8) // the Spring game is outside the window
    expect(body.summary.wins).toBe(4)
    expect(body.summary.winRate).toBeCloseTo(0.5)
  })

  it('computes team stats from the raw team rows', async () => {
    const { summary } = (await api('/api/teams/Alpha')).body
    expect(summary).toMatchObject({ blueGames: 4, blueWins: 2, redGames: 4, redWins: 2 })
    expect(summary.killsPerGame).toBeCloseTo(15)
    expect(summary.deathsPerGame).toBeCloseTo(10)
    expect(summary.goldPerMin).toBeCloseTo(2000)
    expect(summary.goldDiff).toBeCloseTo(5000)
    expect(summary.towersPerGame).toBeCloseTo(8)
    expect(summary.dragonsPerGame).toBeCloseTo(3)
    expect(summary.baronsPerGame).toBeCloseTo(1)
    expect(summary.avgGameLengthSec).toBeCloseTo(1800)
  })

  it('accepts a numeric id, filters by side and ignores the role filter', async () => {
    const byId = await api(`/api/teams/${(await api('/api/teams/Alpha')).body.team.id}`)
    expect(byId.body.team.name).toBe('Alpha')
    const blue = await api('/api/teams/Alpha?side=blue')
    expect(blue.body.summary.games).toBe(4)
    const role = await api('/api/teams/Alpha?role=Top')
    expect(role.body.summary.games).toBe(8)
  })

  it('explicit filters replace the default range, and domestic=true drops internationals', async () => {
    const spring = await api('/api/teams/Alpha?split=Spring&year=2026')
    expect(spring.body.range.isDefault).toBe(false)
    expect(spring.body.summary.games).toBe(1)
    const domestic = await api('/api/teams/Alpha?domestic=true')
    expect(domestic.body.summary.games).toBe(6)
  })

  it('404s for an unknown team', async () => {
    expect((await api('/api/teams/Nobody')).status).toBe(404)
  })
})

describe('GET /api/teams/:id/players, /draft, /opponents', () => {
  it('lists who played for the team with per-team stats, ordered by role then games', async () => {
    const { body } = await api('/api/teams/Alpha/players')
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alpha Top', 'Sub', 'Alpha Mid'])
    const mid = body.players[2]
    expect(mid).toMatchObject({ role: 'Mid', games: 8, wins: 4 })
    expect(mid.kda).toBeCloseTo(5) // (4 + 6) / 2
    expect(body.players[1]).toMatchObject({ games: 1, underMinSample: true })
  })

  it('returns picks with records, the team\'s own bans and bans against it', async () => {
    const { body } = await api('/api/teams/Alpha/draft')
    expect(body.picks[0]).toMatchObject({ champion: 'Azir', games: 8, wins: 4 })
    expect(body.picks[0].winRate).toBeCloseTo(0.5)
    expect(body.bans).toEqual([{ champion: 'Camille', games: 8, rate: 1 }])
    expect(body.bansAgainst).toEqual([{ champion: 'Azir', games: 3, rate: 0.375 }])
  })

  it('returns head-to-head records with the gold difference and honours the limit', async () => {
    const { body } = await api('/api/teams/Alpha/opponents')
    expect(body.opponents.map((o: { team: string }) => o.team)).toEqual(['Bravo', 'Charlie'])
    expect(body.opponents[0]).toMatchObject({ games: 6, wins: 4, losses: 2, underMinSample: false })
    expect(body.opponents[0].goldDiff).toBeCloseTo(5000)
    expect(body.opponents[1]).toMatchObject({ games: 2, wins: 0, underMinSample: true })
    expect((await api('/api/teams/Alpha/opponents?limit=1')).body.opponents).toHaveLength(1)
  })

  it('returns an empty payload when nothing matches', async () => {
    const { body, status } = await api('/api/teams/Alpha/players?year=2020')
    expect(status).toBe(200)
    expect(body).toMatchObject({ empty: true, players: [] })
  })
})

describe('GET /api/teams/:id/context', () => {
  it('returns the roster of the latest event, running events and results', async () => {
    const { body } = await api('/api/teams/Alpha/context')
    expect(body.team.name).toBe('Alpha')
    expect(body.league).toBe('LCK')
    expect(body.roster.every((p: { isViewed: boolean }) => p.isViewed === false)).toBe(true)
    expect(body.events.length).toBeGreaterThan(0)
  })
})
