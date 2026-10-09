# [Site name]

Browse professional League of Legends esports stats: players, teams, champions, and tournaments, with sortable leaderboards, matchup breakdowns, and shareable filters. All data comes from [Leaguepedia](https://lol.fandom.com)'s Cargo API, synced into our own Postgres database. The site never calls Leaguepedia when a visitor loads a page.

> **Status: the home page (search and recent tournaments), player page and player leaderboard are built**, on the full backfill (all six leagues, 2011 onward, plus internationals). Teams, champions, tournaments, search, and the home page are not built yet (see [Roadmap](#roadmap)).

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

python main.py backfill --all --list                               # show every in-scope tournament, load nothing
python main.py backfill --all                                      # everything not yet done (resumable)
python main.py backfill --all --year-from 2025 --year-to 2025      # just a slice
python main.py backfill --latest                                   # most recent finished LCK regular-season split
python main.py backfill --tournament "LCK/2026 Season/Rounds 3-4"  # a specific Leaguepedia page
python main.py backfill --all --force                              # re-sync even if already done
```

A full run takes a few hours (roughly 10-20 seconds per tournament with the bot login). It writes a log to `sync/logs/` (gitignored), continues past individual failures, and picks up where it left off if you run it again.

**What is in scope:** every official tournament of LCK, LPL, LEC, LCS, CBLOL and LCP (including their earlier names), the regional finals gauntlets, and all official internationals (Worlds including Play-In, MSI, First Stand, Rift Rivals, and so on). Showmatches and events with no recorded games are skipped.

How it works:

- Reads `ScoreboardGames`, `ScoreboardTeams`, `ScoreboardPlayers`, `PicksAndBansS7`, `MatchSchedule`, and `Tournaments`.
- Resolves historical names to current ones: league names via `sync/league_aliases.yaml` (hand-written), player names via `PlayerRedirects`, team names by following `Teams.RenamedTo`. Lookups are cached for the whole run.
- Leagues roll up under their current name: EU LCS → LEC, NA LCS → LCS, OGN Champions ("LoL The Champions", 2012-2015) → LCK, 2025 LTA North → LCS, 2025 LTA South → CBLOL, and pre-2025 PCS/VCS/LJL → LCP (with the old name kept as `sub_region`). From 2025 PCS, VCS and LJL continue as second-tier leagues, so those tournaments are not loaded.
- **2025 LTA playoffs** include teams from both conferences. They have no single league; each team's games land in its own conference's league through the `tournament_team_league` table, so those games count toward both LCS and CBLOL history.
- Leaguepedia tags each region's Worlds "Regional Finals" with `League = World Championship`; these are loaded as domestic events of that region's league, not as internationals.
- For games without a `PicksAndBansS7` row (older eras) the draft comes from `ScoreboardTeams`: bans keep their slot order, and picks are stored with `draft_order = NULL` because their real order is unknown.
- Progress is tracked per tournament in the `sync_state` table. Re-running is idempotent. A tournament that has not finished yet stays `pending` so a later run completes it.
- Uses throttling and exponential backoff on rate limits. If the database connection drops mid-run (for example the machine slept), the run reconnects and retries instead of hanging.
- Names are matched case-insensitively and normalised the way the wiki does, placeholder values (`None`, `TBD`, `Missing Data`) are never stored, and split-less playoffs and Regional Finals are given the split they belong to (`assign_missing_splits()`, run after every sync).

After a run, check the data with the read-only health report:

```bash
python verify.py          # integrity checks, games per league and year, and missing stats by era
```

`python repair_names.py` (dry run by default, `--apply` to change data) merges duplicate players or teams that earlier loads stored under different spellings.

Run the sync unit tests with `python -m pytest` inside `sync/`.

Leaguepedia field findings, including known gaps, are documented in [`sync/FIELDS.md`](sync/FIELDS.md).

## API

All player stat endpoints accept the filters `league`, `year`, `split`, `tournament`, `patch`, `side` (`blue`/`red`), `role`, and `domestic` (`true`/`false`).

| Endpoint | Returns |
|---|---|
| `GET /api/players/:id` | Profile, resolved range, summary stats. `:id` is the player's page name or numeric id. |
| `GET /api/players/:id/champions` | Champion pool; entries under 5 games are included and flagged `underMinSample`. |
| `GET /api/players/:id/matchups/players` | Record and average gold difference against each opposing laner in the same role. |
| `GET /api/players/:id/matchups/champions` | Record and average gold difference against the champion the lane opponent played. |
| `GET /api/players/:id/target-bans` | Champions the player has played that opponents banned, with the share of games. |
| `GET /api/search?q=` | Players (including old names), teams, champions and tournaments matching `q` (2+ characters), grouped by type, prefix matches first. `limit` per group (default 4). |
| `GET /api/tournaments/recent` | The newest official events with games, qualifiers excluded. Each has a status (`In progress` while today is inside its dates) and a standing: the current leader while running, the champion for finished playoffs and internationals, otherwise the team with the best record. `limit` default 5. |
| `GET /api/leaderboard/players` | Ranked players for the leaderboard page (see below). |
| `GET /api/filters` | Available leagues, years, splits, patches. Years with only qualifier games are left out. |
| `GET /api/meta/last-updated` | Timestamp of the last successful sync (shown in the footer). |

**Default range:** with none of `league`/`year`/`split`/`tournament`/`patch` set, a player's page shows their most recent domestic split plus any international events from that split's start onward. `domestic=true` restricts it to the league's split only. Any explicit filter replaces the default range.

The three list endpoints also accept `limit` (1-20, default 5). Lane matchups pair two `player_game` rows from the same game with the same role on opposite teams, and records are from the viewed player's perspective. Rows under 5 games are included and flagged `underMinSample`.

**Target bans** are bans by the opposing team of champions the player has played in the selected range, as a share of the player's games in that range. Bans by the player's own team, and bans of champions the player has not played (general meta bans), are excluded.

**Player leaderboard** (`/api/leaderboard/players`) accepts the same filters plus `sort` (`kda` default, `winRate`, `games`, `killParticipation`, `damagePerMin`, `csPerMin`, `visionPerMin`), `dir` (`asc`/`desc`), `page`, `pageSize` (default 25, max 100) and `qualifiers=true` to include qualifiers. Players under 5 games in the range are not ranked at all. With no range filter the default is each league's most recent split (playoffs included) from the most recent year, plus international events from the earliest of those splits onward; `domestic=true` drops the internationals. Each row's team, league and role are the ones the player used most in the range, and players with only international games show league `INTL`. A missing stat is `null`, never 0, and sorts last.

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
2. ✅ **Player page complete:** lane matchups (vs. opponents and vs. champions faced) and target bans
3. Full backfill across all leagues and years
4. ✅ Player leaderboard and home page (search, recent tournaments)
5. Teams, champions, and tournaments pages (search results already link to their future routes)
6. Nightly GitHub Actions sync and keep-awake ping
7. Deployment (static host for the frontend, free tier for the API, Neon for Postgres)

## Scope decisions

- **Qualifiers and promotions are not considered on the default leaderboard.** Events Leaguepedia flags as qualifiers (Worlds Play-In, Regional Finals, promotion and relegation series, and similar) are stored with `tournament.stage = 'Qualifier'`, and the default leaderboards exclude them. The leaderboard pages carry a note saying so. They stay in the database, so they can be included by choosing them explicitly.
- Everything is rolled up under each league's current name (see [Sync](#sync)); pre-2025 PCS, VCS and LJL count as LCP, and from 2025 they are second-tier leagues that are not loaded.

## Known limitations

- **First blood is not available** in Leaguepedia's scoreboard tables, so `first_blood` is `NULL` and the stat shows "N/A".
- **Draft order** for picks and bans is the slot within each team's picks or bans, not the true interleaved draft order.
- Leagues outside the six tracked ones (and their predecessors) are not loaded: for example LMS, OPL, TCL, LLA, and Challengers leagues. Predecessors that are not listed in `league_aliases.yaml` are not included.
- For older games the draft comes from `ScoreboardTeams`, so the real pick order is not known there (stored as `NULL`).

## Data attribution

Data is from [Leaguepedia](https://lol.fandom.com), licensed under CC BY-SA (check Leaguepedia's current terms for the exact version). The site footer carries this attribution on every page.
