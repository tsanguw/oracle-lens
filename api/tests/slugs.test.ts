import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * Events have readable addresses: /tournaments/worlds-2026 instead of /tournaments/587. The slug is the name in lower case
 * with other characters turned into hyphens, derived by the `event_slug` view. Old numeric addresses (and a play-in's own)
 * still work and tell the page the slug to move to.
 *
 *  "Worlds 2026" (Main Event + Play-In: two tournaments, one event), "LCK 2026 Rounds 3-4 (Legend Group)",
 *  two events both called "Duplicate Cup", one called "2027" and one with a name that has no letters or digits at all.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000)
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)
const ids: Record<string, number> = {}
let n = 0

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const A = await one(`INSERT INTO team (name) VALUES ('Alpha') RETURNING id`)
  const B = await one(`INSERT INTO team (name) VALUES ('Bravo') RETURNING id`)
  const pa = await one(`INSERT INTO player (name, display_name) VALUES ('A Mid','A Mid') RETURNING id`)
  const pb = await one(`INSERT INTO player (name, display_name) VALUES ('B Mid','B Mid') RETURNING id`)
  const azir = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)
  const tour = (page: string, name: string, year: number, stage: string, intl: boolean, leagueId: number | null, start: Date, end: Date) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$2,$3,$4,'Summer',$5,$6,$7,$8) RETURNING id`,
      [page, name, leagueId, year, stage, intl, dateOnly(start), dateOnly(end)],
    )
  ids.playIn = await tour('2026 Season World Championship/Play-In', 'Worlds 2026 Play-In', 2026, 'Qualifier', true, null, day(-30), day(-28))
  ids.main = await tour('2026 Season World Championship/Main Event', 'Worlds 2026', 2026, 'Regular season', true, null, day(-20), day(-1))
  ids.rounds = await tour('LCK/2026 Season/Rounds 3-4', 'LCK 2026 Rounds 3-4 (Legend Group)', 2026, 'Regular season', false, lck, day(-60), day(-40))
  ids.dup1 = await tour('Duplicate Cup 2025', 'Duplicate Cup', 2025, 'Regular season', false, lck, day(-400), day(-390))
  ids.dup2 = await tour('Duplicate Cup 2026', 'Duplicate Cup', 2026, 'Regular season', false, lck, day(-100), day(-90))
  ids.digits = await tour('2027', '2027', 2027, 'Regular season', false, lck, day(-80), day(-70))
  ids.symbols = await tour('Symbols', '!!! ???', 2026, 'Regular season', false, lck, day(-85), day(-75))

  const play = async (tournament: number, at: Date, tab: string | null) => {
    const s = await one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at, stage_tab, stage_order, stage_match)
       VALUES ($1,$2,$3,$2,'2-0',3,$4,$5,$6,$7,1) RETURNING id`,
      [tournament, A, B, `S${++n}`, at.toISOString(), tab, tab ? 1 : null],
    )
    for (let i = 0; i < 2; i++) {
      const g = await one(`INSERT INTO game (leaguepedia_id, series_id, tournament_id, played_at, length_sec) VALUES ($1,$2,$3,$4,1800) RETURNING id`, [`G${++n}`, s, tournament, at.toISOString()])
      await pool.query(`INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,'blue',true,10), ($1,$3,'red',false,8)`, [g, A, B])
      await pool.query(`INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win) VALUES ($1,$2,$3,$4,'Mid','blue',true), ($1,$5,$6,$4,'Mid','red',false)`, [g, pa, A, azir, pb, B])
    }
  }
  for (const [tournament, at] of [[ids.playIn, day(-29)], [ids.main, day(-10)], [ids.rounds, day(-50)], [ids.dup1, day(-395)], [ids.dup2, day(-95)], [ids.digits, day(-75)], [ids.symbols, day(-80)]] as const) {
    await play(tournament, at, tournament === ids.playIn || tournament === ids.main ? 'Round 1' : null)
  }
})

afterAll(() => pool.end())

const slugOf = async (id: number) => (await api(`/api/tournaments/${id}`)).body.tournament.slug as string

