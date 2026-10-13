import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Picks live only on player_game (champion_id, plus pick_order for the place in the team's draft); game_ban holds just
 * bans, so a pick can no longer be stored a second time that could disagree with the player's row.
 */

const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let gameId: number
let team: number
let player: number
let azir: number

const insertPick = (order: number | null) =>
  pool.query(
    `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, pick_order)
     VALUES ($1,$2,$3,$4,'Mid','blue',true,$5)`,
    [gameId, player, team, azir, order],
  )

beforeAll(async () => {
  await resetDb()
  const tournament = await one(
    `INSERT INTO tournament (leaguepedia_name, name, year, stage) VALUES ('T 2026','T 2026',2026,'Playoffs') RETURNING id`,
  )
  team = await one(`INSERT INTO team (name) VALUES ('Alpha') RETURNING id`)
  player = await one(`INSERT INTO player (name, display_name) VALUES ('P','P') RETURNING id`)
  azir = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  gameId = await one(`INSERT INTO game (leaguepedia_id, tournament_id, length_sec) VALUES ('G1',$1,1800) RETURNING id`, [tournament])
  await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true)`, [gameId, team])
})

afterAll(() => pool.end())

describe('player_game.pick_order', () => {
  it('takes a place from 1 to 5, or NULL when the draft order is not known', async () => {
    for (const order of [1, 5, null]) {
      await insertPick(order)
      await pool.query(`DELETE FROM player_game WHERE game_id = $1`, [gameId])
    }
  })

  it('rejects a place outside 1 to 5', async () => {
    await expect(insertPick(0)).rejects.toThrow(/pick_order/)
    await expect(insertPick(6)).rejects.toThrow(/pick_order/)
  })
})

describe('game_ban', () => {
  it('holds bans only: it has no pick/ban action column, and the old table is gone', async () => {
    const columns = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'game_ban'`)).rows.map(
      (r) => r.column_name,
    )
    expect(columns.sort()).toEqual(['champion_id', 'draft_order', 'game_id', 'id', 'team_id'])
    expect((await pool.query(`SELECT to_regclass('pick_ban') AS t`)).rows[0].t).toBeNull()
  })
})
