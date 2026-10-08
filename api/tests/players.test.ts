import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'

/*
 * Fixture for player "Pee" (teammate "Tee"). Every game: Pee 4/2/6, 1800s long, 6000 dmg (Tee 4000),
 * 12000 gold (Tee 8000), 300 CS, team kills 20. So KDA = 5, KP = 0.5, DPM = 200, damage share = 0.6,
 * GPM = 400, CS/min = 10. Vision is only recorded in the six Summer Azir games (60 each).
 *
 *  Spring  (LCK, 2026): 2 games Azir, both wins
 *  Summer  (LCK, 2026): 6 games Azir (4 wins) + 2 games Orianna (1 win)
 *  Worlds  (international, after Summer): 2 games Orianna, both losses
 */

const app = createApp()
const api = (path: string) => request(app).get(path)

let n = 0
async function addGame(opts: {
  tournamentId: number
  playedAt: string
  patch: string
  champion: number
  win: boolean
  side: 'blue' | 'red'
  vision: number | null
  ids: { pee: number; tee: number; teamA: number }
}) {
  const { ids } = opts
  const g = await pool.query(
    `INSERT INTO game (leaguepedia_id, tournament_id, patch, played_at, length_sec)
     VALUES ($1,$2,$3,$4,1800) RETURNING id`,
    [`G${++n}`, opts.tournamentId, opts.patch, opts.playedAt],
  )
  const gameId = g.rows[0].id
  await pool.query(
    `INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,$3,$4,20)`,
    [gameId, ids.teamA, opts.side, opts.win],
  )
  await pool.query(
    `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win,
       kills, deaths, assists, cs, gold, damage, vision)
     VALUES ($1,$2,$3,$4,'Mid',$5,$6,4,2,6,300,12000,6000,$7),
            ($1,$8,$3,$4,'Top',$5,$6,1,1,1,250,8000,4000,NULL)`,
    [gameId, ids.pee, ids.teamA, opts.champion, opts.side, opts.win, opts.vision, ids.tee],
  )
}

