import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * LCK 2026 Summer: Ace (6 games, 4/1/5 each: KDA 9, 5 wins) and Bob (6 games, 2/2/2: KDA 2, 2 wins),
 * Cy (4 games: under the 5-game minimum, never ranked).
 * LPL 2026 Split 3: Dan (5 games, 3/0/3, no deaths at all: KDA is then total kills + assists = 30, as on the
 * player page) and Eve (5 games, 1/4/1: KDA 0.5, vision never recorded).
 * LCK 2026 Summer Promotion (a qualifier, later start): Ace plays 3 more games, which must not count.
 * Worlds 2026 (international, after the splits): Ace plays 2 more games, 0/3/0, which count by default.
 * LCK 2025 Spring (older): Bob plays 5 games and would top the 2025 board.
 * MSI 2026 (international, ended before either split began): Fay plays 5 games, 5/1/5 each (KDA 10). The default
 * range takes every international of the newest year, so she is ranked by default.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)

let n = 0
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number

async function play(playerId: number, teamId: number, tournamentId: number, champion: number, o: {
  count: number; k: number; d: number; a: number; wins: number; vision: number | null; when: string
}) {
  for (let i = 0; i < o.count; i++) {
    const gameId = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, played_at, length_sec) VALUES ($1,$2,$3,1800) RETURNING id`,
      [`LB${++n}`, tournamentId, `${o.when}T1${i}:00:00Z`],
    )
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',$3)`, [gameId, teamId, i < o.wins])
    await pool.query(
      `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists, cs, damage, vision)
       VALUES ($1,$2,$3,$4,'Mid','blue',$5,$6,$7,$8,270,5400,$9)`,
      [gameId, playerId, teamId, champion, i < o.wins, o.k, o.d, o.a, o.vision],
    )
  }
}

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const lpl = await one(`INSERT INTO league (name, region) VALUES ('LPL','China') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [tA, tB, tC] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const champion = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  const tour = (page: string, leagueId: number | null, year: number, split: string | null, stage: string, intl: boolean, start: string, end: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [page, leagueId, year, split, stage, intl, start, end],
    )
  const summer = await tour('LCK 2026 Summer', lck, 2026, 'Summer', 'Regular season', false, '2026-04-01', '2026-06-01')
  const promo = await tour('LCK 2026 Summer Promotion', lck, 2026, 'Summer', 'Qualifier', false, '2026-07-01', '2026-07-20')
  const split3 = await tour('LPL 2026 Split 3', lpl, 2026, 'Split 3', 'Regular season', false, '2026-04-10', '2026-06-10')
  const worlds = await tour('Worlds 2026', null, 2026, null, 'Playoffs', true, '2026-10-01', '2026-11-01')
  const msi = await tour('MSI 2026', null, 2026, null, 'Playoffs', true, '2026-03-10', '2026-03-25')
  const spring25 = await tour('LCK 2025 Spring', lck, 2025, 'Spring', 'Regular season', false, '2025-01-15', '2025-03-30')

  const [ace, bob, cy, dan, eve, fay] = [await player('Ace'), await player('Bob'), await player('Cy'), await player('Dan'), await player('Eve'), await player('Fay')]
  await play(ace, tA, summer, champion, { count: 6, k: 4, d: 1, a: 5, wins: 5, vision: 45, when: '2026-04-10' })
  await play(bob, tB, summer, champion, { count: 6, k: 2, d: 2, a: 2, wins: 2, vision: 30, when: '2026-04-11' })
  await play(cy, tB, summer, champion, { count: 4, k: 9, d: 0, a: 9, wins: 4, vision: 30, when: '2026-04-12' })
  await play(dan, tC, split3, champion, { count: 5, k: 3, d: 0, a: 3, wins: 3, vision: 30, when: '2026-04-20' })
  await play(eve, tC, split3, champion, { count: 5, k: 1, d: 4, a: 1, wins: 1, vision: null, when: '2026-04-21' })
  await play(ace, tA, promo, champion, { count: 3, k: 20, d: 0, a: 20, wins: 3, vision: 45, when: '2026-07-05' })
  await play(ace, tA, worlds, champion, { count: 2, k: 0, d: 3, a: 0, wins: 0, vision: 45, when: '2026-10-05' })
  await play(fay, tC, msi, champion, { count: 5, k: 5, d: 1, a: 5, wins: 4, vision: 40, when: '2026-03-12' })
  await play(bob, tB, spring25, champion, { count: 5, k: 10, d: 1, a: 10, wins: 5, vision: 30, when: '2025-02-10' })
})

afterAll(() => pool.end())

const names = (body: { players: { name: string }[] }) => body.players.map((p) => p.name)

describe('GET /api/leaderboard/players (default range)', () => {
  it('uses each league\'s latest split plus internationals, ranked by KDA, and ignores qualifiers and older years', async () => {
    const { body, status } = await api('/api/leaderboard/players')
    expect(status).toBe(200)
    expect(body.range).toMatchObject({ isDefault: true, label: 'Latest split of each league, 2026 + internationals' })
    // Ace: 6 Summer + 2 Worlds games = 8; the 3 qualifier games (KDA 40) are excluded, so Ace is not far ahead.
    expect(names(body)).toEqual(['Dan', 'Fay', 'Ace', 'Bob', 'Eve'])
    expect(body.total).toBe(5)
    expect(body.empty).toBe(false)
    expect(body.minGames).toBe(5)
  })

  it('computes derived stats from raw columns', async () => {
    const { body } = await api('/api/leaderboard/players')
    const ace = body.players.find((p: { name: string }) => p.name === 'Ace')
    expect(ace.games).toBe(8)
    expect(ace.wins).toBe(5)
    expect(ace.winRate).toBeCloseTo(5 / 8)
    // (6 x 9 + 0) kills+assists over (6 x 1 + 2 x 3) deaths = 54 / 12
    expect(ace.kda).toBeCloseTo(4.5)
    expect(ace.damagePerMin).toBeCloseTo(180)
    expect(ace.csPerMin).toBeCloseTo(9)
    expect(ace.visionPerMin).toBeCloseTo(1.5)
    expect(ace.team).toBe('Alpha')
    expect(ace.league).toBe('LCK')
    expect(ace.role).toBe('Mid')
    expect(ace.rank).toBe(3) // behind Dan and Fay
  })

  it('treats a missing stat as N/A, never zero', async () => {
    const { body } = await api('/api/leaderboard/players')
    const eve = body.players.find((p: { name: string }) => p.name === 'Eve')
    expect(eve.visionPerMin).toBeNull()
    expect(eve.csPerMin).toBeCloseTo(9)
  })

  it('leaves out players under the 5-game minimum', async () => {
    const { body } = await api('/api/leaderboard/players')
    expect(names(body)).not.toContain('Cy')
  })

  it('domestic=true drops the international games', async () => {
    const { body } = await api('/api/leaderboard/players?domestic=true')
    expect(body.range.label).toBe('Latest split of each league, 2026')
    expect(names(body)).not.toContain('Fay') // her games are all at MSI
    const ace = body.players.find((p: { name: string }) => p.name === 'Ace')
    expect(ace.games).toBe(6)
    expect(ace.kda).toBeCloseTo(9)
    expect(names(body)).toEqual(['Dan', 'Ace', 'Bob', 'Eve'])
  })

  it('lists the league splits the default range resolved to', async () => {
    const { body } = await api('/api/leaderboard/players')
    expect(body.range.leagues).toEqual(
      expect.arrayContaining([
        { league: 'LCK', year: 2026, split: 'Summer' },
        { league: 'LPL', year: 2026, split: 'Split 3' },
      ]),
    )
    expect(body.range.resolved).toBeNull()
  })
})

describe('GET /api/leaderboard/players (filters, sorting, paging)', () => {
  it('explicit filters replace the default range', async () => {
    const { body } = await api('/api/leaderboard/players?league=LCK&year=2025')
    expect(body.range).toMatchObject({ isDefault: false, label: 'LCK 2025' })
    expect(names(body)).toEqual(['Bob'])
    expect(body.players[0].games).toBe(5)
  })

  it('includes qualifiers only when asked', async () => {
    const without = await api('/api/leaderboard/players?league=LCK&year=2026')
    const ace = without.body.players.find((p: { name: string }) => p.name === 'Ace')
    expect(ace.games).toBe(6) // league=LCK leaves out Worlds, which has no league
    const withQ = await api('/api/leaderboard/players?league=LCK&year=2026&qualifiers=true')
    expect(withQ.body.players.find((p: { name: string }) => p.name === 'Ace').games).toBe(9)
  })

  it('filters by role and returns an empty payload when nothing is ranked', async () => {
    const { body, status } = await api('/api/leaderboard/players?role=Top')
    expect(status).toBe(200)
    expect(body.empty).toBe(true)
    expect(body.players).toEqual([])
  })

  it('sorts by any allowed column in either direction, with missing values last', async () => {
    const asc = await api('/api/leaderboard/players?sort=visionPerMin&dir=asc')
    expect(names(asc.body)).toEqual(['Bob', 'Dan', 'Fay', 'Ace', 'Eve']) // Bob and Dan tie at 1.0; more games ranks first
    const desc = await api('/api/leaderboard/players?sort=visionPerMin&dir=desc')
    expect(names(desc.body)).toEqual(['Ace', 'Fay', 'Bob', 'Dan', 'Eve'])
    const games = await api('/api/leaderboard/players?sort=games')
    expect(names(games.body)[0]).toBe('Ace')
  })

  it('pages results and numbers ranks across pages', async () => {
    const p2 = await api('/api/leaderboard/players?pageSize=2&page=2')
    expect(p2.body.total).toBe(5)
    expect(p2.body.players.map((p: { rank: number }) => p.rank)).toEqual([3, 4])
    expect(names(p2.body)).toEqual(['Ace', 'Bob'])
  })

  it('rejects an unknown sort column', async () => {
    const { status } = await api('/api/leaderboard/players?sort=name;drop')
    expect(status).toBe(400)
  })
})

describe('all-time response cache', () => {
  // A separate app that reads the sync stamp on every call, so the test can move it.
  const cached = request(createApp({ cache: { versionTtlMs: 0 } }))
  const boardQueries = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('FROM player_game pgm')).length

  it('answers a repeated all-time request from memory and recomputes after the sync stamps new data', async () => {
    await pool.query(`INSERT INTO meta (key, value) VALUES ('last_synced_at', 'sync-1') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`)
    const spy = vi.spyOn(pool, 'query')
    try {
      const first = await cached.get('/api/leaderboard/players?range=all')
      expect(first.status).toBe(200)
      expect(first.body.range.label).toBe('All time')
      const second = await cached.get('/api/leaderboard/players?range=all')
      expect(second.body).toEqual(first.body)
      expect(boardQueries(spy)).toBe(1)

      // A different page is a different key.
      await cached.get('/api/leaderboard/players?range=all&page=2&pageSize=2')
      expect(boardQueries(spy)).toBe(2)

      // The nightly sync stamps a new value: the next request recomputes.
      await pool.query(`UPDATE meta SET value = 'sync-2' WHERE key = 'last_synced_at'`)
      await cached.get('/api/leaderboard/players?range=all')
      expect(boardQueries(spy)).toBe(3)
    } finally {
      spy.mockRestore()
    }
  })

  it('does not cache the default range or ranges with a real filter', async () => {
    const spy = vi.spyOn(pool, 'query')
    try {
      await cached.get('/api/leaderboard/players')
      await cached.get('/api/leaderboard/players')
      await cached.get('/api/leaderboard/players?range=all&year=2026')
      await cached.get('/api/leaderboard/players?range=all&year=2026')
      expect(boardQueries(spy)).toBe(4)
    } finally {
      spy.mockRestore()
    }
  })
})
