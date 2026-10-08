# [Site name]

Browse professional League of Legends esports stats: players, teams, champions, and tournaments, with sortable leaderboards, matchup breakdowns, and shareable filters. All data comes from [Leaguepedia](https://lol.fandom.com)'s Cargo API, synced into our own Postgres database. The site never calls Leaguepedia when a visitor loads a page.

> **Status: Milestone 1 (vertical slice).** The architecture is proven end to end for one tournament and one page: Leaguepedia → Python sync → Postgres → Express API → React player page. Teams, champions, tournaments, leaderboards, search, and the home page are not built yet (see [Roadmap](#roadmap)).

## Architecture

```
Leaguepedia Cargo API
        │  (bot login, throttled, backoff)
        ▼
  sync/  (Python)  ──►  PostgreSQL  ◄──  api/  (Node + Express + TypeScript)
                                              ▲
                                              │  /api/*
                                        frontend/  (React + Vite + TypeScript)
```

| Folder | What it is |
|---|---|
| `frontend/` | React + Vite + TypeScript UI |
| `api/` | Express + TypeScript API, SQL migrations, vitest suite |
| `sync/` | Python loader (`backfill` mode implemented; `nightly` is a stub) |
| `docker-compose.yml` | Local Postgres 16 for development |

Design decisions worth knowing:

- **Derived stats are computed in SQL from raw columns**, never stored (KDA, kill participation, damage/gold share, per-minute rates).
- **Missing stats are `NULL`, never 0.** They are excluded from averages and shown as "N/A" in the UI.
- **`role` lives on `player_game`**, not on the player, because players occasionally swap roles.
- **Filters live in the URL query string**, so every filtered view is a shareable link.
- **Minimum sample of 5 games** for winrate rankings. Champions under 5 games stay in a player's pool but are grayed out.

## Prerequisites

- Node.js 22+ and npm
- Python 3.11+
- Docker (for local Postgres)
- Optional: a Leaguepedia bot password for higher rate limits (see [Sync](#sync))

## Local development

```bash
cp .env.example .env            # then edit if needed
docker compose up -d            # Postgres on localhost:5432
```

Install and migrate the API, then start it:

```bash
cd api
npm install
npm run migrate                 # applies api/migrations/*.sql in order
npm run dev                     # http://localhost:3001
```

Start the frontend (it proxies `/api` to port 3001):

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Load some data (see [Sync](#sync)), then open `http://localhost:5173/players/<player name>`.

### Environment variables

Configured in the repo-root `.env` (never committed). See `.env.example`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Defaults to the local Docker database; point it at Neon for production (TLS is enabled automatically for `neon.tech` hosts). |
| `PORT` | API port (default `3001`). |
| `LEAGUEPEDIA_BOT_USER`, `LEAGUEPEDIA_BOT_PASSWORD` | Optional Leaguepedia bot password (`Username@botname` plus the generated password). Anonymous access is rate-limited almost immediately. |

## Sync

The sync is a Python CLI in `sync/`.

```bash
cd sync
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

python main.py backfill --latest                                   # most recent finished LCK regular-season split
python main.py backfill --tournament "LCK/2026 Season/Rounds 3-4"  # a specific Leaguepedia page
python main.py backfill --latest --force                           # re-sync even if already done
```

How it works:

- Reads `ScoreboardGames`, `ScoreboardTeams`, `ScoreboardPlayers`, `PicksAndBansS7`, `MatchSchedule`, and `Tournaments`.
- Resolves historical names to current ones: league names via `sync/league_aliases.yaml` (hand-written), player names via `PlayerRedirects`, team names by following `Teams.RenamedTo`.
- Progress is tracked per tournament in the `sync_state` table. Re-running is idempotent.
- Uses throttling and exponential backoff on rate limits.

Run the sync unit tests with `python -m pytest` inside `sync/`.

Leaguepedia field findings, including known gaps, are documented in [`sync/FIELDS.md`](sync/FIELDS.md).

## API

All player stat endpoints accept the filters `league`, `year`, `split`, `tournament`, `patch`, `side` (`blue`/`red`), `role`, and `domestic` (`true`/`false`).

| Endpoint | Returns |
|---|---|
| `GET /api/players/:id` | Profile, resolved range, summary stats. `:id` is the player's page name or numeric id. |
| `GET /api/players/:id/champions` | Champion pool; entries under 5 games are included and flagged `underMinSample`. |
| `GET /api/filters` | Available leagues, years, splits, patches. |
| `GET /api/meta/last-updated` | Timestamp of the last successful sync (shown in the footer). |

**Default range:** with none of `league`/`year`/`split`/`tournament`/`patch` set, a player's page shows their most recent domestic split plus any international events from that split's start onward. `domestic=true` restricts it to the league's split only. Any explicit filter replaces the default range.

When no games match, the API returns a normal response with `empty: true` (not an error) and the UI suggests widening the filters.

## Testing

```bash
cd api && npm test              # vitest + supertest
cd api && npm run typecheck
cd sync && python -m pytest
```

API tests run against a separate `lolstats_test` database on the same Postgres server. It is dropped, recreated, and migrated on every run, and never touches your dev data.

## Project layout

```
api/
  migrations/     numbered SQL migrations (plain SQL, no ORM)
  src/            app, filters, player queries, migration runner
  tests/          vitest suites and test-database setup
frontend/
  src/api/        fetch hook and response types
  src/components/ header/footer, filter bar, stat tiles, champion table
  src/pages/      player page and placeholder routes
  src/styles/     design tokens, layout, player page styles
sync/
  lolsync/        client, normalizers, backfill
  league_aliases.yaml
  FIELDS.md
```

## Roadmap

1. ✅ **Milestone 1:** monorepo, schema, one-tournament backfill, two player endpoints, player page (overview + champion pool)
2. Player page matchups and target bans
3. Full backfill across all leagues and years
4. Teams, champions, tournaments, leaderboards, search, and home page
5. Nightly GitHub Actions sync and keep-awake ping
6. Deployment (static host for the frontend, free tier for the API, Neon for Postgres)

## Known limitations

- **First blood is not available** in Leaguepedia's scoreboard tables, so `first_blood` is `NULL` and the stat shows "N/A".
- **Draft order** for picks and bans is the slot within each team's picks or bans, not the true interleaved draft order.
- Only league names verified against Leaguepedia are in `league_aliases.yaml`; historical names (EU LCS, NA LCS, 2025 LTA, …) come with the full backfill.
- Only the LCK 2026 Rounds 3-4 tournament is loaded so far.

## Data attribution

Data is from [Leaguepedia](https://lol.fandom.com), licensed under CC BY-SA (check Leaguepedia's current terms for the exact version). The site footer carries this attribution on every page.
