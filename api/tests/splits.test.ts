import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Leaguepedia leaves `split` empty on some events that belong to a split. assign_missing_splits()
 * gives them the split of the most recent earlier tournament of the same league and year.
 *
 *  LPL 2024:  Spring (split "Spring"), Summer (split "Summer"), Summer Playoffs (no split),
 *             Regional Finals (no split)
 *  LPL 2025:  Promotion that starts in late 2024 (no split, nothing earlier in 2025: stays empty)
 *  LCP 2024:  VCS Spring (sub_region VCS, "Spring") and an LJL Playoffs event (sub_region LJL, no split)
 *  LTA 2025:  North/South Split 1 and Split 3, plus two combined playoffs (no league, no split)
 *  Worlds 2024 (international, no split)
 */

const app = createApp()
const api = (path: string) => request(app).get(path)

const splitOf = async (name: string) =>
  (await pool.query(`SELECT split FROM tournament WHERE name = $1`, [name])).rows[0].split as string | null

beforeAll(async () => {
  await resetDb()
  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
  const lpl =await one(`INSERT INTO league (name, region) VALUES ('LPL','China') RETURNING id`)
  const lcp = await one(`INSERT INTO league (name, region) VALUES ('LCP','Asia Pacific') RETURNING id`)
  const lcs = await one(`INSERT INTO league (name, region) VALUES ('LCS','North America') RETURNING id`)
  const cblol = await one(`INSERT INTO league (name, region) VALUES ('CBLOL','Brazil') RETURNING id`)

  let n = 0
  const tour = (name: string, leagueId: number | null, year: number, split: string | null, start: string, opts: { intl?: boolean; sub?: string; stage?: string } = {}) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, sub_region, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
      [`T${++n}`, name, leagueId, year, split, opts.stage ?? 'Regular season', opts.intl ?? false, opts.sub ?? null, start],
    )
  await tour('LPL 2024 Spring', lpl, 2024, 'Spring', '2024-01-10')
  await tour('LPL 2024 Summer', lpl, 2024, 'Summer', '2024-05-20')
  await tour('LPL 2024 Summer Playoffs', lpl, 2024, null, '2024-08-01', { stage: 'Playoffs' })
  await tour('LPL 2024 Regional Finals', lpl, 2024, null, '2024-08-31', { stage: 'Qualifier' })
  await tour('LPL 2025 Promotion', lpl, 2025, null, '2024-12-01', { stage: 'Qualifier' })

  await tour('VCS 2024 Spring', lcp, 2024, 'Spring', '2024-01-05', { sub: 'VCS' })
  await tour('LJL 2024 Playoffs', lcp, 2024, null, '2024-04-01', { sub: 'LJL', stage: 'Playoffs' })

  await tour('LTA North 2025 Split 1', lcs, 2025, 'Split 1', '2025-01-25')
  await tour('LTA South 2025 Split 1', cblol, 2025, 'Split 1', '2025-01-25')
  await tour('LTA North 2025 Split 3', lcs, 2025, 'Split 3', '2025-07-26')
  await tour('LTA South 2025 Split 3', cblol, 2025, 'Split 3', '2025-07-26')
  const lta1 = await tour('LTA 2025 Split 1 Playoffs', null, 2025, null, '2025-02-15', { stage: 'Playoffs' })
  const lta3 = await tour('LTA 2025 Championship', null, 2025, null, '2025-09-13', { stage: 'Playoffs' })
  const teamX = await one(`INSERT INTO team (name) VALUES ('Team X') RETURNING id`)
  const teamY = await one(`INSERT INTO team (name) VALUES ('Team Y') RETURNING id`)
  for (const t of [lta1, lta3]) {
    await pool.query(`INSERT INTO tournament_team_league VALUES ($1,$2,$3),($1,$4,$5)`, [t, teamX, lcs, teamY, cblol])
  }

  await tour('Worlds 2024', null, 2024, null, '2024-10-25', { intl: true })

  // A player whose most recent domestic game is the Regional Finals, with games in Summer too.
  const player = await one(`INSERT INTO player (name, display_name) VALUES ('Rex','Rex') RETURNING id`)
  const champ = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  const teamR = await one(`INSERT INTO team (name) VALUES ('Team R') RETURNING id`)
  const rows = await pool.query(`SELECT id, name FROM tournament WHERE name IN ('LPL 2024 Summer','LPL 2024 Summer Playoffs','LPL 2024 Regional Finals')`)
  let g = 0
  for (const t of rows.rows) {
    const games = t.name === 'LPL 2024 Summer' ? 4 : 2
    for (let i = 0; i < games; i++) {
      const id = await one(
        `INSERT INTO game (leaguepedia_id, tournament_id, played_at, length_sec) VALUES ($1,$2,$3,1800) RETURNING id`,
        [`S${++g}`, t.id, `2024-${t.name === 'LPL 2024 Summer' ? '06' : t.name.includes('Playoffs') ? '08' : '09'}-0${i + 1}T10:00:00Z`],
      )
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,'Mid','blue',true)`,
        [id, player, teamR, champ],
      )
    }
  }
})

afterAll(() => pool.end())

describe('assign_missing_splits()', () => {
  it('gives playoffs and regional finals the split of the preceding tournament in their league and year', async () => {
    const changed = (await pool.query(`SELECT assign_missing_splits() AS n`)).rows[0].n
    expect(await splitOf('LPL 2024 Summer Playoffs')).toBe('Summer')
    expect(await splitOf('LPL 2024 Regional Finals')).toBe('Summer') // the latest split before it, not Spring
    // Exactly four events gain a split: the two above and the two combined LTA playoffs. The 2025
    // Promotion, the LJL event and Worlds are deliberately left alone (see the tests below).
    expect(changed).toBe(4)
  })

  it('keeps stage as it was: split and stage are separate', async () => {
    const { rows } = await pool.query(`SELECT stage FROM tournament WHERE name = 'LPL 2024 Regional Finals'`)
    expect(rows[0].stage).toBe('Qualifier')
  })

  it('leaves an event alone when nothing precedes it in its year', async () => {
    expect(await splitOf('LPL 2025 Promotion')).toBeNull() // starts in 2024 but belongs to year 2025
  })

  it('does not borrow a split from a different sub-region', async () => {
    expect(await splitOf('LJL 2024 Playoffs')).toBeNull() // only VCS "Spring" precedes it
  })

  it('uses the participating teams leagues for multi-league events', async () => {
    expect(await splitOf('LTA 2025 Split 1 Playoffs')).toBe('Split 1')
    expect(await splitOf('LTA 2025 Championship')).toBe('Split 3')
  })

  it('never touches internationals', async () => {
    expect(await splitOf('Worlds 2024')).toBeNull()
  })

  it('is idempotent: a second run changes nothing', async () => {
    const again = (await pool.query(`SELECT assign_missing_splits() AS n`)).rows[0].n
    expect(again).toBe(0)
  })
})

describe('default range once splits are assigned', () => {
  it('uses the real split, not the Regional Finals, when that was the latest game', async () => {
    const { body } = await api('/api/players/Rex')
    // Summer (4) + Summer Playoffs (2) + Regional Finals (2), not just the 2 Regional Finals games.
    expect(body.range.label).toBe('LPL 2024 Summer')
    expect(body.range.resolved).toMatchObject({ league: 'LPL', year: 2024, split: 'Summer' })
    expect(body.summary.games).toBe(8)
  })

  it('filtering by that split includes its playoffs and regional finals', async () => {
    const { body } = await api('/api/players/Rex?league=LPL&year=2024&split=Summer')
    expect(body.summary.games).toBe(8)
  })

  it('lists the assigned splits as filter options', async () => {
    const { body } = await api('/api/filters')
    expect(body.splits).toEqual(expect.arrayContaining(['Spring', 'Summer', 'Split 1', 'Split 3']))
  })

  it('lists which league/year/split combinations have games, so a league only offers its own splits', async () => {
    const { body } = await api('/api/filters')
    const splitsOf = (league: string) => body.combos.filter((c: { league: string }) => c.league === league).map((c: { split: string }) => c.split)
    expect(splitsOf('LPL')).toEqual(expect.arrayContaining(['Summer']))
    expect(splitsOf('LPL')).not.toContain('Split 1')
    for (const c of body.combos) expect(Object.keys(c).sort()).toEqual(['league', 'split', 'year'])
  })
})
