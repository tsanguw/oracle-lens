# Leaguepedia Cargo fields: findings

Verified 2026-10-08 against the live API (`action=cargotables` and `action=cargofields`).
The `Special:CargoTables` HTML page returns 403 to scripts, so the API is the source of truth.

**Not yet verified:** actual *values* (formats, units, role names). Anonymous `cargoquery` was
rate-limited after a handful of requests, so only schemas were checked. Value formats are marked
"check" below and must be confirmed once the sync can query (bot account recommended).

## Tables we'll use (all exist)

| Table | Used for |
|---|---|
| `Tournaments` | Tournament rows, league, year, split, official flag, dates |
| `Leagues` | League short names, region, level, official flag |
| `MatchSchedule` | Series: teams, winner, scores, best-of, `MatchId`, `OverviewPage` |
| `ScoreboardGames` | Game: patch, length, date, team objectives, picks/bans lists |
| `ScoreboardTeams` | Per-team-per-game rows (side, win, objectives, kills, gold) |
| `ScoreboardPlayers` | Per-player-per-game stats |
| `PicksAndBansS7` | Draft with order (Team1Ban1..5, Team1Pick1..5) |
| `PlayerRedirects` | `AllName` -> `OverviewPage` (canonical page) + `ID` |
| `TeamRedirects` | `AllName`, `OtherName`, `UniqueLine`. Also `TeamRenames` / `PlayerRenames` exist |
| `Players`, `Teams`, `Champions` | Nationality, region, champion list |

Despite the `S7` suffix, `PicksAndBansS7` is the current picks/bans table.

## Field mapping to our schema

**game** <- `ScoreboardGames`: `GameId`, `DateTime_UTC`, `Patch`, `Gamelength_Number` (check: minutes vs seconds), `MatchId`, `OverviewPage`, `Tournament`.

**team_game** <- `ScoreboardTeams`: `Team`, `Side` (check format), `IsWinner`, `Kills`, `Gold`, `Dragons`, `Barons`, `Towers`, `RiftHeralds`, `VoidGrubs`, plus `Inhibitors`, `Atakhans` and elemental drakes available.

**player_game** <- `ScoreboardPlayers`: `Name`, `Link`, `Champion`, `Role`, `Side` (Integer, probably 1/2), `Team`, `Kills/Deaths/Assists`, `CS`, `Gold`, `DamageToChampions`, `VisionScore`, `TeamKills`, `TeamGold`, `PlayerWin` (String, probably "Yes"/"No"), `GameId`.

**pick_ban** <- `PicksAndBansS7` (ordered slots) or the `Team1Bans/Picks` lists on `ScoreboardGames` (no order).

## Gaps and decisions needed

1. **No first blood field anywhere** in `ScoreboardPlayers` / `ScoreboardTeams` / `ScoreboardGames`.
   `player_game.first_blood` will be NULL for every row, so the "First blood" stat tile shows N/A.
   Revisit later (Riot match data via `RiotPlatformGameId`, or drop the stat for v1).
2. **Heralds and grubs are separate fields** (`RiftHeralds`, `VoidGrubs`). The schema has one `heralds` column. Plan: split into `heralds` and `void_grubs` in the next migration.
3. **No `is_international` flag.** `Tournaments` has `League`, `Region`, `TournamentLevel`, `IsOfficial`, `IsPlayoffs`, `Split`, `Year` (String). Derive international from `Region = 'International'` (check) and map league via our hand-written alias file.
4. **No `sub_region` field** for LCP history (PCS/VCS/LJL): derive from the old league name in `Tournaments.League`.
5. **Damage share and kill participation are derived.** Kill participation: `(K+A) / TeamKills` (present). Damage share needs the sum of `DamageToChampions` across the team's players in that game, which is computable in SQL.
6. **Vision score** exists but is likely NULL in older eras, which is our N/A case. Check by year.
7. **Side is an Integer on players, a String on teams.** Normalize to 'blue'/'red' in the sync.
8. **`Year` and `Split` are strings;** `SplitNumber` is an Integer.
9. **Team and player aliasing:** `PlayerRedirects.OverviewPage` is the canonical player page. For teams use `TeamRedirects` plus `TeamRenames` / `TeamRegionChanges`. Which of `AllName` vs `OtherName` is canonical needs a sample query (check).

## Verified values (2026-10-08, bot login, LCK 2026 Season Playoffs sample)

- `cargoquery` result keys replace underscores with spaces (`DateTime UTC`, `Gamelength Number`, `Role Number`); the sync normalizes keys back.
- `ScoreboardTeams.Side` is `"Blue"` / `"Red"`; `ScoreboardPlayers.Side` is `"1"` (blue) / `"2"` (red); `PlayerWin` is `"Yes"` / `"No"`; `IsWinner` is `"0"` / `"1"`.
- `Gamelength_Number` is **minutes** as a float (28:01 -> `28.0166...`); multiply by 60 for `length_sec`.
- Missing objective counts (e.g. `Atakhans`) come back as the empty string -> NULL.
- Roles are `Top` / `Jungle` / `Mid` / `Bot` / `Support`.
- `Tournaments`: `League` holds the **long** league name ("LoL Champions Korea"), `Region` is `"International"` for Worlds/MSI, `IsOfficial` / `IsPlayoffs` are `"0"`/`"1"`, `Date` is the end date. Some parent pages (e.g. "Worlds 2026") have blank fields; the real events are the `/Main Event` and `/Play-In` pages.
- Old LCP-region leagues are separate long names (`Pacific Championship Series`, ...) so `sub_region` is derivable.
- `PicksAndBansS7`: `Team1Pick1..5` are in draft order and `Team1Role1..5` give each pick's role; bans are `Team1Ban1..5`.
- `MatchSchedule` has `BestOf`, `Team1Score`/`Team2Score`, `Winner` (`"1"`/`"2"`), `MatchId` matching `ScoreboardGames.MatchId`.

### Alias resolution (resolves the open question above)
- **Players:** `PlayerRedirects.AllName` -> `OverviewPage` works (e.g. "Faker Herself" -> "Vanni"). `ScoreboardPlayers.Link` is already the canonical page in the sample.
- **Teams:** `TeamRedirects` only lists redirect page names (`OtherName` was empty in every sample), so it cannot give the target. Use `Teams.RenamedTo` (e.g. `SK Telecom T1` -> `T1`) followed to the end of the chain, with `TeamRenames` (`OriginalName`, `NewName`) as a cross-check.
- `Zeka (Kim Geon-woo)` style disambiguated names appear in `Roster`; use `ScoreboardPlayers.Link` instead.

### Milestone tournament
Most recent finished LCK pages: `LCK 2026 Season Playoffs` (ended 2026-09-13, 41 games), `LCK 2026 Rounds 3-4` (regular season, ended 2026-08-23). Both share `Split = "Rounds 3-4"`. The regular season has far more games per player, which suits the 5-game graying logic, so the milestone defaults to the latest non-playoff, non-qualifier tournament.

## Rate limits

Anonymous `cargoquery` hit `ratelimited` within a few requests. `cargotables` and `cargofields` were fine.
With the bot login (`LEAGUEPEDIA_BOT_USER` / `LEAGUEPEDIA_BOT_PASSWORD`) a run of ~25 cargoquery calls completed with no rate-limit errors. The `userinfo` rights list did not include `apihighlimits`, so page sizes stay at 500 and the sync keeps throttling and backoff anyway.
