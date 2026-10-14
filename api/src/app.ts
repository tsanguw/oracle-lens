import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z, ZodError } from 'zod'
import { pool } from './db.js'
import { filterSchema, listFilterSchema } from './filters.js'
import { recentSchema, recentTournaments, search, searchSchema } from './homeQueries.js'
import { loadPlayerAccomplishments } from './playerAccomplishments.js'
import { loadPlayerContext } from './playerContext.js'
import { loadPlayerTeamHistory } from './playerTeamHistory.js'
import { loadImageManifest } from './assets.js'
import { loadSitemap } from './sitemap.js'
import { championsListSchema, loadChampionsList, loadTeamsList, loadTournamentsList, teamsListSchema, tournamentsListSchema } from './listQueries.js'
import { loadTeamContext } from './teamContext.js'
import { loadStages } from './stages.js'
import {
  findTournament,
  loadRelatedEvents,
  loadResults,
  loadStandings,
  loadTournamentChampions,
  loadTournamentPlayers,
  loadTournamentSummary,
  loadUpcoming,
  tournamentListSchema,
  type TournamentRow,
} from './tournamentQueries.js'
import { loadSeriesGames, seriesParamsSchema } from './seriesGames.js'
import { loadTournamentRosters } from './tournamentRosters.js'
import {
  championSchema,
  findChampion,
  loadChampionContext,
  loadChampionCounters,
  loadChampionPatches,
  loadChampionPlayers,
  loadChampionRoles,
  loadChampionSummary,
  loadChampionTeams,
  type ChampionRow,
} from './championQueries.js'
import {
  findTeam,
  loadOpponents,
  loadTeamDraft,
  loadTeamLeague,
  loadTeamPlayers,
  loadTeamSummary,
  teamFilterSchema,
  teamListFilterSchema,
} from './teamQueries.js'
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

/** Numeric order (26.10 after 26.9), newest first; patch labels look like "26.14". */
const PATCH_ORDER = `NULLIF(regexp_replace(split_part(patch, '.', 1), '\\D', '', 'g'), '')::int DESC NULLS LAST,
                  NULLIF(regexp_replace(split_part(patch, '.', 2), '\\D', '', 'g'), '')::int DESC NULLS LAST, patch DESC`

const blank = (v: unknown) => (v === '' ? undefined : v)
const patchFilterSchema = z.object({
  league: z.preprocess(blank, z.string().optional()),
  year: z.preprocess(blank, z.coerce.number().int().optional()),
  split: z.preprocess(blank, z.string().optional()),
})

type Handler = (req: Request, res: Response) => Promise<void>
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next)

export interface AppOptions {
  /** Requests allowed per IP address per minute on /api; 0 turns the limit off. Default: RATE_LIMIT_PER_MINUTE, else 300. */
  rateLimitPerMinute?: number
  /** Websites allowed to call the API from a browser, comma-separated. Default: CORS_ORIGIN, else every origin. */
  corsOrigin?: string
}

