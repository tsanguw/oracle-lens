import type pg from 'pg'

/** A player or team needs this many recorded games to be listed: a page with one game is thin and not worth a crawl. */
export const SITEMAP_MIN_GAMES = 10
/** One sitemap file may hold 50,000 URLs; stay well under it and keep the busiest players if there are ever more. */
const MAX_PLAYERS = 40000

export interface SitemapEntry {
  /** The path segment as used in the site's URLs (before encoding). */
  name: string
  /** Date of the latest game, `YYYY-MM-DD`. */
  lastmod: string | null
}

export interface SitemapData {
  players: SitemapEntry[]
  teams: SitemapEntry[]
  champions: { name: string }[]
  tournaments: { id: number; lastmod: string | null }[]
}

const day = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : null)

/**
 * Every page worth indexing, as plain data. The front end's Cloudflare function turns it into sitemap.xml, so the URL
 * format lives next to the routes (in the front end) and only what exists lives here.
 */
export async function loadSitemap(pool: pg.Pool): Promise<SitemapData> {
  const [players, teams, champions, tournaments] = await Promise.all([
    pool.query(
      `SELECT p.name, MAX(g.played_at) AS lastmod
         FROM player p
         JOIN player_game pgm ON pgm.player_id = p.id
         JOIN game g ON g.id = pgm.game_id
        GROUP BY p.id
       HAVING COUNT(*) >= $1
        ORDER BY COUNT(*) DESC, p.name
        LIMIT $2`,
      [SITEMAP_MIN_GAMES, MAX_PLAYERS],
    ),
    pool.query(
      `SELECT t.name, MAX(g.played_at) AS lastmod
         FROM team t
         JOIN team_game tg ON tg.team_id = t.id
         JOIN game g ON g.id = tg.game_id
        GROUP BY t.id
       HAVING COUNT(*) >= $1
        ORDER BY COUNT(*) DESC, t.name`,
      [SITEMAP_MIN_GAMES],
    ),
    pool.query(
      `SELECT c.name FROM champion c
        WHERE EXISTS (SELECT 1 FROM player_game pgm WHERE pgm.champion_id = c.id)
        ORDER BY c.name`,
    ),
    pool.query(
      `SELECT t.id, COALESCE(t.end_date, MAX(g.played_at)) AS lastmod
         FROM event t
         JOIN game g ON g.tournament_id = ANY(t.member_ids)
        GROUP BY t.id, t.end_date
        ORDER BY t.id`,
    ),
  ])
  return {
    players: players.rows.map((r) => ({ name: r.name, lastmod: day(r.lastmod) })),
    teams: teams.rows.map((r) => ({ name: r.name, lastmod: day(r.lastmod) })),
    champions: champions.rows.map((r) => ({ name: r.name })),
    tournaments: tournaments.rows.map((r) => ({ id: r.id, lastmod: day(r.lastmod) })),
  }
}
