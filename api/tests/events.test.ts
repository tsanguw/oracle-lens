import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { pool } from '../src/db.js'
import { resetDb } from './resetDb.js'

/*
 * A play-in is part of its competition. Leaguepedia keeps "<x>/Play-In" and "<x>/Main Event" as two tournaments and so do
 * the tables; the `event` view joins them for everything that lists or opens events.
 *
 * "Worlds 2026" = Play-In (day -30 to -28) + Main Event (day -20 to -1), international:
 *   Play-In: P1 Charlie beats Delta 2-0 ("Group A").            2 games, day -29
 *   Main:    M1 Alpha beats Bravo 2-0 ("Quarterfinals"),        2 games, day -15
 *            M2 Alpha beats Charlie 2-1 ("Semifinals"),         3 games, day -3
 *   In total 7 games, 3 series, 4 teams; the main event alone has 5 games and 3 teams (Delta only played the play-in).
 * "LCK 2026 Season Playoffs" + "LCK 2026 Season Play-In" (both stage Playoffs): 2 + 2 games.
 * "Worlds 2027 Play-In" has no main event loaded yet, so it stays an event of its own.
 */

const app = createApp()
const api = (path: string) => request(app).get(path)
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0].id as number
const day = (offset: number) => new Date(Date.now() + offset * 86400000)
const iso = (d: Date) => d.toISOString()
const dateOnly = (d: Date) => iso(d).slice(0, 10)
let n = 0
const ids: Record<string, number> = {}

beforeAll(async () => {
  await resetDb()
  const lck = await one(`INSERT INTO league (name, region) VALUES ('LCK','Korea') RETURNING id`)
  const team = (name: string) => one(`INSERT INTO team (name) VALUES ($1) RETURNING id`, [name])
  const [A, B, C, D, L1, L2] = [await team('Alpha'), await team('Bravo'), await team('Charlie'), await team('Delta'), await team('Lck One'), await team('Lck Two')]
  const player = (name: string) => one(`INSERT INTO player (name, display_name) VALUES ($1,$1) RETURNING id`, [name])
  const mid: Record<number, number> = {}
  for (const [id, name] of [[A, 'A Mid'], [B, 'B Mid'], [C, 'C Mid'], [D, 'D Mid'], [L1, 'L1 Mid'], [L2, 'L2 Mid']] as const) mid[id] = await player(name)
  const azir = await one(`INSERT INTO champion (name) VALUES ('Azir') RETURNING id`)

  const tour = (page: string, name: string, year: number, stage: string, intl: boolean, leagueId: number | null, start: Date, end: Date) =>
    one(
      `INSERT INTO tournament (leaguepedia_name, name, league_id, year, split, stage, is_international, start_date, end_date)
       VALUES ($1,$2,$3,$4,'Summer',$5,$6,$7,$8) RETURNING id`,
      [page, name, leagueId, year, stage, intl, dateOnly(start), dateOnly(end)],
    )
  ids.playIn = await tour('2026 Season World Championship/Play-In', 'Worlds 2026 Play-In', 2026, 'Qualifier', true, null, day(-30), day(-28))
  ids.main = await tour('2026 Season World Championship/Main Event', 'Worlds 2026', 2026, 'Regular season', true, null, day(-20), day(-1))
  ids.lonePlayIn = await tour('2027 Season World Championship/Play-In', 'Worlds 2027 Play-In', 2027, 'Qualifier', true, null, day(-4), day(-3))
  ids.lckPlayIn = await tour('LCK/2026 Season/Season Play-In', 'LCK 2026 Season Play-In', 2026, 'Playoffs', false, lck, day(-12), day(-10))
  ids.lckPlayoffs = await tour('LCK/2026 Season/Season Playoffs', 'LCK 2026 Season Playoffs', 2026, 'Playoffs', false, lck, day(-9), day(-2))

  const series = (tournament: number, t1: number, t2: number, winner: number, score: string, at: Date, tab: string | null, order: number, match: number) =>
    one(
      `INSERT INTO series (tournament_id, team1_id, team2_id, winner_id, score, best_of, leaguepedia_id, scheduled_at, stage_tab, stage_order, stage_match)
       VALUES ($1,$2,$3,$4,$5,3,$6,$7,$8,$9,$10) RETURNING id`,
      [tournament, t1, t2, winner, score, `S${++n}`, iso(at), tab, tab ? order : null, tab ? match : null],
    )
  const game = async (tournament: number, seriesId: number, at: Date, win: number, lose: number) => {
    const g = await one(
      `INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec) VALUES ($1,$2,$3,'26.9',$4,1800) RETURNING id`,
      [`G${++n}`, seriesId, tournament, iso(at)],
    )
    await pool.query(`INSERT INTO team_game (game_id, team_id, side, win, kills) VALUES ($1,$2,'blue',true,10), ($1,$3,'red',false,8)`, [g, win, lose])
    for (const [teamId, side, w] of [[win, 'blue', true], [lose, 'red', false]] as const) {
      await pool.query(
        `INSERT INTO player_game (game_id, player_id, team_id, champion_id, role, side, win, kills, deaths, assists) VALUES ($1,$2,$3,$4,'Mid',$5,$6,3,1,5)`,
        [g, mid[teamId], teamId, azir, side, w],
      )
    }
  }
  const play = async (tournament: number, t1: number, t2: number, winner: number, wins: number, losses: number, at: Date, tab: string | null, order = 1, match = 1) => {
    const s = await series(tournament, t1, t2, winner, `${wins}-${losses}`, at, tab, order, match)
    const loser = winner === t1 ? t2 : t1
    for (let i = 0; i < wins + losses; i++) await game(tournament, s, new Date(at.getTime() + i * 3600000), i < wins ? winner : loser, i < wins ? loser : winner)
    return s
  }
  await play(ids.playIn, C, D, C, 2, 0, day(-29), 'Group A')
  await play(ids.main, A, B, A, 2, 0, day(-15), 'Quarterfinals', 1, 1)
  await play(ids.main, A, C, A, 2, 1, day(-3), 'Semifinals', 2, 1)
  await play(ids.lonePlayIn, C, D, D, 2, 0, day(-3), 'Group A')
  await play(ids.lckPlayIn, L2, L1, L2, 2, 0, day(-11), null)
  await play(ids.lckPlayoffs, L1, L2, L1, 2, 0, day(-5), null)
})

