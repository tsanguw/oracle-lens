import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

const app = createApp()

beforeAll(async () => {
  await resetDb()
  await pool.query(`INSERT INTO champion (name, icon_key) VALUES ('Wukong','MonkeyKing'), ('Azir','Azir'), ('Mystery', NULL)`)
  await pool.query(`INSERT INTO team (name, logo_file) VALUES ('T1','t1-abc123.webp'), ('No Logo', NULL)`)
  await pool.query(`INSERT INTO player (name, display_name, photo_file) VALUES ('Faker','Faker','faker-1.webp'), ('Nobody','Nobody',NULL)`)
  await pool.query(`INSERT INTO meta (key, value) VALUES ('ddragon_version','16.20.1')`)
})

afterAll(() => pool.end())

describe('GET /api/assets/images', () => {
  it('lists only the entities that have an image, and the Data Dragon version', async () => {
    const res = await request(app).get('/api/assets/images')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ddragonVersion: '16.20.1',
      champions: { Wukong: 'MonkeyKing', Azir: 'Azir' },
      teams: { T1: 't1-abc123.webp' },
      players: { Faker: 'faker-1.webp' },
    })
  })

  it('is cacheable, since it only changes when the sync runs', async () => {
    const res = await request(app).get('/api/assets/images')
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/)
  })

  it('returns an empty manifest before the first image sync', async () => {
    await pool.query(`DELETE FROM meta WHERE key = 'ddragon_version'`)
    await pool.query(`UPDATE champion SET icon_key = NULL`)
    await pool.query(`UPDATE team SET logo_file = NULL`)
    await pool.query(`UPDATE player SET photo_file = NULL`)
    const res = await request(app).get('/api/assets/images')
    expect(res.body).toEqual({ ddragonVersion: null, champions: {}, teams: {}, players: {} })
  })
})
