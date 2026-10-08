import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { ZodError } from 'zod'
import { pool } from './db.js'
import { filterSchema } from './filters.js'
import {
  findPlayer,
  loadChampionPool,
  loadIdentity,
  loadSummary,
  resolveScope,
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

  app.get('/api/filters', wrap(async (_req, res) => {
    const [leagues, years, splits, patches] = await Promise.all([
      pool.query(`SELECT name FROM league ORDER BY name`),
      pool.query(`SELECT DISTINCT year FROM tournament ORDER BY year DESC`),
      pool.query(`SELECT DISTINCT split FROM tournament WHERE split IS NOT NULL ORDER BY split`),
      pool.query(`SELECT DISTINCT patch FROM game WHERE patch IS NOT NULL ORDER BY patch DESC`),
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