describe('the slug of an event', () => {
  it('is the name in lower case with other characters turned into single hyphens', async () => {
    expect(await slugOf(ids.main)).toBe('worlds-2026')
    expect(await slugOf(ids.rounds)).toBe('lck-2026-rounds-3-4-legend-group')
  })

  it('goes to the earlier event when two share a name, and the later one gets its id added', async () => {
    expect(await slugOf(ids.dup1)).toBe('duplicate-cup')
    expect(await slugOf(ids.dup2)).toBe(`duplicate-cup-${ids.dup2}`)
  })

  it('can never be only digits, so it cannot be mistaken for an old numeric address', async () => {
    expect(await slugOf(ids.digits)).toBe('event-2027')
  })

  it('has a fallback for a name with no letters or digits', async () => {
    expect(await slugOf(ids.symbols)).toBe('event')
  })

  it('is unique across every event', async () => {
    const list = await api('/api/tournaments?pageSize=100&stage=Regular%20season')
    const slugs = list.body.rows.map((r: { slug: string }) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const sitemap = await api('/api/sitemap')
    const mapSlugs = sitemap.body.tournaments.map((t: { slug: string }) => t.slug)
    expect(new Set(mapSlugs).size).toBe(mapSlugs.length)
  })
})

describe('opening an event by its address', () => {
  it('works by slug, in any letter case, for the event and every page of it', async () => {
    for (const ref of ['worlds-2026', 'WORLDS-2026', 'Worlds-2026']) {
      const res = await api(`/api/tournaments/${ref}`)
      expect(res.status).toBe(200)
      expect(res.body.tournament.id).toBe(ids.main)
    }
    for (const part of ['standings', 'matches', 'players', 'champions', 'stages', 'context']) {
      expect((await api(`/api/tournaments/worlds-2026/${part}`)).status).toBe(200)
    }
  })

  it('still works by the old numeric id, and by the play-in\'s id, and says the slug to move to', async () => {
    for (const id of [ids.main, ids.playIn]) {
      const res = await api(`/api/tournaments/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.tournament.slug).toBe('worlds-2026')
      expect(res.body.tournament.id).toBe(ids.main)
    }
  })

  it('answers 404 for an unknown or malformed address', async () => {
    for (const ref of ['no-such-event', 'worlds-2026-play-in', '99999999', 'a%20b', '..%2Fetc']) {
      expect((await api(`/api/tournaments/${ref}`)).status).toBe(404)
    }
  })
})

describe('every place that links to an event carries its slug', () => {
  it('lists, search, home and related events', async () => {
    const list = await api('/api/tournaments?year=2026&league=INTL')
    expect(list.body.rows.map((r: { slug: string }) => r.slug)).toEqual(['worlds-2026'])
    const found = await api('/api/search?q=Worlds')
    expect(found.body.tournaments).toEqual([expect.objectContaining({ id: ids.main, slug: 'worlds-2026' })])
    const recent = await api('/api/tournaments/recent?limit=20')
    expect(recent.body.tournaments.find((t: { id: number }) => t.id === ids.main).slug).toBe('worlds-2026')
    const context = await api('/api/tournaments/worlds-2026/context')
    for (const e of context.body.related) expect(typeof e.slug).toBe('string')
  })

  it('a team\'s events and matches, with a play-in series linking to its competition', async () => {
    const res = await api('/api/teams/Alpha/context')
    const events = res.body.events as { id: number; slug: string }[]
    expect(events.find((e) => e.id === ids.main)?.slug).toBe('worlds-2026')
    const matches = [...res.body.results, ...res.body.upcoming] as { tournamentId: number; tournamentSlug: string }[]
    const playInSeries = matches.find((m) => m.tournamentId === ids.playIn)
    expect(playInSeries?.tournamentSlug).toBe('worlds-2026')
  })

  it('a player\'s and a champion\'s events', async () => {
    const player = await api('/api/players/A%20Mid/context')
    expect(player.body.events.find((e: { id: number }) => e.id === ids.main).slug).toBe('worlds-2026')
    const champion = await api('/api/champions/Azir/context')
    expect(champion.body.events.find((e: { id: number }) => e.id === ids.main).slug).toBe('worlds-2026')
  })

  it('the sitemap lists the slug and keeps the numeric id for an older front end', async () => {
    const res = await api('/api/sitemap')
    expect(res.body.tournaments).toContainEqual(expect.objectContaining({ id: ids.main, slug: 'worlds-2026' }))
  })
})
