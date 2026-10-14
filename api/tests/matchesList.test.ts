import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * "LCK 2026 Spring" has 7 unplayed series scheduled from tomorrow on, one per day, and one played series. The match
 * list on the tournament page filters by team and day in the browser, so /matches has to be able to return all of them.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString()
let tournamentId = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  tournamentId = await one(
    `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
     VALUES ('LCK 2026 Spring','LCK 2026 Spring',$1,2026,'Spring','Playoffs',false,CURRENT_DATE - 10,CURRENT_DATE + 20) RETURNING id`,
    [lck],
  )
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [alpha, bravo] = [await team('Alpha'), await team('Bravo')]
  const series = (winner: number | null, score: string | null, at: string, id: string) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,3,$6,$7) RETURNING id`,
      [tournamentId, alpha, bravo, winner, score, id, at],
    )
  const played = await series(alpha, '2-0', day(-3), 'PLAYED')
  const g = await one(
    `INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec) VALUES ('G1',$1,$2,'26.1',$3,1800) RETURNING id`,
    [played, tournamentId, day(-3)],
  )
  await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true), ($1,$3,'red',false)`, [g, alpha, bravo])
  for (let i = 1; i <= 7; i++) await series(null, null, day(i), `UP${i}`)
})

afterAll(() => pool.end())

describe('GET /api/tournaments/:id/matches', () => {
  it('returns the next 5 scheduled series by default, soonest first', async () => {
    const { body } = await api(`/api/tournaments/${tournamentId}/matches`)
    expect(body.upcoming).toHaveLength(5)
    const times = body.upcoming.map((s: { at: string }) => Date.parse(s.at))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(body.results).toHaveLength(1)
  })

  it('applies limit to the scheduled series as well as the results', async () => {
    const all = (await api(`/api/tournaments/${tournamentId}/matches?limit=200`)).body
    expect(all.upcoming).toHaveLength(7)
    expect(all.results).toHaveLength(1)
    expect((await api(`/api/tournaments/${tournamentId}/matches?limit=2`)).body.upcoming).toHaveLength(2)
  })
})
