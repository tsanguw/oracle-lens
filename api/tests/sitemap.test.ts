import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { SITEMAP_MIN_GAMES } from '../src/sitemap.js'
import { resetDb } from './resetDb.js'

const app = createApp()

/** Records `n` games for one player and one team in a tournament, one a day from 2025-03-01. */
async function playGames(tournamentId: number, playerId: number, teamId: number, championId: number, n: number, firstId: number) {
  for (let i = 0; i < n; i++) {
    const gameId = firstId + i
    await pool.query(
      `INSERT INTO game (id, leaguepedia_id, tournament_id, played_at) VALUES ($1, $2, $3, $4)`,
      [gameId, `LP_${gameId}`, tournamentId, new Date(Date.UTC(2025, 2, 1 + i, 12))],
    )
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win) VALUES ($1, $2, 'blue', true)`, [gameId, teamId])
    await pool.query(
      `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1, $2, $3, $4, 'Mid', 'blue', true)`,
      [gameId, playerId, teamId, championId],
    )
  }
}

beforeAll(async () => {
  await resetDb()
  await pool.query(`INSERT INTO league (id, name) VALUES (1, 'LCK')`)
  await pool.query(
    `INSERT INTO tournament (id, name, leaguepedia_name, league_id, year, split, start_date, end_date) VALUES
       (1, 'LCK 2025 Spring', 'LCK 2025 Spring', 1, 2025, 'Spring', '2025-03-01', '2025-04-20'),
       (2, 'Empty Cup', 'Empty Cup', 1, 2025, 'Cup', NULL, NULL)`,
  )
  await pool.query(`INSERT INTO team (id, name) VALUES (1, 'T1'), (2, 'Tiny Team')`)
  await pool.query(`INSERT INTO player (id, name, display_name) VALUES (1, 'Faker', 'Faker'), (2, 'Bench Player', 'Bench Player')`)
  await pool.query(`INSERT INTO champion (id, name) VALUES (1, 'Azir'), (2, 'Never Played')`)
  await playGames(1, 1, 1, 1, SITEMAP_MIN_GAMES, 100)
  await playGames(1, 2, 2, 1, SITEMAP_MIN_GAMES - 1, 200)
})

afterAll(() => pool.end())

describe('GET /api/sitemap', () => {
  it('lists the pages worth indexing, with the date of the latest game', async () => {
    const res = await request(app).get('/api/sitemap')
    expect(res.status).toBe(200)
    expect(res.body.players).toEqual([{ name: 'Faker', lastmod: '2025-03-10' }])
    expect(res.body.teams).toEqual([{ name: 'T1', lastmod: '2025-03-10' }])
    expect(res.body.champions).toEqual([{ name: 'Azir' }])
    // the end date wins when there is one; a tournament with no games is not listed
    expect(res.body.tournaments).toEqual([{ id: 1, slug: 'lck-2025-spring', lastmod: '2025-04-20' }])
  })

  it('leaves out players and teams under the minimum number of games', async () => {
    const res = await request(app).get('/api/sitemap')
    expect(res.body.players.map((p: { name: string }) => p.name)).not.toContain('Bench Player')
    expect(res.body.teams.map((t: { name: string }) => t.name)).not.toContain('Tiny Team')
  })

  it('is cacheable, since it only changes when the sync runs', async () => {
    const res = await request(app).get('/api/sitemap')
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/)
  })
})
