import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * player_game's foreign key over (game_id, team_id, side, win) to team_game: a player's row must name a team that played
 * the game, with the side and result that team's own row has. Game 1: Alpha (blue, won) v Bravo (red, lost). Charlie
 * never plays.
 */

const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
let gameId: number
let alpha: number
let bravo: number
let charlie: number
let player: number
let azir: number

const insertPlayerRow = (team: number, side: string, win: boolean) =>
  pool.query(
    `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,'Mid',$5,$6)`,
    [gameId, player, team, azir, side, win],
  )

beforeAll(async () => {
  await resetDb()
  const tournament = await one(
    `INSERT INTO tournament (leaguepedia_name, name, year, stage) VALUES ('T 2026','T 2026',2026,'Playoffs') RETURNING id`,
  )
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  ;[alpha, bravo, charlie] = [await team('Alpha'), await team('Bravo'), await team('Charlie')]
  player = await one(`INSERT INTO player (name, display_name) VALUES ('P','P') RETURNING id`)
  azir = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  gameId = await one(`INSERT INTO game (leaguepedia_id, tournament_id, length_sec) VALUES ('G1',$1,1800) RETURNING id`, [tournament])
  await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true), ($1,$3,'red',false)`, [gameId, alpha, bravo])
})

afterAll(() => pool.end())

describe('player_game -> team_game foreign key', () => {
  it('accepts a row that matches its team\'s row', async () => {
    await insertPlayerRow(alpha, 'blue', true)
    await pool.query(`DELETE FROM player_game WHERE game_id = $1`, [gameId])
  })

  it('rejects a team that did not play the game', async () => {
    await expect(insertPlayerRow(charlie, 'blue', true)).rejects.toThrow(/player_game_team_game_fkey/)
  })

  it('rejects a side that differs from the team\'s side', async () => {
    await expect(insertPlayerRow(alpha, 'red', true)).rejects.toThrow(/player_game_team_game_fkey/)
  })

  it('rejects a result that differs from the team\'s result', async () => {
    await expect(insertPlayerRow(alpha, 'blue', false)).rejects.toThrow(/player_game_team_game_fkey/)
  })

  it('removes a game\'s player rows with its team rows, as the sync replaces them', async () => {
    await insertPlayerRow(alpha, 'blue', true)
    await pool.query(`DELETE FROM team_game WHERE game_id = $1`, [gameId])
    expect((await pool.query(`SELECT 1 FROM player_game WHERE game_id = $1`, [gameId])).rowCount).toBe(0)
  })

  it('carries player rows along when a team row is re-pointed at another team (repair_names merging teams)', async () => {
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1,$2,'blue',true)`, [gameId, alpha])
    await insertPlayerRow(alpha, 'blue', true)
    await pool.query(`UPDATE team_game SET team_id = $1 WHERE game_id = $2 AND team_id = $3`, [charlie, gameId, alpha])
    const { rows } = await pool.query(`SELECT team_id FROM player_game WHERE game_id = $1`, [gameId])
    expect(rows.map((r) => r.team_id)).toEqual([charlie])
  })
})
