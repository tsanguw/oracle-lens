import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Team Alpha (LCK) in "LCK 2026 Summer" (running now): Top/Jungle/Mid/Bot/Support starters over 4 games, plus a
 * Mid sub ("Benchy", 1 game) who played before the starter... both must appear, only the starter flagged.
 * Alpha beat Bravo 2-1 (Bravo is team1 in that series, so the stored score is "1-2"), and has one upcoming series
 * against Charlie and one finished earlier in "LCK 2026 Spring" (which is over).
 * "Old Timer" last played 300 days ago for Alpha's rival Bravo, so Bravo is their last (not current) team.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000)
const iso = (d: Date) => d.toISOString()
const dateOnly = (d: Date) => iso(d).slice(0, 10)
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [alpha, bravo, charlie] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const champion = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  const tour = (name: string, start: Date, end: Date) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$1,$2,2026,'Summer','Regular season',false,$3,$4) RETURNING id`,
      [name, lck, dateOnly(start), dateOnly(end)],
    )
  const summer = await tour('LCK 2026 Summer', day(-20), day(20))
  const spring = await tour('LCK 2026 Spring', day(-120), day(-80))

  const roles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']
  const starters = await Promise.all(roles.map((r) => player(`Alpha ${r}`)))
  const benchy = await player('Benchy')
  const oldTimer = await player('Old Timer')

  const series = (tournament: number, t1: number, t2: number, winner: number | null, score: string | null, at: Date) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,3,$6,$7) RETURNING id`,
      [tournament, t1, t2, winner, score, `M${++n}`, iso(at)],
    )
  const game = async (tournament: number, seriesId: number, at: Date, teamId: number, roster: [number, string][]) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, tournament_id, series_id, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`,
      [`G${++n}`, tournament, seriesId, iso(at)],
    )
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true)`, [g, teamId])
    for (const [pid, role] of roster) {
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,$5,'blue',true)`,
        [g, pid, teamId, champion, role],
      )
    }
  }
  const lineup = (midId: number): [number, string][] => starters.map((p, i) => [i === 2 ? midId : p, roles[i]])

  // Finished spring series (Alpha won as team2), and the running summer event.
  const sSpring = await series(spring, bravo, alpha, alpha, '1-2', day(-100))
  await game(spring, sSpring, day(-100), alpha, lineup(starters[2]))
  const sDone = await series(summer, bravo, alpha, alpha, '1-2', day(-5))
  for (let i = 0; i < 3; i++) await game(summer, sDone, day(-5 + i * 0.01), alpha, lineup(starters[2]))
  await game(summer, await series(summer, alpha, charlie, alpha, '2-0', day(-10)), day(-10), alpha, lineup(benchy))
  await series(summer, alpha, charlie, null, null, day(3)) // upcoming
  await series(summer, bravo, charlie, null, null, day(4)) // not Alpha's
  await series(summer, alpha, bravo, null, null, day(-3)) // scheduled in the past, never played: not "upcoming"

  const sOld = await series(spring, bravo, charlie, bravo, '2-0', day(-300))
  await game(spring, sOld, day(-300), bravo, [[oldTimer, 'Top']])
})

afterAll(() => pool.end())

describe('GET /api/players/:id/context', () => {
  it('returns the current team with its league', async () => {
    const { body, status } = await api('/api/players/Alpha%20Mid/context')
    expect(status).toBe(200)
    expect(body.team).toMatchObject({ name: 'Alpha', league: 'LCK', isCurrent: true })
  })

  it('lists the roster of the team\'s latest event with starters flagged and the viewed player marked', async () => {
    const { body } = await api('/api/players/Alpha%20Mid/context')
    const byName = Object.fromEntries(body.roster.map((p: { name: string }) => [p.name, p]))
    expect(Object.keys(byName).sort()).toEqual(
      ['Alpha Bot', 'Alpha Jungle', 'Alpha Mid', 'Alpha Support', 'Alpha Top', 'Benchy'].sort(),
    )
    expect(byName['Alpha Mid']).toMatchObject({ starter: true, isViewed: true, games: 3, role: 'Mid' })
    expect(byName['Benchy']).toMatchObject({ starter: false, isViewed: false, games: 1 })
    expect(byName['Alpha Top'].isViewed).toBe(false)
    // Ordered Top, Jungle, Mid (starter before sub), Bot, Support.
    expect(body.roster.map((p: { role: string }) => p.role)).toEqual(['Top', 'Jungle', 'Mid', 'Mid', 'Bot', 'Support'])
  })

  it('puts the running event first and flags its status', async () => {
    const { body } = await api('/api/players/Alpha%20Mid/context')
    expect(body.events[0]).toMatchObject({ name: 'LCK 2026 Summer', status: 'In progress', league: 'LCK' })
    expect(body.events[1]).toMatchObject({ name: 'LCK 2026 Spring', status: 'Completed' })
  })

  it('lists only the team\'s future unplayed series as upcoming', async () => {
    const { body } = await api('/api/players/Alpha%20Mid/context')
    expect(body.upcoming).toHaveLength(1)
    expect(body.upcoming[0]).toMatchObject({ opponent: 'Charlie', tournament: 'LCK 2026 Summer', bestOf: 3 })
  })

  it('shows recent results from the team\'s side, newest first', async () => {
    const { body } = await api('/api/players/Alpha%20Mid/context')
    expect(body.results[0]).toMatchObject({ opponent: 'Bravo', won: true, score: '2-1' })
    expect(body.results.map((r: { opponent: string }) => r.opponent)).toEqual(['Bravo', 'Charlie', 'Bravo'])
  })

  it('marks a team as the last (not current) team when the player has been inactive', async () => {
    const { body } = await api('/api/players/Old%20Timer/context')
    expect(body.team).toMatchObject({ name: 'Bravo', isCurrent: false })
  })

  it('404s for an unknown player and returns an empty context for a player with no games', async () => {
    expect((await api('/api/players/Nobody/context')).status).toBe(404)
    await pool.query(`INSERT INTO player (name, display_name) VALUES ('Ghost','Ghost')`)
    const { body } = await api('/api/players/Ghost/context')
    expect(body).toEqual({ team: null, roster: [], events: [], upcoming: [], results: [] })
  })
})
