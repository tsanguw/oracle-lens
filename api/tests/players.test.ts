import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Fixture for player "Pee" (Mid, Team A; teammate "Tee"). Every game: Pee 4/2/6, 1800s long, 6000 dmg
 * (Tee 4000), 12000 gold (Tee 8000), 300 CS, team kills 20. So KDA = 5, KP = 0.5, DPM = 200,
 * damage share = 0.6, GPM = 400, CS/min = 10. Vision is only recorded in the six Summer Azir games.
 *
 *  Spring  (LCK, 2026): 2 games Azir, both wins
 *  Summer  (LCK, 2026): 6 games Azir (4 wins) + 2 games Orianna (1 win)
 *  Worlds  (international, after Summer): 2 games Orianna, both losses
 *
 * Opponents (lane matchups and bans):
 *  - Mid opponent every game has 11000 gold, so Pee's gold diff is +1000 everywhere.
 *    Spring and Summer: "Rival" (Team B). Worlds: "Foreign" (Team C).
 *    Opposing champion: Ahri in Spring and Summer Azir games, Yone in Summer Orianna and Worlds games.
 *  - A Jungle opponent ("OffRole") plays every game and must never show up as a lane matchup.
 *  - Bans: the opposing team bans Azir in Summer Azir games and Spring games, Orianna in Summer
 *    game 6 and in both Worlds games, and Camille every game (never played by Pee: must be excluded).
 *    Team A (Pee's own team) bans Orianna in Summer game 7 (must not count).
 */

const app = createApp()
const api = (path: string) => request(app).get(path)

interface Ids {
  pee: number
  tee: number
  teamA: number
  offRole: number
  camille: number
}

let n = 0
async function addGame(opts: {
  tournamentId: number
  playedAt: string
  patch: string
  champion: number
  win: boolean
  side: 'blue' | 'red'
  vision: number | null
  ids: Ids
  opp: { teamId: number; midId: number; midChampion: number }
  oppBans: number[]
  ownBans?: number[]
}) {
  const { ids, opp } = opts
  const oppSide = opts.side === 'blue' ? 'red' : 'blue'
  const g = await pool.query(
    `INSERT INTO game (leaguepedia_id, tournament_id, patch, played_at, length_sec)
     VALUES ($1,$2,$3,$4,1800) RETURNING id`,
    [`G${++n}`, opts.tournamentId, opts.patch, opts.playedAt],
  )
  const gameId = g.rows[0].id
  await pool.query(
    `INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,$3,$4,20), ($1,$5,$6,$7,15)`,
    [gameId, ids.teamA, opts.side, opts.win, opp.teamId, oppSide, !opts.win],
  )
  await pool.query(
    `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win,
       kills, deaths, assists, cs, gold, damage, vision)
     VALUES ($1,$2,$3,$4,'Mid',$5,$6,4,2,6,300,12000,6000,$7),
            ($1,$8,$3,$4,'Top',$5,$6,1,1,1,250,8000,4000,NULL)`,
    [gameId, ids.pee, ids.teamA, opts.champion, opts.side, opts.win, opts.vision, ids.tee],
  )
  // Opposing team: a Mid (the lane opponent) and a Jungle (different role, so never a matchup).
  await pool.query(
    `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, gold)
     VALUES ($1,$2,$3,$4,'Mid',$5,$6,11000),
            ($1,$7,$3,$8,'Jungle',$5,$6,9000)`,
    [gameId, opp.midId, opp.teamId, opp.midChampion, oppSide, !opts.win, ids.offRole, ids.camille],
  )
  const bans = [
    ...opts.oppBans.map((c, i) => [opp.teamId, c, i + 1]),
    ...(opts.ownBans ?? []).map((c, i) => [ids.teamA, c, i + 1]),
  ]
  for (const [teamId, championId, slot] of bans) {
    await pool.query(
      `INSERT INTO game_ban (game_id, team_id, champion_id, draft_order) VALUES ($1,$2,$3,$4)`,
      [gameId, teamId, championId, slot],
    )
  }
}

beforeAll(async () => {
  await resetDb()
  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
  const league = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const player = (name: string, nat: string | null = null) =>
    one(`INSERT INTO player (name, display_name, nationality) VALUES ($1,$1,$2) RETURNING id`, [name, nat])
  const champion = (name: string) => one(`INSERT INTO champion (name) VALUES ($1) RETURNING id`, [name])

  const teamA = await team('Team A')
  const teamB = await team('Team B')
  const teamC = await team('Team C')
  const pee = await player('Pee', 'South Korea')
  const tee = await player('Tee')
  const rival = await player('Rival')
  const foreign = await player('Foreign')
  const offRole = await player('OffRole')
  const azir = await champion('Azir')
  const orianna = await champion('Orianna')
  const ahri = await champion('Ahri')
  const yone = await champion('Yone')
  const camille = await champion('Camille')
  const ids: Ids = { pee, tee, teamA, offRole, camille }

  const tour = (page: string, name: string, leagueId: number | null, split: string | null, intl: boolean, start: string, end: string) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, is_international, start_date, end_date)
       VALUES ($1,$2,$3,2026,$4,$5,$6,$7) RETURNING id`,
      [page, name, leagueId, split, intl, start, end],
    )
  const spring = await tour('LCK/2026 Season/Spring', 'LCK 2026 Spring', league, 'Spring', false, '2026-01-14', '2026-03-01')
  const summer = await tour('LCK/2026 Season/Summer', 'LCK 2026 Summer', league, 'Summer', false, '2026-04-01', '2026-05-31')
  const worlds = await tour('Worlds/2026/Main Event', 'Worlds 2026 Main Event', null, null, true, '2026-10-01', '2026-11-01')

  for (let i = 0; i < 2; i++)
    await addGame({
      tournamentId: spring, playedAt: `2026-02-0${i + 1}T10:00:00Z`, patch: '26.03', champion: azir,
      win: true, side: 'blue', vision: null, ids,
      opp: { teamId: teamB, midId: rival, midChampion: ahri }, oppBans: [azir, camille],
    })
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
      opp: { teamId: teamB, midId: rival, midChampion: i < 6 ? ahri : yone },
      oppBans: i < 6 ? [azir, camille] : i === 6 ? [orianna, camille] : [camille],
      ownBans: i === 7 ? [orianna] : [],
    })
  for (let i = 0; i < 2; i++)
    await addGame({
      tournamentId: worlds, playedAt: `2026-10-0${i + 5}T10:00:00Z`, patch: '26.19', champion: orianna,
      win: false, side: 'blue', vision: null, ids,
      opp: { teamId: teamC, midId: foreign, midChampion: yone }, oppBans: [orianna, camille],
    })

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

describe('range=all (all time)', () => {
  it('includes every game and labels the range "All time"', async () => {
    const { body } = await api('/api/players/Pee?range=all')
    expect(body.range).toMatchObject({ label: 'All time', description: 'Tier 1 leagues and internationals only', isDefault: false, domesticOnly: false, resolved: null })
    // 2 Spring + 8 Summer + 2 Worlds; the default range leaves Spring out.
    expect(body.summary.games).toBe(12)
    expect(body.summary.wins).toBe(7)
  })

  it('layers domestic=true on top', async () => {
    const { body } = await api('/api/players/Pee?range=all&domestic=true')
    expect(body.range).toMatchObject({ label: 'All time', description: 'Tier 1 leagues only, domestic only', domesticOnly: true })
    expect(body.summary.games).toBe(10)
  })

  it('layers side on top', async () => {
    expect((await api('/api/players/Pee?range=all&side=red')).body.summary.games).toBe(4)
  })

  it('yields to any real range filter', async () => {
    const { body } = await api('/api/players/Pee?range=all&year=2026&split=Spring')
    expect(body.range).toMatchObject({ label: '2026 Spring', isDefault: false })
    expect(body.summary.games).toBe(2)
    expect((await api('/api/players/Pee?range=all&patch=26.14')).body.summary.games).toBe(4)
  })

  it('applies to the champion pool, matchups and target bans too', async () => {
    const pool_ = await api('/api/players/Pee/champions?range=all')
    expect(pool_.body.range.label).toBe('All time')
    expect(pool_.body.champions.reduce((a: number, c: { games: number }) => a + c.games, 0)).toBe(12)
    expect((await api('/api/players/Pee/matchups/players?range=all')).body.range.label).toBe('All time')
    expect((await api('/api/players/Pee/target-bans?range=all')).body.range.label).toBe('All time')
  })

  it('leaves URLs without range, and unknown range values, rejected or unchanged', async () => {
    expect((await api('/api/players/Pee')).body.range.isDefault).toBe(true)
    expect((await api('/api/players/Pee?range=everything')).status).toBe(400)
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

describe('GET /api/players/:id/matchups/players', () => {
  it('records Pee against each opposing laner in the same role', async () => {
    const { body, status } = await api('/api/players/Pee/matchups/players')
    expect(status).toBe(200)
    expect(body.empty).toBe(false)
    const [rival, foreign] = body.matchups
    // Default range: 8 Summer games vs Rival (5-3), 2 Worlds games vs Foreign (0-2).
    expect(rival).toMatchObject({ page: 'Rival', name: 'Rival', team: 'Team B', games: 8, wins: 5, losses: 3, underMinSample: false })
    expect(rival.winRate).toBeCloseTo(5 / 8)
    expect(foreign).toMatchObject({ page: 'Foreign', team: 'Team C', games: 2, wins: 0, losses: 2, underMinSample: true })
    expect(foreign.winRate).toBe(0)
  })

  it('averages the final gold difference', async () => {
    const { matchups } = (await api('/api/players/Pee/matchups/players')).body
    expect(matchups[0].goldDiff).toBeCloseTo(1000) // 12000 - 11000
  })

  it('never counts opponents who played a different role', async () => {
    const { matchups } = (await api('/api/players/Pee/matchups/players')).body
    expect(matchups.map((m: { page: string }) => m.page)).not.toContain('OffRole')
  })

  it('respects domestic=true and the limit parameter', async () => {
    const domestic = (await api('/api/players/Pee/matchups/players?domestic=true')).body
    expect(domestic.matchups).toHaveLength(1)
    expect(domestic.matchups[0]).toMatchObject({ page: 'Rival', games: 8 })
    const limited = (await api('/api/players/Pee/matchups/players?limit=1')).body
    expect(limited.matchups).toHaveLength(1)
  })

  it('rejects an out-of-range limit', async () => {
    expect((await api('/api/players/Pee/matchups/players?limit=500')).status).toBe(400)
  })
})

describe('GET /api/players/:id/matchups/champions', () => {
  it('records Pee against the champion the lane opponent played', async () => {
    const { body } = await api('/api/players/Pee/matchups/champions')
    expect(body.empty).toBe(false)
    const [ahri, yone] = body.matchups
    // Ahri: Summer Azir games (4-2). Yone: 2 Summer Orianna games (1-1) + 2 Worlds (0-2) = 1-3.
    expect(ahri).toMatchObject({ champion: 'Ahri', games: 6, wins: 4, losses: 2, underMinSample: false })
    expect(yone).toMatchObject({ champion: 'Yone', games: 4, wins: 1, losses: 3, underMinSample: true })
    expect(ahri.goldDiff).toBeCloseTo(1000)
  })

  it('never lists the off-role opponent champion', async () => {
    const { matchups } = (await api('/api/players/Pee/matchups/champions')).body
    // The Jungle opponent plays Camille every game; Camille is not a Mid-lane opponent champion.
    expect(matchups.map((m: { champion: string }) => m.champion)).not.toContain('Camille')
  })

  it('is empty when filters match nothing', async () => {
    const { body } = await api('/api/players/Pee/matchups/champions?year=2019')
    expect(body.empty).toBe(true)
    expect(body.matchups).toEqual([])
  })
})

describe('GET /api/players/:id/target-bans', () => {
  it('ranks opposing bans of champions Pee plays by share of his games', async () => {
    const { body, status } = await api('/api/players/Pee/target-bans')
    expect(status).toBe(200)
    // Default range is 10 games. Azir banned by the opponent in 6 Summer games; Orianna in
    // Summer game 6 plus both Worlds games = 3.
    expect(body.bans).toHaveLength(2)
    expect(body.bans[0]).toMatchObject({ champion: 'Azir', games: 6 })
    expect(body.bans[0].rate).toBeCloseTo(0.6)
    expect(body.bans[1]).toMatchObject({ champion: 'Orianna', games: 3 })
    expect(body.bans[1].rate).toBeCloseTo(0.3)
  })

  it('excludes meta bans of champions the player does not play', async () => {
    const { bans } = (await api('/api/players/Pee/target-bans')).body
    expect(bans.map((b: { champion: string }) => b.champion)).not.toContain('Camille')
  })

  it("does not count bans made by the player's own team", async () => {
    // Team A banned Orianna in Summer game 7; Orianna must still be 3 games, not 4.
    const { bans } = (await api('/api/players/Pee/target-bans')).body
    expect(bans.find((b: { champion: string }) => b.champion === 'Orianna').games).toBe(3)
  })

  it('uses the domestic range denominator with domestic=true', async () => {
    const { bans } = (await api('/api/players/Pee/target-bans?domestic=true')).body
    expect(bans[0]).toMatchObject({ champion: 'Azir', games: 6 })
    expect(bans[0].rate).toBeCloseTo(6 / 8)
    expect(bans[1]).toMatchObject({ champion: 'Orianna', games: 1 })
    expect(bans[1].rate).toBeCloseTo(1 / 8)
  })

  it('is empty when filters match nothing', async () => {
    const { body } = await api('/api/players/Pee/target-bans?year=2019')
    expect(body.empty).toBe(true)
    expect(body.bans).toEqual([])
  })
})

/*
 * 2025 LTA: North and South have their own split pages, but the playoffs are one combined event with
 * teams from both conferences. Each team's games in that event count toward its own conference's
 * league (Team X -> LCS, Team Y -> CBLOL) via tournament_team_league.
 *
 *  LTA North 2025 Split 1 (LCS):    Xan plays 2 games
 *  LTA South 2025 Split 1 (CBLOL):  Yan plays 2 games
 *  LTA 2025 Split 1 Playoffs (no league): Xan and Yan play 2 games against each other,
 *                                          and Zed (team with no league mapping) plays 1 game
 */
describe('cross-conference (multi-league) tournaments', () => {
  beforeAll(async () => {
    const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
    const lcs = await one(`INSERT INTO league (name, region) VALUES ('LCS','North America') RETURNING id`)
    const cblol = await one(`INSERT INTO league (name, region) VALUES ('CBLOL','Brazil') RETURNING id`)
    const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
    const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
    const teamX = await team('Team X')
    const teamY = await team('Team Y')
    const teamZ = await team('Team Z')
    const xan = await player('Xan')
    const yan = await player('Yan')
    const zed = await player('Zed')
    const azir = (await pool.query(`SELECT id FROM champion WHERE name = 'Azir'`)).rows[0].id as number

    const tour = (page: string, name: string, leagueId: number | null, start: string, end: string) =>
      one(
        `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, is_international, start_date, end_date)
         VALUES ($1,$2,$3,2025,'Split 1',false,$4,$5) RETURNING id`,
        [page, name, leagueId, start, end],
      )
    const north = await tour('LTA North/2025/Split 1', 'LTA North 2025 Split 1', lcs, '2025-01-25', '2025-02-09')
    const south = await tour('LTA South/2025/Split 1', 'LTA South 2025 Split 1', cblol, '2025-01-25', '2025-02-09')
    const playoffs = await tour('LTA/2025/Split 1 Playoffs', 'LTA 2025 Split 1 Playoffs', null, '2025-02-15', '2025-02-23')
    await pool.query(
      `INSERT INTO tournament_team_league (tournament_id, team_id, league_id) VALUES ($1,$2,$3),($1,$4,$5)`,
      [playoffs, teamX, lcs, teamY, cblol],
    )

    let g = 0
    const game = async (tournamentId: number, day: string, rows: [number, number][]) => {
      const id = await one(
        `INSERT INTO game (leaguepedia_id, tournament_id, patch, played_at, length_sec)
         VALUES ($1,$2,'25.01',$3,1800) RETURNING id`,
        [`LTA${++g}`, tournamentId, `2025-${day}T10:00:00Z`],
      )
      for (const [playerId, teamId] of rows) {
        await pool.query(
          `INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true) ON CONFLICT DO NOTHING`,
          [id, teamId],
        )
        await pool.query(
          `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists)
           VALUES ($1,$2,$3,$4,'Mid','blue',true,1,1,1)`,
          [id, playerId, teamId, azir],
        )
      }
    }
    for (const day of ['01-26', '01-27']) await game(north, day, [[xan, teamX]])
    for (const day of ['01-26', '01-27']) await game(south, day, [[yan, teamY]])
    for (const day of ['02-16', '02-17']) await game(playoffs, day, [[xan, teamX], [yan, teamY]])
    await game(playoffs, '02-18', [[zed, teamZ]])
  })

  const games = async (path: string) => (await api(path)).body.summary?.games ?? 0

  it("counts a team's cross-conference games toward its own conference league", async () => {
    // Default range = the player's most recent split in their own league: 2 regular + 2 playoff games.
    const xan = (await api('/api/players/Xan')).body
    expect(xan.range.label).toBe('LCS 2025 Split 1')
    expect(xan.summary.games).toBe(4)
    const yan = (await api('/api/players/Yan')).body
    expect(yan.range.label).toBe('CBLOL 2025 Split 1')
    expect(yan.summary.games).toBe(4)
  })

  it('puts each game in exactly the right league when filtering', async () => {
    expect(await games('/api/players/Xan?league=LCS')).toBe(4)
    expect(await games('/api/players/Xan?league=CBLOL')).toBe(0)
    expect(await games('/api/players/Yan?league=CBLOL')).toBe(4)
    expect(await games('/api/players/Yan?league=LCS')).toBe(0)
  })

  it('counts the same cross-conference game in both leagues (once per team)', async () => {
    // The two playoff games contain Xan (LCS) and Yan (CBLOL): each side sees them in its own league.
    expect(await games('/api/players/Xan?league=LCS&split=Split 1')).toBe(4)
    expect(await games('/api/players/Yan?league=CBLOL&split=Split 1')).toBe(4)
  })

  it('leaves games of an unmapped team out of every league', async () => {
    expect(await games('/api/players/Zed?league=LCS')).toBe(0)
    expect(await games('/api/players/Zed?league=CBLOL')).toBe(0)
    // With no filters the player still gets a page: it falls back to their latest tournament.
    const zed = (await api('/api/players/Zed')).body
    expect(zed.range.label).toBe('LTA 2025 Split 1 Playoffs')
    expect(zed.summary.games).toBe(1)
  })

  it('applies to champions, matchups and bans endpoints through the same scope', async () => {
    const champs = (await api('/api/players/Xan/champions?league=CBLOL')).body
    expect(champs.empty).toBe(true)
    const own = (await api('/api/players/Xan/champions?league=LCS')).body
    expect(own.champions[0]).toMatchObject({ champion: 'Azir', games: 4 })
  })
})

describe('other endpoints', () => {
  it('404s for an unknown player on every player endpoint', async () => {
    for (const path of ['', '/champions', '/matchups/players', '/matchups/champions', '/target-bans']) {
      expect((await api(`/api/players/Nobody${path}`)).status).toBe(404)
    }
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
