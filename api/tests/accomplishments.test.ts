import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * "Star" plays for Alpha everywhere; "Underdog" plays for Bravo, who only get to Worlds 2025 through its play-in.
 *  - Worlds 2023 and 2024: Alpha 1st (so Star's best Worlds finish is a tie). Worlds 2025 (+ its Play-In): Alpha 3-4th, Bravo 9-12th. MSI 2025: Alpha 2nd. First Stand: never.
 *  - LCK: playoffs won in 2025 (Spring, Summer) and 2026 (Road to MSI, Season Playoffs); the 2025 regular season won (not shown).
 *  - Left out: the 2025 Regional Finals (a qualifier), the playoffs shared by two leagues, and the 2024 playoffs Alpha won
 *    without Star playing a game.
 *  - "Swapper" won an LCK playoffs for Alpha in 2025, then an LCS playoffs and was runner-up in the next one for Delta in
 *    2026: two regions, each with its own counts.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const lcs = await one(`INSERT INTO league (name, region) VALUES ('LCS','North America') RETURNING id`)
  const [alpha, bravo, delta] = [await team('Alpha'), await team('Bravo'), await team('Delta')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const [star, underdog, swapper] = [await player('Star'), await player('Underdog'), await player('Swapper')]
  await player('Newcomer') // no games at all
  const champion = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)

  let day = 0
  const tour = (page: string, name: string, stage: string, international: boolean, year: number, league = lck) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$2,$3,$4,'Summer',$5,$6,$7,$7) RETURNING id`,
      [page, name, international ? null : league, year, stage, international, `${year}-01-${String(++day).padStart(2, '0')}`],
    )
  const play = async (tournament: number, teamId: number, playerId: number) => {
    const s = await one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id) VALUES ($1,$2,$2,$2,'1-0',1,$3) RETURNING id`,
      [tournament, teamId, `S${++n}`],
    )
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, series_id, played_at, length_sec) VALUES ($1,$2,$3,now(),1800) RETURNING id`,
      [`G${++n}`, tournament, s],
    )
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true)`, [g, teamId])
    await pool.query(
      `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,'Mid','blue',true)`,
      [g, playerId, teamId, champion],
    )
  }
  const place = (tournament: number, teamId: number, text: string) =>
    pool.query(`INSERT INTO tournament_result (tournament_id, team_id, place, place_number) VALUES ($1,$2,$3,$4)`, [
      tournament,
      teamId,
      text,
      parseInt(text, 10),
    ])

  const worlds23 = await tour('2023 Worlds/Main Event', 'Worlds 2023', 'Regular season', true, 2023)
  await play(worlds23, alpha, star)
  await place(worlds23, alpha, '1')

  const worlds24 = await tour('2024 Worlds/Main Event', 'Worlds 2024', 'Regular season', true, 2024)
  await play(worlds24, alpha, star)
  await place(worlds24, alpha, '1')

  const worlds25 = await tour('2025 Worlds/Main Event', 'Worlds 2025', 'Regular season', true, 2025)
  const playIn = await tour('2025 Worlds/Play-In', 'Worlds 2025 Play-In', 'Qualifier', true, 2025)
  await play(playIn, alpha, star)
  await play(worlds25, alpha, star)
  await play(playIn, bravo, underdog)
  await place(worlds25, alpha, '3-4')
  await place(worlds25, bravo, '9-12')

  const msi = await tour('2025 MSI', 'MSI 2025', 'Regular season', true, 2025)
  await play(msi, alpha, star)
  await place(msi, alpha, '2')

  const domestic = async (name: string, stage: string, year: number, teamId: number, text: string, playerId: number | null, league = lck) => {
    const t = await tour(name, name, stage, false, year, league)
    if (playerId) await play(t, teamId, playerId)
    await place(t, teamId, text)
  }
  await domestic('LCK 2024 Summer Playoffs', 'Playoffs', 2024, alpha, '1', null)
  await domestic('LCK 2025 Spring', 'Regular season', 2025, alpha, '1', star)
  await domestic('LCK 2025 Spring Playoffs', 'Playoffs', 2025, alpha, '1', star)
  await domestic('LCK 2025 Summer Playoffs', 'Playoffs', 2025, alpha, '1', star)
  await domestic('LCK 2025 Regional Finals', 'Qualifier', 2025, alpha, '2', star)
  await domestic('LCK 2026 Road to MSI', 'Playoffs', 2026, alpha, '1', star)
  await domestic('LCK 2026 Season Playoffs', 'Playoffs', 2026, alpha, '1', star)

  // A playoffs shared by two leagues (the 2025 LTA Championship): its league is only known per team, and it is no region's title.
  const shared = await one(
    `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
     VALUES ('LTA 2025 Championship','LTA 2025 Championship',NULL,2025,'Summer','Playoffs',false,'2025-09-01','2025-09-01') RETURNING id`,
  )
  await pool.query(`INSERT INTO tournament_team_league (tournament_id, team_id, league_id) VALUES ($1,$2,$3)`, [shared, alpha, lck])
  await play(shared, alpha, star)
  await place(shared, alpha, '1')

  await domestic('LCK 2025 Summer Playoffs 2', 'Playoffs', 2025, alpha, '1', swapper)
  await domestic('LCK 2023 Spring', 'Regular season', 2023, bravo, '5', underdog) // played, but no 1st or 2nd
  await domestic('LCS 2026 Spring Playoffs', 'Playoffs', 2026, delta, '1', swapper, lcs)
  await domestic('LCS 2026 Summer Playoffs', 'Playoffs', 2026, delta, '2', swapper, lcs)

})

