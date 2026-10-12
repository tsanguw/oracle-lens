import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * "Star" has four stints: one with a team nobody has heard of since 2012 (no known end), Alpha (a team we hold games for),
 * then a team we only know from the roster log, then Alpha again, still running and inactive. The history is read
 * straight from player_team_stint (the sync builds it).
 * "Newcomer" has none.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number

let star: number

beforeAll(async () => {
  await resetDb()
  const alpha = await one(`INSERT INTO team (name) VALUES ('Alpha') RETURNING id`)
  star = await one(`INSERT INTO player (name, display_name) VALUES ('Star','Star') RETURNING id`)
  await one(`INSERT INTO player (name, display_name) VALUES ('Newcomer','Newcomer') RETURNING id`)
  const stint = (team: string, teamId: number | null, region: string | null, role: string | null, start: string, end: string | null, flags: { inactive?: boolean; loan?: boolean; modifier?: string; endUnknown?: boolean } = {}) =>
    pool.query(
      `INSERT INTO player_team_stint (player_id, team_name, team_id, region, role, role_modifier, start_date, end_date, end_unknown, inactive, loan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [star, team, teamId, region, role, flags.modifier ?? null, start, end, flags.endUnknown ?? false, flags.inactive ?? false, flags.loan ?? false],
    )
  // Inserted out of order on purpose: the API sorts.
  await stint('Alpha', alpha, 'Korea', 'Mid', '2022-03-01', null, { inactive: true })
  await stint('Alpha', alpha, 'Korea', 'Mid', '2018-01-10', '2019-12-01')
  await stint('Unheld Esports', null, 'Europe', 'Bot', '2020-02-01', '2021-11-12', { loan: true, modifier: 'Sub' })
  await stint('Old Corsair', null, 'North America', 'Mid', '2012-05-04', null, { endUnknown: true })
})

describe('GET /api/players/:id/team-history', () => {
  it('lists the stints newest first', async () => {
    const res = await api('/api/players/Star/team-history').expect(200)
    expect(res.body.stints.map((s: { team: string; start: string; end: string | null }) => [s.team, s.start, s.end])).toEqual([
      ['Alpha', '2022-03-01', null],
      ['Unheld Esports', '2020-02-01', '2021-11-12'],
      ['Alpha', '2018-01-10', '2019-12-01'],
      ['Old Corsair', '2012-05-04', null],
    ])
  })

  it('says when a stint has no known end, as opposed to still running', async () => {
    const { stints } = (await api('/api/players/Star/team-history').expect(200)).body
    expect(stints[0]).toMatchObject({ team: 'Alpha', end: null, endUnknown: false })
    expect(stints[3]).toMatchObject({ team: 'Old Corsair', end: null, endUnknown: true })
  })

  it('links a team we hold and leaves one we do not unlinked', async () => {
    const { stints } = (await api('/api/players/Star/team-history').expect(200)).body
    expect(stints[0].teamPage).toBe('Alpha')
    expect(stints[1].teamPage).toBeNull()
    expect(stints[1].region).toBe('Europe')
  })

  it('carries the role, sub or loan marks, and inactive', async () => {
    const { stints } = (await api('/api/players/Star/team-history').expect(200)).body
    expect(stints[0]).toMatchObject({ role: 'Mid', modifier: null, inactive: true, loan: false })
    expect(stints[1]).toMatchObject({ role: 'Bot', modifier: 'Sub', inactive: false, loan: true })
  })

  it('finds the player by id too', async () => {
    const res = await api(`/api/players/${star}/team-history`).expect(200)
    expect(res.body.stints).toHaveLength(4)
  })

  it('returns an empty list for a player with no history', async () => {
    const res = await api('/api/players/Newcomer/team-history').expect(200)
    expect(res.body).toEqual({ stints: [] })
  })

  it('404s for a player we do not have', async () => {
    await api('/api/players/Nobody/team-history').expect(404)
  })
})