export function createApp(options: AppOptions = {}) {
  const app = express()
  app.disable('x-powered-by')
  // Render and Cloudflare sit in front of the API; trust the first proxy so each visitor gets their own rate-limit count.
  app.set('trust proxy', 1)
  const origins = (options.corsOrigin ?? process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  app.use(cors(origins.length ? { origin: origins } : undefined))
  // Cheap liveness check for the host and the keep-awake ping; does not touch the database.
  app.get('/healthz', (_req, res) => void res.json({ ok: true }))

  // A page load makes about ten calls, so 300 a minute is generous for people and a wall for scrapers hammering the
  // aggregate queries on a small free database.
  const perMinute = options.rateLimitPerMinute ?? Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300)
  if (perMinute > 0) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60_000,
        limit: perMinute,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many requests, slow down and try again in a minute' },
      }),
    )
  }

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

  /** Current team, roster, running events and schedule. Independent of the stat filters. */
  app.get('/api/players/:id/context', wrap(async (req, res) => {
    const player = await findPlayer(pool, String(req.params.id))
    if (!player) {
      res.status(404).json({ error: 'Player not found' })
      return
    }
    res.json(await loadPlayerContext(pool, player.id))
  }))

  /** Worlds/MSI/First Stand appearances and best finish, plus split, regional title and runner-up counts. Independent of the stat filters. */
  app.get('/api/players/:id/accomplishments', wrap(async (req, res) => {
    const player = await findPlayer(pool, String(req.params.id))
    if (!player) {
      res.status(404).json({ error: 'Player not found' })
      return
    }
    res.json(await loadPlayerAccomplishments(pool, player.id))
  }))

  /** The teams a player has been on and when, newest first. Independent of the stat filters. */
  app.get('/api/players/:id/team-history', wrap(async (req, res) => {
    const player = await findPlayer(pool, String(req.params.id))
    if (!player) {
      res.status(404).json({ error: 'Player not found' })
      return
    }
    res.json(await loadPlayerTeamHistory(pool, player.id))
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

  /** Resolves :id to a team and its stat scope (default range = latest split plus internationals), or sends 404. */
  const teamRoute = <T>(
    path: string,
    load: (ctx: { team: NonNullable<Awaited<ReturnType<typeof findTeam>>>; scope: PlayerScope; limit: number | undefined }) => Promise<T>,
  ) =>
    app.get(
      `/api/teams/:id${path}`,
      wrap(async (req, res) => {
        const { limit, ...filters } = teamListFilterSchema.parse(req.query)
        const team = await findTeam(pool, String(req.params.id))
        if (!team) {
          res.status(404).json({ error: 'Team not found' })
          return
        }
        const scope = await resolveScope(pool, team.id, filters, 'team_id')
        res.json({ range: scope.range, ...(await load({ team, scope, limit })) })
      }),
    )

  teamRoute('', async ({ team, scope }) => {
    const [summary, league] = await Promise.all([loadTeamSummary(pool, scope), loadTeamLeague(pool, scope)])
    return { team: { ...team, league }, empty: summary === null, summary }
  })
  teamRoute('/players', async ({ scope }) => {
    const players = await loadTeamPlayers(pool, scope)
    return { empty: players.length === 0, players }
  })
  teamRoute('/draft', async ({ scope, limit }) => {
    const draft = await loadTeamDraft(pool, scope, limit)
    return { empty: draft.picks.length === 0 && draft.bans.length === 0, ...draft }
  })
  teamRoute('/opponents', async ({ scope, limit }) => {
    const opponents = await loadOpponents(pool, scope, limit)
    return { empty: opponents.length === 0, opponents }
  })

  /** Roster, running events and schedule. Independent of the stat filters. */
  app.get('/api/teams/:id/context', wrap(async (req, res) => {
    const team = await findTeam(pool, String(req.params.id))
    if (!team) {
      res.status(404).json({ error: 'Team not found' })
      return
    }
    res.json({ team, ...(await loadTeamContext(pool, team.id)) })
  }))

  /** Resolves :name to a champion and hands its parsed filters to `load`, or sends 404. */
  const championRoute = <T>(path: string, load: (ctx: { champion: ChampionRow; query: ReturnType<typeof championSchema.parse> }) => Promise<T>) =>
    app.get(
      `/api/champions/:name${path}`,
      wrap(async (req, res) => {
        const query = championSchema.parse(req.query)
        const champion = await findChampion(pool, String(req.params.name))
        if (!champion) {
          res.status(404).json({ error: 'Champion not found' })
          return
        }
        res.json(await load({ champion, query }))
      }),
    )

  championRoute('', async ({ champion, query }) => {
    const { range, summary } = await loadChampionSummary(pool, query, champion)
    return { champion, range, empty: summary === null, summary }
  })
  championRoute('/roles', async ({ champion, query }) => {
    const roles = await loadChampionRoles(pool, query, champion)
    return { empty: roles.length === 0, roles }
  })
  championRoute('/players', async ({ champion, query }) => {
    const players = await loadChampionPlayers(pool, query, champion, query.limit)
    return { empty: players.length === 0, players }
  })
  championRoute('/teams', async ({ champion, query }) => {
    const teams = await loadChampionTeams(pool, query, champion, query.limit)
    return { empty: teams.length === 0, teams }
  })
  championRoute('/matchups', async ({ champion, query }) => {
    const matchups = await loadChampionCounters(pool, query, champion, query.limit)
    return { empty: matchups.length === 0, matchups }
  })
  championRoute('/patches', async ({ champion, query }) => {
    const patches = await loadChampionPatches(pool, query, champion)
    return { empty: patches.length === 0, patches }
  })
  /** Top players, top teams and recent events for the related-info strip. Ignores the stat filters. */
  championRoute('/context', ({ champion }) => loadChampionContext(pool, champion).then((ctx) => ({ champion, ...ctx })))

  app.get('/api/leaderboard/players', wrap(async (req, res) => {
    res.json(await loadLeaderboard(pool, leaderboardSchema.parse(req.query)))
  }))

  app.get('/api/search', wrap(async (req, res) => {
    res.json(await search(pool, searchSchema.parse(req.query)))
  }))

  /** Which champions, teams and players have an image. Changes only when the sync runs, so it is cacheable. */
  app.get('/api/assets/images', wrap(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300')
    res.json(await loadImageManifest(pool))
  }))

  /** Every page worth indexing, for the front end's sitemap.xml. Changes when the sync runs, so it is cacheable. */
  app.get('/api/sitemap', wrap(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(await loadSitemap(pool))
  }))

  app.get('/api/teams', wrap(async (req, res) => {
    res.json(await loadTeamsList(pool, teamsListSchema.parse(req.query)))
  }))

  app.get('/api/champions', wrap(async (req, res) => {
    res.json(await loadChampionsList(pool, championsListSchema.parse(req.query)))
  }))

  app.get('/api/tournaments', wrap(async (req, res) => {
    res.json(await loadTournamentsList(pool, tournamentsListSchema.parse(req.query)))
  }))

  app.get('/api/tournaments/recent', wrap(async (req, res) => {
    const { limit } = recentSchema.parse(req.query)
    res.json({ tournaments: await recentTournaments(pool, limit) })
  }))

  /**
   * Resolves :id to a tournament (404 if unknown) and hands it, with the optional `limit` and the route's params, to
   * `load`. A `load` that returns null answers 404 too (a sub-resource that is not part of this tournament).
   */
  const tournamentRoute = <T>(
    path: string,
    load: (ctx: { tournament: TournamentRow; limit: number | undefined; params: Request['params'] }) => Promise<T | null>,
  ) =>
    app.get(
      `/api/tournaments/:id${path}`,
      wrap(async (req, res) => {
        const { limit } = tournamentListSchema.parse(req.query)
        const tournament = await findTournament(pool, String(req.params.id))
        if (!tournament) {
          res.status(404).json({ error: 'Tournament not found' })
          return
        }
        const body = await load({ tournament, limit, params: req.params })
        if (body === null) {
          res.status(404).json({ error: 'Not found' })
          return
        }
        res.json(body)
      }),
    )

  tournamentRoute('', async ({ tournament }) => {
    const summary = await loadTournamentSummary(pool, tournament)
    const { memberIds: _members, ...info } = tournament
    return { tournament: info, empty: summary === null, summary }
  })
  tournamentRoute('/standings', async ({ tournament }) => {
    const standings = await loadStandings(pool, tournament.id)
    return { empty: standings.length === 0, standings }
  })
  /** `limit` caps both lists, so a page that filters by team or day can ask for every scheduled and played series. */
  tournamentRoute('/matches', async ({ tournament, limit }) => {
    const [upcoming, results] = await Promise.all([
      loadUpcoming(pool, tournament.memberIds, limit),
      loadResults(pool, tournament.memberIds, limit),
    ])
    return { empty: upcoming.length === 0 && results.length === 0, upcoming, results }
  })
  tournamentRoute('/players', async ({ tournament, limit }) => {
    const { minGames, players } = await loadTournamentPlayers(pool, tournament.memberIds, limit)
    return { empty: players.length === 0, minGames, players }
  })
  /** Who played for each team in the event, from its games: standings order, players Top to Support. */
  tournamentRoute('/rosters', async ({ tournament }) => {
    const teams = await loadTournamentRosters(pool, tournament)
    return { empty: teams.length === 0, teams }
  })
  /** One series with each game's draft: bans and picks per side. */
  tournamentRoute('/series/:seriesId', async ({ tournament, params }) => {
    const { seriesId } = seriesParamsSchema.parse(params)
    return loadSeriesGames(pool, tournament, seriesId)
  })
  tournamentRoute('/champions', async ({ tournament, limit }) => {
    const champions = await loadTournamentChampions(pool, tournament.memberIds, limit)
    return { empty: champions.length === 0, champions }
  })
  /** The event's series grouped into stages (play-in, swiss, groups, knockout), with the links a bracket is drawn from. */
  tournamentRoute('/stages', async ({ tournament }) => {
    const stages = await loadStages(pool, tournament)
    return { empty: stages.length === 0, stages }
  })
  /** Leading teams, schedule and results, and related events for the related-info strip. */
  tournamentRoute('/context', async ({ tournament }) => {
    const [teams, upcoming, results, related] = await Promise.all([
      loadStandings(pool, tournament.id, 5),
      loadUpcoming(pool, tournament.memberIds),
      loadResults(pool, tournament.memberIds, 3),
      loadRelatedEvents(pool, tournament),
    ])
    return { teams, upcoming, results, related }
  })


  /** Patches that have games in the chosen league, year and split (each optional), so the patch filter offers only real choices. */
  app.get('/api/filters/patches', wrap(async (req, res) => {
    const { league, year, split } = patchFilterSchema.parse(req.query)
    const { rows } = await pool.query<{ patch: string }>(
      `SELECT patch FROM (
         SELECT DISTINCT g.patch FROM game g
         JOIN tournament t ON t.id = g.tournament_id LEFT JOIN league l ON l.id = t.league_id
         WHERE g.patch IS NOT NULL AND t.stage IS DISTINCT FROM 'Qualifier'
           AND ($1::text IS NULL OR l.name = $1) AND ($2::int IS NULL OR t.year = $2) AND ($3::text IS NULL OR t.split = $3)
       ) p ORDER BY ${PATCH_ORDER}`,
      [league ?? null, year ?? null, split ?? null],
    )
    res.json({ patches: rows.map((r) => r.patch) })
  }))

  app.get('/api/filters', wrap(async (_req, res) => {
    const [leagues, years, splits, patches, combos] = await Promise.all([
      pool.query(`SELECT name FROM league ORDER BY name`),
      pool.query(
        `SELECT DISTINCT t.year FROM tournament t
         WHERE t.stage IS DISTINCT FROM 'Qualifier' AND EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = t.id) ORDER BY t.year DESC`,
      ),
      pool.query(`SELECT DISTINCT split FROM tournament WHERE split IS NOT NULL ORDER BY split`),
      pool.query(`SELECT patch FROM (SELECT DISTINCT patch FROM game WHERE patch IS NOT NULL) p ORDER BY ${PATCH_ORDER}`),
      // Which league/year/split combinations actually have games, so the filter bar only offers choices that exist.
      pool.query(
        `SELECT DISTINCT l.name AS league, t.year, t.split FROM tournament t LEFT JOIN league l ON l.id = t.league_id
         WHERE t.stage IS DISTINCT FROM 'Qualifier' AND EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = t.id)
         ORDER BY l.name NULLS LAST, t.year DESC, t.split`,
      ),
    ])
    res.json({
      leagues: leagues.rows.map((r) => r.name),
      years: years.rows.map((r) => r.year),
      splits: splits.rows.map((r) => r.split),
      patches: patches.rows.map((r) => r.patch),
      combos: combos.rows.map((r) => ({ league: r.league, year: r.year, split: r.split })),
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
