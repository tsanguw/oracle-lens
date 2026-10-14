import type pg from 'pg'
import { z } from 'zod'
import { SERIES_SELECT, type SeriesRow, type TournamentRow } from './tournamentQueries.js'

export const seriesParamsSchema = z.object({ seriesId: z.coerce.number().int().positive() })

export interface SeriesPick {
  champion: string
  role: string | null
  /** The player's page name, for the link. */
  page: string
  player: string
  /** Place 1-5 in the team's draft; null when unknown. */
  pickOrder: number | null
}

export interface SeriesSide {
  side: 'blue' | 'red'
  team: string
  win: boolean
  kills: number | null
  /** Champion names in ban-slot order. */
  bans: string[]
  picks: SeriesPick[]
}

export interface SeriesGame {
  gameId: number
  /** 1, 2, 3 ... in played order; derived, as the data has no game number. */
  number: number
  lengthSec: number | null
  patch: string | null
  sides: SeriesSide[]
}

export interface SeriesGamesResponse {
  series: SeriesRow
  games: SeriesGame[]
}

export interface GameRow {
  gameId: number
  number: number
  lengthSec: number | null
  patch: string | null
  team: string
  side: 'blue' | 'red'
  win: boolean
  kills: number | null
}
export interface PickRow extends SeriesPick {
  gameId: number
  side: 'blue' | 'red'
}
export interface BanRow {
  gameId: number
  side: 'blue' | 'red'
  champion: string
  slot: number | null
}

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bot', 'adc', 'support']
const roleRank = (role: string | null): number => {
  const i = role ? ROLE_ORDER.indexOf(role.toLowerCase()) : -1
  return i === -1 ? ROLE_ORDER.length : i
}

/**
 * Nests the flat rows as game -> blue/red side. Bans keep their slot order (unknown slots last, in the order given);
 * picks run Top to Support. A game with no draft data has empty `bans` and `picks`, not an error.
 */
export function shapeSeriesGames(games: GameRow[], picks: PickRow[], bans: BanRow[]): SeriesGame[] {
  const byGame = new Map<number, SeriesGame>()
  for (const g of [...games].sort((a, b) => a.number - b.number || (a.side === 'blue' ? -1 : 1))) {
    const game = byGame.get(g.gameId) ?? { gameId: g.gameId, number: g.number, lengthSec: g.lengthSec, patch: g.patch, sides: [] }
    game.sides.push({ side: g.side, team: g.team, win: g.win, kills: g.kills, bans: [], picks: [] })
    byGame.set(g.gameId, game)
  }
  const sideOf = (gameId: number, side: string) => byGame.get(gameId)?.sides.find((s) => s.side === side)
  for (const b of [...bans].sort((a, c) => (a.slot ?? Infinity) - (c.slot ?? Infinity))) sideOf(b.gameId, b.side)?.bans.push(b.champion)
  for (const { gameId, side, ...p } of [...picks].sort((a, c) => roleRank(a.role) - roleRank(c.role) || a.player.localeCompare(c.player))) {
    sideOf(gameId, side)?.picks.push(p)
  }
  return [...byGame.values()]
}

/** The series' games with drafts, or null when the series does not exist or belongs to another event. */
export async function loadSeriesGames(pool: pg.Pool, t: TournamentRow, seriesId: number): Promise<SeriesGamesResponse | null> {
  const { rows: seriesRows } = await pool.query<SeriesRow>(
    `${SERIES_SELECT} WHERE s.id = $1 AND s.tournament_id = ANY($2::int[])`,
    [seriesId, t.memberIds],
  )
  if (seriesRows.length === 0) return null

  const { rows: games } = await pool.query<GameRow>(
    `WITH gs AS (
       SELECT g.id, g.length_sec, g.patch,
              ROW_NUMBER() OVER (ORDER BY g.played_at NULLS LAST, g.leaguepedia_id)::int AS number
       FROM game g WHERE g.series_id = $1)
     SELECT gs.id AS "gameId", gs.number, gs.length_sec AS "lengthSec", gs.patch, tm.name AS team, tg.side, tg.win, tg.kills
     FROM gs JOIN team_game tg ON tg.game_id = gs.id JOIN team tm ON tm.id = tg.team_id`,
    [seriesId],
  )
  const ids = [...new Set(games.map((g) => g.gameId))]
  const [picks, bans] = await Promise.all([
    pool.query<PickRow>(
      `SELECT pgm.game_id AS "gameId", pgm.side, c.name AS champion, pgm.role, p.name AS page,
              COALESCE(p.display_name, p.name) AS player, pgm.pick_order AS "pickOrder"
       FROM player_game pgm JOIN player p ON p.id = pgm.player_id JOIN champion c ON c.id = pgm.champion_id
       WHERE pgm.game_id = ANY($1::int[])`,
      [ids],
    ),
    pool.query<BanRow>(
      `SELECT gb.game_id AS "gameId", tg.side, c.name AS champion, gb.draft_order AS slot
       FROM game_ban gb JOIN champion c ON c.id = gb.champion_id
       JOIN team_game tg ON tg.game_id = gb.game_id AND tg.team_id = gb.team_id
       WHERE gb.game_id = ANY($1::int[])
       ORDER BY gb.id`,
      [ids],
    ),
  ])
  return { series: seriesRows[0], games: shapeSeriesGames(games, picks.rows, bans.rows) }
}