beforeAll(async () => {
  const league = (await pool.query(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)).rows[0].id
  const teamA = (await pool.query(`INSERT INTO team (name) VALUES ('Team A') RETURNING id`)).rows[0].id
  const pee = (await pool.query(`INSERT INTO player (name, display_name, nationality) VALUES ('Pee','Pee','South Korea') RETURNING id`)).rows[0].id
  const tee = (await pool.query(`INSERT INTO player (name, display_name) VALUES ('Tee','Tee') RETURNING id`)).rows[0].id
  const azir = (await pool.query(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)).rows[0].id
  const orianna = (await pool.query(`INSERT INTO champion (name) VALUES ('Orianna') RETURNING id`)).rows[0].id
  const ids = { pee, tee, teamA }

  const tour = async (page: string, name: string, leagueId: number | null, split: string | null, intl: boolean, start: string, end: string) =>
    (await pool.query(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, is_international, start_date, end_date)
       VALUES ($1,$2,$3,2026,$4,$5,$6,$7) RETURNING id`,
      [page, name, leagueId, split, intl, start, end],
    )).rows[0].id as number
  const spring = await tour('LCK/2026 Season/Spring', 'LCK 2026 Spring', league, 'Spring', false, '2026-01-14', '2026-03-01')
  const summer = await tour('LCK/2026 Season/Summer', 'LCK 2026 Summer', league, 'Summer', false, '2026-04-01', '2026-05-31')
  const worlds = await tour('Worlds/2026/Main Event', 'Worlds 2026 Main Event', null, null, true, '2026-10-01', '2026-11-01')

  for (let i = 0; i < 2; i++)
    await addGame({ tournamentId: spring, playedAt: `2026-02-0${i + 1}T10:00:00Z`, patch: '26.03', champion: azir, win: true, side: 'blue', vision: null, ids })
  for (let i = 0; i < 8; i++)
    await addGame({
      tournamentId: summer,
      playedAt: `2026-04-${String(i + 10).padStart(2, '0')}T10:00:00Z`,
      patch: i < 4 ? '26.14' : '26.15',
      champion: i < 6 ? azir : orianna,
      win: i < 4 || i === 6,
      side: i % 2 === 0 ? 'blue' : 'red',
      vision: i < 6 ? 60 : null,
      ids,
    })
  for (let i = 0; i < 2; i++)
    await addGame({ tournamentId: worlds, playedAt: `2026-10-0${i + 5}T10:00:00Z`, patch: '26.19', champion: orianna, win: false, side: 'blue', vision: null, ids })

  await pool.query(`INSERT INTO meta (key, value) VALUES ('last_synced_at', '2026-10-08T21:29:11Z')`)
})

afterAll(() => pool.end())

describe('GET /api/players/:id (default range)', () => {
  it('resolves the most recent split plus internationals and excludes older splits', async () => {
    const { body, status } = await api('/api/players/Pee')
    expect(status).toBe(200)
    expect(body.range).toMatchObject({
      label: 'LCK 2026 Summer + Worlds 2026 Main Event',
      description: 'Most recent split, internationals included',
      isDefault: true,
      domesticOnly: false,
      resolved: { league: 'LCK', year: 2026, split: 'Summer' },
    })
    // 8 Summer + 2 Worlds; the 2 Spring games are outside the window.
    expect(body.summary.games).toBe(10)
    expect(body.summary.wins).toBe(5)
    expect(body.summary.losses).toBe(5)
    expect(body.summary.winRate).toBeCloseTo(0.5)
  })

  it('computes derived stats from raw columns', async () => {
    const { summary } = (await api('/api/players/Pee')).body
    expect(summary.kills).toBeCloseTo(4)
    expect(summary.deaths).toBeCloseTo(2)
    expect(summary.assists).toBeCloseTo(6)
    expect(summary.kda).toBeCloseTo(5)
    expect(summary.killParticipation).toBeCloseTo(0.5)
    expect(summary.damagePerMin).toBeCloseTo(200)
    expect(summary.damageShare).toBeCloseTo(0.6)
    expect(summary.goldPerMin).toBeCloseTo(400)
    expect(summary.goldShare).toBeCloseTo(0.6)
    expect(summary.csPerMin).toBeCloseTo(10)
    expect(summary.championPool).toBe(2)
    expect(summary.avgGameLengthSec).toBeCloseTo(1800)
  })

  it('excludes NULL stats from averages instead of treating them as zero', async () => {
    const { summary } = (await api('/api/players/Pee')).body
    // 6 games x 60 vision over 6 x 30 min = 2.0; counting NULLs as 0 over all 10 games would give 1.2.
    expect(summary.visionPerMin).toBeCloseTo(2)
    // first_blood is NULL in every row, so there is no rate to report (N/A in the UI).
    expect(summary.firstBloodRate).toBeNull()
  })

  it('splits record by side', async () => {
    const { summary } = (await api('/api/players/Pee')).body
    expect(summary.blueGames + summary.redGames).toBe(10)
    expect(summary.redGames).toBe(4)
    expect(summary.redWins).toBe(2) // red games are Summer i=1,3,5,7 -> wins at i=1,3 only
    expect(summary.blueWins).toBe(3) // blue: Summer i=0,2,4,6 -> wins at 0,2,6; Worlds both lost
  })

  it('returns profile identity for the range', async () => {
    const { player } = (await api('/api/players/Pee')).body
    expect(player).toMatchObject({ name: 'Pee', displayName: 'Pee', nationality: 'South Korea', role: 'Mid', team: 'Team A', league: 'LCK' })
  })

  it('narrows to the domestic split with domestic=true', async () => {
    const { body } = await api('/api/players/Pee?domestic=true')
    expect(body.range).toMatchObject({ label: 'LCK 2026 Summer', domesticOnly: true, description: 'Most recent split, domestic only' })
    expect(body.summary.games).toBe(8)
    expect(body.summary.wins).toBe(5)
  })

  it('accepts a numeric player id', async () => {
    const { rows } = await pool.query(`SELECT id FROM player WHERE name = 'Pee'`)
    const { body, status } = await api(`/api/players/${rows[0].id}`)
    expect(status).toBe(200)
    expect(body.player.name).toBe('Pee')
  })
})

describe('explicit filters', () => {
  it('replace the default range', async () => {
    const { body } = await api('/api/players/Pee?year=2026&split=Spring')
    expect(body.range.isDefault).toBe(false)
    expect(body.summary.games).toBe(2)
    expect(body.summary.wins).toBe(2)
  })

  it('filter by patch, side and league', async () => {
    expect((await api('/api/players/Pee?patch=26.14')).body.summary.games).toBe(4)
    expect((await api('/api/players/Pee?league=LCK&side=red')).body.summary.games).toBe(4)
    // league=LCK excludes internationals (no league), so Worlds games drop out.
    expect((await api('/api/players/Pee?league=LCK')).body.summary.games).toBe(10)
  })

  it('returns an empty (not an error) result when nothing matches', async () => {
    const { body, status } = await api('/api/players/Pee?year=2019')
    expect(status).toBe(200)
    expect(body.empty).toBe(true)
    expect(body.summary).toBeNull()
    expect(body.player.name).toBe('Pee')
  })

  it('rejects invalid query parameters with 400', async () => {
    const res = await api('/api/players/Pee?side=green')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/players/:id/champions', () => {
  it('lists every champion and flags those under 5 games', async () => {
    const { body } = await api('/api/players/Pee/champions')
    expect(body.empty).toBe(false)
    const [azir, orianna] = body.champions
    // Default range: Azir 6 games (4-2), Orianna 2 Summer + 2 Worlds = 4 games (1-3).
    expect(azir).toMatchObject({ champion: 'Azir', games: 6, wins: 4, losses: 2, underMinSample: false })
    expect(orianna).toMatchObject({ champion: 'Orianna', games: 4, wins: 1, losses: 3, underMinSample: true })
    expect(azir.winRate).toBeCloseTo(4 / 6)
    expect(azir.kda).toBeCloseTo(5)
    expect(azir.csPerMin).toBeCloseTo(10)
    expect(azir.damagePerMin).toBeCloseTo(200)
  })

  it('keeps under-5-game champions in the response (not dropped)', async () => {
    const { body } = await api('/api/players/Pee/champions?domestic=true')
    expect(body.champions.map((c: { champion: string }) => c.champion)).toEqual(['Azir', 'Orianna'])
    expect(body.champions[1]).toMatchObject({ games: 2, underMinSample: true })
  })

  it('is empty when filters match nothing', async () => {
    const { body } = await api('/api/players/Pee/champions?year=2019')
    expect(body.empty).toBe(true)
    expect(body.champions).toEqual([])
  })
})

describe('other endpoints', () => {
  it('404s for an unknown player on both player endpoints', async () => {
    expect((await api('/api/players/Nobody')).status).toBe(404)
    expect((await api('/api/players/Nobody/champions')).status).toBe(404)
  })

  it('serves the last sync time', async () => {
    const { body } = await api('/api/meta/last-updated')
    expect(body.lastUpdated).toBe('2026-10-08T21:29:11.000Z')
  })

  it('lists filter options', async () => {
    const { body } = await api('/api/filters')
    expect(body.leagues).toContain('LCK')
    expect(body.years).toContain(2026)
    expect(body.splits).toEqual(expect.arrayContaining(['Spring', 'Summer']))
    expect(body.patches).toContain('26.14')
  })
})
