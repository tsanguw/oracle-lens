import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/* player_game.role and tournament.stage are free text with a fixed set of real values; a CHECK keeps odd ones out. */

const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let tournament: number
let gameId: number
let team: number
let player: number
let azir: number

const insertRole = (role: string) =>
  pool.query(
    `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,$5,'blue',true)`,
    [gameId, player, team, azir, role],
  )
const insertTournament = (name: string, stage: string | null) =>
  pool.query(`INSERT INTO tournament (leaguepedia_name, name, year, stage) VALUES ($1,$1,2026,$2)`, [name, stage])

beforeAll(async () => {
  await resetDb()
  tournament = await one(`INSERT INTO tournament (leaguepedia_name, name, year, stage) VALUES ('T 2026','T 2026',2026,'Playoffs') RETURNING id`)
  team = await one(`INSERT INTO team (name) VALUES ('Alpha') RETURNING id`)
  player = await one(`INSERT INTO player (name, display_name) VALUES ('P','P') RETURNING id`)
  azir = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  gameId = await one(`INSERT INTO game (leaguepedia_id, tournament_id, length_sec) VALUES ('G1',$1,1800) RETURNING id`, [tournament])
  await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true)`, [gameId, team])
})

afterAll(() => pool.end())

describe('player_game.role', () => {
  it('accepts the five roles', async () => {
    for (const role of ['Top', 'Jungle', 'Mid', 'Bot', 'Support']) {
      await insertRole(role)
      await pool.query(`DELETE FROM player_game WHERE game_id = $1`, [gameId])
    }
  })

  it('rejects anything else, including near misses', async () => {
    for (const role of ['ADC', 'mid', 'Sub', '']) {
      await expect(insertRole(role)).rejects.toThrow(/player_game_role_check/)
    }
  })
})

describe('tournament.stage', () => {
  it('accepts the three stages, and NULL', async () => {
    let i = 0
    for (const stage of ['Regular season', 'Playoffs', 'Qualifier', null]) await insertTournament(`ok ${++i}`, stage)
  })

  it('rejects any other stage', async () => {
    await expect(insertTournament('bad 1', 'Group Stage')).rejects.toThrow(/tournament_stage_check/)
    await expect(insertTournament('bad 2', 'playoffs')).rejects.toThrow(/tournament_stage_check/)
  })
})