afterAll(() => pool.end())

describe('the play-in is part of its competition', () => {
  it('lists the competition once, as "Worlds 2026", with both stages counted and the dates stretched over both', async () => {
    const res = await api('/api/tournaments?year=2026&league=INTL')
    const names = res.body.rows.map((r: { name: string }) => r.name)
    expect(names).toEqual(['Worlds 2026'])
    const row = res.body.rows[0]
    expect(row.id).toBe(ids.main)
    expect(row.games).toBe(7)
    expect(row.startDate).toBe(dateOnly(day(-30)))
    expect(row.endDate).toBe(dateOnly(day(-1)))
    expect(row.standingLabel).toBe('Champion')
    expect(row.standingTeam).toBe('Alpha')
  })

  it('also lists the LCK Season Play-In under its playoffs', async () => {
    const res = await api('/api/tournaments?year=2026&league=LCK')
    expect(res.body.rows.map((r: { name: string }) => r.name)).toEqual(['LCK 2026 Season Playoffs'])
    expect(res.body.rows[0].games).toBe(4)
    expect(res.body.rows[0].startDate).toBe(dateOnly(day(-12)))
  })

  it('keeps a play-in whose main event is not loaded yet as an event of its own, among the qualifiers', async () => {
    const qualifiers = await api('/api/tournaments?stage=Qualifier&year=2027')
    expect(qualifiers.body.rows.map((r: { name: string }) => r.name)).toEqual(['Worlds 2027 Play-In'])
    const res = await api(`/api/tournaments/${ids.lonePlayIn}`)
    expect(res.body.tournament.id).toBe(ids.lonePlayIn)
    expect(res.body.summary.games).toBe(2)
  })

  it('opens the competition from the play-in\'s own id, and says which tournament it landed on', async () => {
    for (const id of [ids.playIn, ids.main]) {
      const res = await api(`/api/tournaments/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.tournament.id).toBe(ids.main)
      expect(res.body.tournament.name).toBe('Worlds 2026')
      expect(res.body.tournament.startDate).toBe(dateOnly(day(-30)))
      expect(res.body.tournament.memberIds).toBeUndefined()
    }
  })

  it('summarises both stages, but names the champion from the main event alone', async () => {
    const res = await api(`/api/tournaments/${ids.playIn}`)
    expect(res.body.summary).toMatchObject({ games: 7, series: 3, teams: 4, standingLabel: 'Champion', standingTeam: 'Alpha' })
  })

  it('keeps the standings to the main event: a team that only played the play-in is not ranked beside it', async () => {
    const res = await api(`/api/tournaments/${ids.playIn}/standings`)
    expect(res.body.standings.map((s: { team: string }) => s.team).sort()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('lists the results of both stages, newest first', async () => {
    const res = await api(`/api/tournaments/${ids.main}/matches`)
    expect(res.body.results.map((r: { team1: string; team2: string }) => `${r.team1} v ${r.team2}`)).toEqual(['Alpha v Charlie', 'Alpha v Bravo', 'Charlie v Delta'])
  })

  it('counts both stages in the top players and champions', async () => {
    // the list needs 5 games: Charlie's mid has only 3 in the main event, and reaches 5 with the 2 play-in games
    const players = await api(`/api/tournaments/${ids.main}/players?limit=10`)
    const byName = Object.fromEntries(players.body.players.map((p: { name: string; games: number }) => [p.name, p.games]))
    expect(byName).toEqual({ 'A Mid': 5, 'C Mid': 5 })
    const champions = await api(`/api/tournaments/${ids.main}/champions`)
    expect(champions.body.champions[0]).toMatchObject({ champion: 'Azir', picks: 14, presence: 1 })
  })

  it('gives the event a Play-In stage in front of the main event\'s own stages', async () => {
    const res = await api(`/api/tournaments/${ids.playIn}/stages`)
    expect(res.body.stages.map((s: { key: string; label: string }) => `${s.key}:${s.label}`)).toEqual(['playin:Play-In', 'knockout:Knockout'])
    const [playIn, knockout] = res.body.stages
    expect(playIn.rounds).toHaveLength(1)
    expect(playIn.rounds[0].name).toBe('Group A')
    expect(playIn.rounds[0].series[0].slots.map((s: { team: string }) => s.team)).toEqual(['Charlie', 'Delta'])
    // the main event's knockout holds the main event's two series only
    expect(knockout.rounds.flatMap((r: { series: unknown[] }) => r.series)).toHaveLength(2)
  })

  it('searches and recommends the competition once', async () => {
    const found = await api('/api/search?q=Worlds')
    expect(found.body.tournaments.map((t: { name: string }) => t.name).sort()).toEqual(['Worlds 2026', 'Worlds 2027 Play-In'])
    const recent = await api('/api/tournaments/recent?limit=10')
    const names = recent.body.tournaments.map((t: { name: string }) => t.name)
    expect(names).toContain('Worlds 2026')
    expect(names).not.toContain('Worlds 2026 Play-In')
    expect(names).not.toContain('LCK 2026 Season Play-In')
  })

  it('does not list the play-in as a related event of its competition or of the LCK playoffs', async () => {
    const worlds = await api(`/api/tournaments/${ids.main}/context`)
    expect(worlds.body.related.map((r: { name: string }) => r.name)).not.toContain('Worlds 2026 Play-In')
    const lck = await api(`/api/tournaments/${ids.lckPlayoffs}/context`)
    expect(lck.body.related.map((r: { name: string }) => r.name)).not.toContain('LCK 2026 Season Play-In')
  })

  it('shows a player the LCK playoffs once, not the Season Play-In as a second event', async () => {
    const res = await api('/api/players/L1%20Mid/context')
    const names = res.body.events.map((e: { name: string }) => e.name)
    expect(names).toContain('LCK 2026 Season Playoffs')
    expect(names).not.toContain('LCK 2026 Season Play-In')
  })

  it('leaves the play-in out of the sitemap, since it has no page of its own', async () => {
    const res = await api('/api/sitemap')
    const listed = res.body.tournaments.map((t: { id: number }) => t.id)
    expect(listed).toContain(ids.main)
    expect(listed).toContain(ids.lonePlayIn)
    expect(listed).not.toContain(ids.playIn)
    expect(listed).not.toContain(ids.lckPlayIn)
  })
})
