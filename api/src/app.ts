import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { ZodError } from 'zod'
import { pool } from './db.js'
import { filterSchema, listFilterSchema } from './filters.js'
import { recentSchema, recentTournaments, search, searchSchema } from './homeQueries.js'
import { leaderboardSchema, loadLeaderboard } from './leaderboardQueries.js'
import {
  findPlayer,
  loadChampionMatchups,
  loadChampionPool,
  loadIdentity,
  loadPlayerMatchups,
  loadSummary,
  loadTargetBans,
  resolveScope,
  type PlayerScope,
} from './playerQueries.js'

type Handler = (req: Request, res: Response) => Promise<void>
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next)

export function createApp() {
  const app = express()
  app.use(cors())

  app.get('/api/meta/last-updated', wrap(async (_req, res) => {
    const { rows } = await pool.query(`SELECT value FROM meta WHERE key = 'last_synced_at'`)
    res.json({ lastUpdated: rows[0] ? new Date(rows[0].value).toISOString() : null })
  }))

  app.get('/api/players/:id', wrap(async (req, res) => {
    const filters = filterSchema.parse(req.query)
    const player = await findPlayer(pool, String(req.params.id))
    if (!player) {
      res.status(404).json({ error: 'Player not found' })
      return
    }
    const scope = await resolveScope(pool, player.id, filters)
    const [summary, identity] = await Promise.all([
      loadSummary(pool, scope),
      loadIdentity(pool, scope),
    ])
    res.json({
      player: { ...player, ...identity },
      range: scope.range,
      empty: summary === null,
      summary,
    })
  }))

  app.get('/api/players/:id/champions', wrap(async (req, res) => {
    const filters = filterSchema.parse(req.query)
    const player = await findPlayer(pool, String(req.params.id))
    if (!player) {
      res.status(404).json({ error: 'Player not found' })
      return
    }
    const scope = await resolveScope(pool, player.id, filters)
    const champions = await loadChampionPool(pool, scope)
    res.json({ range: scope.range, empty: champions.length === 0, champions })
  }))

  /** Registers a list endpoint that resolves the player's scope and returns `{ range, empty, [key] }`. */
  const playerList = <T>(
    path: string,
    key: string,
    load: (scope: PlayerScope, limit: number | undefined) => Promise<T[]>,
  ) =>
    app.get(
      `/api/players/:id/${path}`,
      wrap(async (req, res) => {
        const { limit, ...filters } = listFilterSchema.parse(req.query)
        const player = await findPlayer(pool, String(req.params.id))
        if (!player) {
          res.status(404).json({ error: 'Player not found' })
          return
        }
        const scope = await resolveScope(pool, player.id, filters)
        const rows = await load(scope, limit)
        res.json({ range: scope.range, empty: rows.length === 0, [key]: rows })
      }),
    )

  playerList('matchups/players', 'matchups', (scope, limit) => loadPlayerMatchups(pool, scope, limit))
  playerList('matchups/champions', 'matchups', (scope, limit) => loadChampionMatchups(pool, scope, limit))
  playerList('target-bans', 'bans', (scope, limit) => loadTargetBans(pool, scope, limit))

  app.get('/api/leaderboard/players', wrap(async (req, res) => {
    res.json(await loadLeaderboard(pool, leaderboardSchema.parse(req.query)))
  }))

  app.get('/api/search', wrap(async (req, res) => {
    res.json(await search(pool, searchSchema.parse(req.query)))
  }))

  app.get('/api/tournaments/recent', wrap(async (req, res) => {
    const { limit } = recentSchema.parse(req.query)
    res.json({ tournaments: await recentTournaments(pool, limit) })
  }))

  app.get('/api/filters', wrap(async (_req, res) => {
    const [leagues, years, splits, patches] = await Promise.all([
      pool.query(`SELECT name FROM league ORDER BY name`),
      pool.query(
        `SELECT DISTINCT t.year FROM tournament t
         WHERE t.stage IS DISTINCT FROM 'Qualifier' AND EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = t.id) ORDER BY t.year DESC`,
      ),
      pool.query(`SELECT DISTINCT split FROM tournament WHERE split IS NOT NULL ORDER BY split`),
      // Numeric order (26.10 after 26.9), newest first; patch labels look like "26.14".
      pool.query(
        `SELECT patch FROM (SELECT DISTINCT patch FROM game WHERE patch IS NOT NULL) p
         ORDER BY NULLIF(regexp_replace(split_part(patch, '.', 1), '\\D', '', 'g'), '')::int DESC NULLS LAST,
                  NULLIF(regexp_replace(split_part(patch, '.', 2), '\\D', '', 'g'), '')::int DESC NULLS LAST, patch DESC`,
      ),
    ])
    res.json({
      leagues: leagues.rows.map((r) => r.name),
      years: years.rows.map((r) => r.year),
      splits: splits.rows.map((r) => r.split),
      patches: patches.rows.map((r) => r.patch),
    })
  }))

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', issues: err.issues })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
