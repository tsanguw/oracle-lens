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

**game_ban** (bans only) <- `PicksAndBansS7` (ordered slots) or the `Team1Bans` lists on `ScoreboardGames` (slot = list position).
**player_game.pick_order** <- the same draft's picks (`PicksAndBansS7` slots 1-5), matched to the player who played that champion; NULL when the source has no order (picks from the `Team1Picks` lists are listed by role, not in draft order) or a team lists one champion twice. Picks themselves are not stored in `game_ban`: `player_game.champion_id` is the only record of who played what (migration 016; before it, picks were stored twice and could disagree).

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

## Spot-check of loaded data (2026-10-08)

Method: re-pulled the raw `ScoreboardPlayers` / `ScoreboardGames` / `MatchSchedule` rows for `LCK/2026 Season/Rounds 3-4` straight from Cargo, recomputed each stat independently in Python (kill participation uses the source's own `TeamKills` field, not our `team_game`), and compared with `GET /api/players/:id`.

- **Players:** 5 checked (Bdd, Cuzz, Effort, PerfecT (Lee Seung-min), Minous with 1 game). Games, wins, KDA, kill participation, damage/min, damage share, gold/min, gold share, CS/min, vision/min and average game length all matched to 5+ decimal places.
- **Teams:** game W-L and series W-L for all 10 teams matched the source rows exactly (0 mismatches).
- **Not a valid check:** the `Standings` table. Its totals (e.g. Gen.G 41-19) are far larger than this page's games and did not reconcile with a simple cumulative sum, so its scope is unclear. Don't use it as ground truth without finding out what it aggregates.
- **Limits:** this verifies sync fidelity and our SQL math against the same source data, not the accuracy of Leaguepedia's own numbers.

## Findings from the full backfill (610 tournaments, 2011-2026)

Things that only showed up at scale, and how the sync handles them:

- **Cargo matches names case-insensitively.** Looking up "AN" returns the row for "An", and `GROUP BY` merges spellings. Leaguepedia has one canonical page per player or team, but scoreboards spell names inconsistently ("aphromoo", "Dplus KIA"). Every lookup therefore matches by casefold and takes the canonical spelling from Leaguepedia's own row (`resolve.py`). Matching by exact key silently dropped redirects and created duplicate players.
- **Underscores are spaces** in page titles (`Leo_(Han_Gyeo-re)` is `Leo (Han Gyeo-re)`); links are normalised the same way MediaWiki does.
- **Placeholders:** an unused ban slot is the literal text `None`; some rows say `Missing Data`; unplayed bracket slots have team `TBD` or empty. None are stored (`normalize.is_placeholder`).
- **`PicksAndBansS7` can be missing, empty, or partial** (for example only 2 of 5 bans). For each team and action the sync takes whichever of `PicksAndBansS7` and `ScoreboardTeams` has more entries, keeping `PicksAndBansS7`'s slot numbers where it has them. Picks from the scoreboard have unknown draft order (`NULL`).
- **Splits:** about 75 domestic events (Regional Finals, some playoffs, the 2025 LTA playoffs) have no `split`. The database function `assign_missing_splits()` gives them the split of the most recent earlier event of the same league and year, so "most recent split" and the split filter include playoffs. Events with nothing earlier in their year keep an empty split (promotion events that start the year before; a few unlabelled 2012-2015 events).
- **Tier-2 leagues:** from 2025 PCS, VCS and LJL continue as second-tier leagues. Only their earlier tournaments belong to LCP.
- **Regional Finals** carry `League = World Championship` with a domestic `Region`; they are loaded as that region's domestic events.
- **Team renames** follow `Teams.RenamedTo` to the current name (for example `SK Telecom T1` to `T1`, `Splyce` to `Team Vitality`). These mappings are Leaguepedia's and may join organisations that you would treat as separate eras.

### Era coverage (share of player rows with a NULL value)

| Stat | Missing |
|---|---|
| Vision score | 100% until 2017, 95% in 2018, 27% in 2019, 14-22% in 2020-21, none from 2022 |
| Damage to champions | 100% until 2019, 74% in 2020, none from 2021 |
| Gold | 39-69% in 2012-2015, 12% in 2016, none from 2017 |
| First blood | not available for any game |

These display as N/A, never 0.

### Known source gaps
- Three games in `LCK 2023 Spring` have only one team's scoreboard row (and 0 or 5 player rows) in Leaguepedia, so they cannot be stored as complete games (`skipped_games_bad_team_rows`).
- A player scoreboard row must agree with that game's team rows: the team played the game, on that side, with that result. The database enforces it (migration 015, a foreign key from `player_game` to `team_game` over game, team, side and win), so the load skips a row that disagrees and counts it as `skipped_player_rows_team_mismatch` instead of failing the tournament. Production had none when the constraint was added.
- `ScoreboardPlayers.Role` must be one of Top, Jungle, Mid, Bot, Support: the database enforces it (migration 017, `player_game_role_check`; `ROLES` in `backfill.py` is the same list, and a test keeps them equal), so the load skips any other role and counts it as `skipped_player_rows_unknown_role`. `tournament.stage` is derived by the sync from `IsQualifier`/`IsPlayoffs` (Qualifier, Playoffs, Regular season) and is checked too. `tournament.split`, the region columns and `player_team_stint.role` are not constrained (see the migration's note).
- Team spellings `bleiz eSPORTS` and `Bleiz e-SPORTS` are probably one team but differ by punctuation with no redirect, so they stay separate.

## Team history: `RosterChanges` (2026-10-12, bot login)

Source of `player_team_stint` (see `lolsync/rosters.py`). 279,301 rows. Fields used: `Date_Sort`, `Player`, `Direction`, `Team`,
`RolesIngame`, `RoleModifier`, `Status`. `Player` is the Leaguepedia page (`Mata (Edgar Cepurnieks)`), so it matches `player.name`.

- `Direction` is only `Join` or `Leave`. A spell with a team is a Join and a later Leave. A role swap, contract extension, team
  rename or switch to inactive is written as a Leave **and** a Join for the same team on the same day, so the log has to be
  folded: a Join straight back for the same team (same day, or within 45 days) continues the stint.
- `Date_Sort__precision` is `1` (a full day) for all but 3 rows, so it cannot flag an approximate date. The wiki's "approximate"
  marking is something else; we show the month and year only.
- `RolesIngame` is empty on staff rows (coaches, managers). A player who becomes a coach on the same team keeps only their player
  stint. `RolesIngame` can also be set alongside a staff role (`Mid` + `Part-Owner`): that is still a player stint.
- `Status` on a Join is the state being entered and on a Leave the state being left: `inactive` (Join with `inactive`, later a Leave
  with `inactive`), `on_loan`, `official_sub`. We skip the ones that are not a spell with a team: `pickup` (amateur one-off squads),
  `opportunities` (open to offers), `trial`, `draft_pick`, `set_to_join` / `set_to_leave` (announced, not happened), `temp_sub`
  (one-off stand-in) and `loaned_out` (the home team's note that a player is away on loan). Not checked against a real loan.
- `RoleModifier` is `Sub` (31,535 rows) or `Trainee` (586). Both are kept as a note on the stint, and a sub signing does not end
  the player's main stint.
- `Preload` names the kind of edit (`join`, `leave`, `role_swap`, `extended`, `remain`, `to_inactive`, `to_active`,
  `team_rename`, `team_rename_same_page`, `retirement`, `expire`, `gcd_*`, ...). We do not need it: Direction, Team and the dates
  carry everything we use.
- Team names are the name at the time (`SK Telecom T1`), and are resolved to the current name (`T1`) through `Teams.RenamedTo`
  like the scoreboard teams. Teams we hold no games for are kept, as plain text.
- Missing Leave rows exist: a full-time Join elsewhere closes the earlier stint on that date.
- Anonymous `cargoquery` and `Special:CargoQuery` are blocked or rate-limited; this needs the bot login.

## Rate limits

Anonymous `cargoquery` hit `ratelimited` within a few requests. `cargotables` and `cargofields` were fine.
With the bot login (`LEAGUEPEDIA_BOT_USER` / `LEAGUEPEDIA_BOT_PASSWORD`) a run of ~25 cargoquery calls completed with no rate-limit errors. The `userinfo` rights list did not include `apihighlimits`, so page sizes stay at 500 and the sync keeps throttling and backoff anyway.