afterAll(() => pool.end())

describe('GET /api/players/:id/accomplishments', () => {
  it('counts international appearances and lists every event of the best placement', async () => {
    const { body, status } = await api('/api/players/Star/accomplishments')
    expect(status).toBe(200)
    const byKey = Object.fromEntries(body.international.map((i: { key: string }) => [i.key, i]))
    // The play-in is part of Worlds 2025, not a fourth appearance; the two 1sts are a tie, oldest first.
    expect(byKey.worlds).toMatchObject({ label: 'Worlds', appearances: 3, best: { place: '1' } })
    expect(byKey.worlds.best.events.map((e: { name: string }) => e.name)).toEqual(['Worlds 2023', 'Worlds 2024'])
    expect(byKey.msi).toMatchObject({ appearances: 1, best: { place: '2', events: [{ name: 'MSI 2025', team: 'Alpha' }] } })
    expect(byKey.firstStand).toEqual({ key: 'firstStand', label: 'First Stand', appearances: 0, best: null })
  })

  it('credits a team knocked out in the play-in with a Worlds appearance and its placement', async () => {
    const { body } = await api('/api/players/Underdog/accomplishments')
    const worlds = body.international.find((i: { key: string }) => i.key === 'worlds')
    expect(worlds).toMatchObject({ appearances: 1, best: { place: '9-12', events: [{ name: 'Worlds 2025', team: 'Bravo' }] } })
  })

  it('counts playoffs 1st and 2nd places with the most recent of each, and splits played', async () => {
    const { body } = await api('/api/players/Star/accomplishments')
    expect(body.regions).toHaveLength(1)
    expect(body.regions[0]).toMatchObject({
      region: 'Korea',
      league: 'LCK',
      splitsPlayed: 2, // 2025 and 2026 Summer: a split and its playoffs count once, and the Regional Finals qualifier is no split
      lastSplit: { year: 2026, split: 'Summer', event: { name: 'LCK 2026 Season Playoffs', team: 'Alpha' } },
      playoffsFirst: { count: 4, mostRecent: { name: 'LCK 2026 Season Playoffs', team: 'Alpha', league: 'LCK' } },
      playoffsSecond: { count: 0, mostRecent: null },
    })
    expect(body.regions[0]).not.toHaveProperty('regularSeason') // a regular season finish is not an accomplishment
  })

  it('leaves out qualifiers, events shared by two leagues, and events the player did not play', async () => {
    const { body } = await api('/api/players/Star/accomplishments')
    // Not the 2025 Regional Finals (a qualifier), the shared LTA playoffs, or the 2024 playoffs Star missed.
    expect(body.regions[0].playoffsFirst.count).toBe(4)
    expect(body.regions[0].playoffsSecond.count).toBe(0)
  })

  it('keeps a player who changed region apart: one block per region, newest first', async () => {
    const { body } = await api('/api/players/Swapper/accomplishments')
    expect(body.regions.map((r: { region: string }) => r.region)).toEqual(['North America', 'Korea'])
    const [na, kr] = body.regions
    expect(na).toMatchObject({ league: 'LCS', splitsPlayed: 1, lastSplit: { year: 2026, split: 'Summer', event: { name: 'LCS 2026 Summer Playoffs' } }, playoffsFirst: { count: 1 }, playoffsSecond: { count: 1, mostRecent: { name: 'LCS 2026 Summer Playoffs' } } })
    expect(kr).toMatchObject({ league: 'LCK', splitsPlayed: 1, lastSplit: { year: 2025, split: 'Summer', event: { name: 'LCK 2025 Summer Playoffs 2' } }, playoffsFirst: { count: 1, mostRecent: { team: 'Alpha' } }, playoffsSecond: { count: 0 } })
  })

  it('shows a region the player played in even when they finished 1st or 2nd in nothing', async () => {
    const { body } = await api('/api/players/Underdog/accomplishments')
    expect(body.regions).toHaveLength(1)
    expect(body.regions[0]).toMatchObject({
      splitsPlayed: 1,
      lastSplit: { year: 2023, split: 'Summer', event: { name: 'LCK 2023 Spring', team: 'Bravo' } },
      playoffsFirst: { count: 0 },
      playoffsSecond: { count: 0 },
    })
  })

  it('is empty for a player with no games', async () => {
    const { body, status } = await api('/api/players/Newcomer/accomplishments')
    expect(status).toBe(200)
    expect(body.international.map((i: { appearances: number }) => i.appearances)).toEqual([0, 0, 0])
    expect(body.regions).toEqual([])
  })

  it('404s for an unknown player', async () => {
    expect((await api('/api/players/Nobody/accomplishments')).status).toBe(404)
  })
})
