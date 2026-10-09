"""Backfill tournaments from Leaguepedia into Postgres (idempotent, resumable via sync_state)."""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import date
from typing import Any, Callable

import psycopg

from .client import Leaguepedia
from .normalize import (
    LeagueResolver,
    cargo_quote,
    length_sec,
    parse_utc,
    player_side,
    split_list,
    team_side,
    to_bool,
    to_int,
)
from .resolve import ResolveCache, conference_team_leagues, resolve_players, resolve_team_names

GAME_FIELDS = "GameId,MatchId,Team1,Team2,DateTime_UTC,Gamelength_Number,Patch,Winner"
TEAM_FIELDS = (
    "GameId,Team,Side,IsWinner,Kills,Gold,Dragons,Barons,Towers,RiftHeralds,VoidGrubs,Bans,Picks"
)
PLAYER_FIELDS = (
    "GameId,Link,Name,Champion,Role,Side,Team,PlayerWin,Kills,Deaths,Assists,CS,Gold,"
    "DamageToChampions,VisionScore"
)
PICKBAN_FIELDS = (
    "GameId,Team1,Team2,"
    + ",".join(f"Team{t}Ban{n}" for t in (1, 2) for n in range(1, 6))
    + ","
    + ",".join(f"Team{t}Pick{n}" for t in (1, 2) for n in range(1, 6))
)
MATCH_FIELDS = "MatchId,Team1,Team2,Winner,Team1Score,Team2Score,BestOf,IsNullified"
TOURNAMENT_FIELDS = "Name,OverviewPage,DateStart,Date,League,Region,Split,Year,IsPlayoffs,IsQualifier"

Log = Callable[[str], None]


class OutOfScope(Exception):
    """The tournament's league is not one we track."""


def list_scope_tournaments(
    lp: Leaguepedia,
    resolver: LeagueResolver,
    today: date | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
) -> list[dict[str, Any]]:
    """Official tournaments in scope (domestic tier-1, regional finals, internationals), oldest first."""
    today = today or date.today()
    names = ",".join(cargo_quote(n) for n in resolver.domestic_long_names)
    regions = ",".join(cargo_quote(r) for r in resolver.regional_finals)
    where = (
        "IsOfficial='1' AND Year<>'' AND ("
        f"League IN ({names}) OR Region={cargo_quote(resolver.international_region)} "
        f"OR (League={cargo_quote(resolver.regional_finals_name)} AND Region IN ({regions})))"
    )
    rows = list(lp.cargo("Tournaments", TOURNAMENT_FIELDS, where=where, order_by="DateStart"))
    out = []
    for r in rows:
        year = to_int(r["Year"])
        if year is None:
            continue
        if year_from and year < year_from or year_to and year > year_to:
            continue
        if r["DateStart"] and r["DateStart"] > today.isoformat():
            continue  # not started yet
        out.append(r)
    # Cargo's DateStart ordering puts blank dates first; make the order deterministic.
    out.sort(key=lambda r: (r["DateStart"] or "0000", r["OverviewPage"]))
    return out


def pick_latest_tournament(lp: Leaguepedia, today: date | None = None) -> str:
    """Most recent finished LCK regular-season split (no playoffs or qualifiers)."""
    today = today or date.today()
    rows = list(
        lp.cargo(
            "Tournaments",
            "OverviewPage,Name,Date",
            where=(
                "League='LoL Champions Korea' AND IsOfficial='1' AND IsPlayoffs='0' "
                f"AND IsQualifier='0' AND Date<='{today.isoformat()}'"
            ),
            order_by="Date DESC",
        )
    )
    if not rows:
        raise RuntimeError("No finished LCK tournament found")
    return rows[0]["OverviewPage"]


def fetch_tournament(lp: Leaguepedia, page: str) -> dict[str, Any]:
    rows = list(lp.cargo("Tournaments", TOURNAMENT_FIELDS, where=f"OverviewPage={cargo_quote(page)}"))
    if not rows:
        raise RuntimeError(f"Tournament page not found: {page}")
    return rows[0]


class Loader:
    """Upsert helpers with per-run id caches."""

    def __init__(self, cur: psycopg.Cursor):
        self.cur = cur
        self._ids: dict[tuple[str, str], int] = {}

    def _upsert(self, table: str, name: str, extra: dict[str, Any] | None = None) -> int:
        key = (table, name)
        if key in self._ids:
            return self._ids[key]
        extra = {k: v for k, v in (extra or {}).items() if v is not None}
        cols = ["name", *extra]
        updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in extra) or "name = EXCLUDED.name"
        self.cur.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
            f"ON CONFLICT (name) DO UPDATE SET {updates} RETURNING id",
            [name, *extra.values()],
        )
        self._ids[key] = self.cur.fetchone()[0]
        return self._ids[key]

    def league(self, name: str, region: str | None) -> int:
        return self._upsert("league", name, {"region": region})

    def team(self, name: str, region: str | None) -> int:
        return self._upsert("team", name, {"region": region})

    def player(self, page: str, display_name: str | None, nationality: str | None) -> int:
        return self._upsert("player", page, {"display_name": display_name, "nationality": nationality})

    def champion(self, name: str) -> int:
        return self._upsert("champion", name)


def _set_state(conn: psycopg.Connection, page: str, status: str, error: str | None = None) -> None:
    conn.execute(
        """INSERT INTO sync_state (tournament_name, status, last_synced_at, error)
           VALUES (%s, %s, CASE WHEN %s IN ('done', 'pending') THEN now() END, %s)
           ON CONFLICT (tournament_name) DO UPDATE
           SET status = EXCLUDED.status, error = EXCLUDED.error,
               last_synced_at = COALESCE(EXCLUDED.last_synced_at, sync_state.last_synced_at)""",
        (page, status, status, error),
    )
    conn.commit()


def backfill_tournament(
    conn: psycopg.Connection,
    lp: Leaguepedia,
    tournament: dict[str, Any],
    cache: ResolveCache,
    resolver: LeagueResolver,
    force: bool = False,
    today: date | None = None,
) -> dict[str, int]:
    """Load one tournament. Returns counts, or {} when skipped as already done."""
    page = tournament["OverviewPage"]
    state = conn.execute("SELECT status FROM sync_state WHERE tournament_name = %s", (page,)).fetchone()
    if state and state[0] == "done" and not force:
        return {}

    _set_state(conn, page, "in_progress")
    try:
        counts = _load(conn, lp, tournament, cache, resolver)
    except OutOfScope:
        conn.rollback()
        _set_state(conn, page, "done", "out of scope")
        raise
    except Exception as exc:
        conn.rollback()
        _set_state(conn, page, "failed", str(exc)[:500])
        raise
    conn.execute(
        """INSERT INTO meta (key, value) VALUES ('last_synced_at', now()::text)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"""
    )
    conn.commit()
    # A tournament that has not ended yet is only partially loaded; keep it pending for the nightly sync.
    today = today or date.today()
    ended = bool(tournament["Date"]) and tournament["Date"] < today.isoformat()
    _set_state(conn, page, "done" if ended else "pending")
    return counts


def _load(
    conn: psycopg.Connection,
    lp: Leaguepedia,
    t: dict[str, Any],
    cache: ResolveCache,
    resolver: LeagueResolver,
) -> dict[str, int]:
    page = t["OverviewPage"]
    year = int(t["Year"])
    try:
        res = resolver.resolve(t["League"], year, t["Region"])
    except KeyError as exc:
        raise OutOfScope(str(exc)) from exc

    where = f"OverviewPage={cargo_quote(page)}"
    games = list(lp.cargo("ScoreboardGames", GAME_FIELDS, where=where))
    counts: dict[str, int] = defaultdict(int)
    if not games:
        return {"games": 0}  # showmatches, cancelled events: nothing to store

    teams = list(lp.cargo("ScoreboardTeams", TEAM_FIELDS, where=where))
    players = list(lp.cargo("ScoreboardPlayers", PLAYER_FIELDS, where=where))
    pickbans = list(lp.cargo("PicksAndBansS7", PICKBAN_FIELDS, where=where))
    matches = list(lp.cargo("MatchSchedule", MATCH_FIELDS, where=where))

    all_team_names = (
        {g["Team1"] for g in games} | {g["Team2"] for g in games}
        | {r["Team"] for r in teams} | {r["Team"] for r in players}
        | {m["Team1"] for m in matches} | {m["Team2"] for m in matches}
    )
    resolve_team_names(lp, all_team_names, cache)
    resolve_players(lp, (p["Link"] for p in players), cache)

    teams_by_game: dict[str, list[dict]] = defaultdict(list)
    for r in teams:
        teams_by_game[r["GameId"]].append(r)
    players_by_game: dict[str, list[dict]] = defaultdict(list)
    for r in players:
        players_by_game[r["GameId"]].append(r)
    pb_by_game = {r["GameId"]: r for r in pickbans}

    team_conference: dict[str, str] = {}
    if res.multi_league:
        team_conference = conference_team_leagues(lp, cache, resolver.conference_leagues(t["League"]), year)

    with conn.cursor() as cur:
        load = Loader(cur)
        for short, v in resolver.leagues.items():
            load.league(short, v["region"])
        league_id = load.league(res.league, None) if res.league else None

        stage = "Qualifier" if t["IsQualifier"] == "1" else ("Playoffs" if t["IsPlayoffs"] == "1" else "Regular season")
        cur.execute(
            """INSERT INTO tournament
                 (leaguepedia_name, name, league_id, year, split, stage, is_international, sub_region, start_date, end_date)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (leaguepedia_name) DO UPDATE SET
                 name = EXCLUDED.name,
                 league_id = EXCLUDED.league_id, year = EXCLUDED.year, split = EXCLUDED.split,
                 stage = EXCLUDED.stage, is_international = EXCLUDED.is_international,
                 sub_region = EXCLUDED.sub_region, start_date = EXCLUDED.start_date,
                 end_date = EXCLUDED.end_date
               RETURNING id""",
            (
                page, t["Name"], league_id, year, t["Split"] or None, stage,
                res.is_international, res.sub_region, t["DateStart"] or None, t["Date"] or None,
            ),
        )
        tournament_id = cur.fetchone()[0]

        def team_id(name: str) -> int:
            cur_name = cache.current_team(name)
            tid = load.team(cur_name, cache.team_region.get(cur_name))
            if cur_name != name:
                cur.execute(
                    "INSERT INTO team_alias (old_name, team_id) VALUES (%s,%s) ON CONFLICT (old_name) DO NOTHING",
                    (name, tid),
                )
            return tid

        def player_id(link: str, name: str) -> int:
            canon = cache.player_canonical.get(link, link)
            info = cache.player_info.get(canon, {})
            pid = load.player(canon, info.get("id") or name, info.get("nationality"))
            for old in {link, name} - {canon}:
                cur.execute(
                    "INSERT INTO player_alias (old_name, player_id) VALUES (%s,%s) ON CONFLICT (old_name) DO NOTHING",
                    (old, pid),
                )
            return pid

        series_ids: dict[str, int] = {}

        def upsert_series(match_id: str, t1: str, t2: str, winner: str, s1, s2, best_of) -> int:
            if match_id in series_ids:
                return series_ids[match_id]
            t1_id, t2_id = team_id(t1), team_id(t2)
            win_id = {"1": t1_id, "2": t2_id}.get(str(winner))
            score = f"{s1}-{s2}" if s1 not in (None, "") and s2 not in (None, "") else None
            cur.execute(
                """INSERT INTO series (leaguepedia_id, tournament_id, team1_id, team2_id, winner_id, score, best_of)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (leaguepedia_id) DO UPDATE SET
                     tournament_id = EXCLUDED.tournament_id,
                     team1_id = EXCLUDED.team1_id, team2_id = EXCLUDED.team2_id,
                     winner_id = EXCLUDED.winner_id, score = EXCLUDED.score, best_of = EXCLUDED.best_of
                   RETURNING id""",
                (match_id, tournament_id, t1_id, t2_id, win_id, score, to_int(best_of)),
            )
            series_ids[match_id] = cur.fetchone()[0]
            counts["series"] += 1
            return series_ids[match_id]

        for m in matches:
            if m["MatchId"] and m["Team1"] and m["Team2"]:
                upsert_series(m["MatchId"], m["Team1"], m["Team2"], m["Winner"], m["Team1Score"], m["Team2Score"], m["BestOf"])

        participating: set[str] = set()
        for g in games:
            gid = g["GameId"]
            trs, prs = teams_by_game.get(gid, []), players_by_game.get(gid, [])
            if len(trs) != 2 or any(team_side(r["Side"]) is None for r in trs):
                counts["skipped_games_bad_team_rows"] += 1
                continue
            series_id = (
                upsert_series(g["MatchId"], g["Team1"], g["Team2"], g["Winner"], None, None, None)
                if g["MatchId"] and g["Team1"] and g["Team2"] else None
            )
            cur.execute(
                """INSERT INTO game (leaguepedia_id, series_id, tournament_id, patch, played_at, length_sec)
                   VALUES (%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (leaguepedia_id) DO UPDATE SET
                     series_id = EXCLUDED.series_id, tournament_id = EXCLUDED.tournament_id,
                     patch = EXCLUDED.patch, played_at = EXCLUDED.played_at, length_sec = EXCLUDED.length_sec
                   RETURNING id""",
                (gid, series_id, tournament_id, g["Patch"] or None, parse_utc(g["DateTime_UTC"]), length_sec(g["Gamelength_Number"])),
            )
            game_id = cur.fetchone()[0]
            for table in ("team_game", "player_game", "pick_ban"):
                cur.execute(f"DELETE FROM {table} WHERE game_id = %s", (game_id,))

            team_rows = []
            for r in trs:
                participating.add(cache.current_team(r["Team"]))
                team_rows.append((
                    game_id, team_id(r["Team"]), team_side(r["Side"]), bool(to_bool(r["IsWinner"])),
                    to_int(r["Kills"]), to_int(r["Gold"]), to_int(r["Dragons"]), to_int(r["Barons"]),
                    to_int(r["RiftHeralds"]), to_int(r["VoidGrubs"]), to_int(r["Towers"]),
                ))
            cur.executemany(
                """INSERT INTO team_game (game_id, team_id, side, win, kills, gold, dragons, barons, heralds, void_grubs, towers)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                team_rows,
            )
            counts["team_games"] += len(team_rows)

            player_rows = []
            for r in prs:
                if not r["Link"] or not r["Champion"] or not r["Role"] or player_side(r["Side"]) is None:
                    counts["skipped_player_rows"] += 1
                    continue
                player_rows.append((
                    game_id, player_id(r["Link"], r["Name"]), team_id(r["Team"]), load.champion(r["Champion"]),
                    r["Role"], player_side(r["Side"]), bool(to_bool(r["PlayerWin"])),
                    to_int(r["Kills"]), to_int(r["Deaths"]), to_int(r["Assists"]), to_int(r["CS"]),
                    to_int(r["Gold"]), to_int(r["DamageToChampions"]), to_int(r["VisionScore"]),
                ))
            cur.executemany(
                """INSERT INTO player_game
                     (game_id, player_id, team_id, champion_id, role, side, win,
                      kills, deaths, assists, cs, gold, damage, vision, first_blood)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL)
                   ON CONFLICT (game_id, player_id) DO NOTHING""",
                player_rows,
            )
            counts["player_games"] += len(player_rows)

            draft_rows: list[tuple] = []
            pb = pb_by_game.get(gid)
            if pb is not None:
                # PicksAndBansS7: picks are in draft order.
                for side_no, team_name in ((1, pb["Team1"]), (2, pb["Team2"])):
                    tid = team_id(team_name)
                    for action, label in (("ban", "Ban"), ("pick", "Pick")):
                        for slot in range(1, 6):
                            champ = pb[f"Team{side_no}{label}{slot}"]
                            if champ:
                                draft_rows.append((game_id, tid, load.champion(champ), action, slot))
            else:
                # Older games: fall back to ScoreboardTeams. Bans are in slot order; picks are listed
                # by role, so their real draft order is unknown (stored as NULL, never guessed).
                for r in trs:
                    tid = team_id(r["Team"])
                    for slot, champ in enumerate(split_list(r["Bans"]), start=1):
                        draft_rows.append((game_id, tid, load.champion(champ), "ban", slot))
                    for champ in split_list(r["Picks"]):
                        draft_rows.append((game_id, tid, load.champion(champ), "pick", None))
                counts["games_draft_from_scoreboard" if draft_rows else "games_without_draft"] += 1
            cur.executemany(
                "INSERT INTO pick_ban (game_id, team_id, champion_id, action, draft_order) VALUES (%s,%s,%s,%s,%s)",
                draft_rows,
            )
            counts["pick_bans"] += len(draft_rows)
            counts["games"] += 1

        if res.multi_league:
            cur.execute("DELETE FROM tournament_team_league WHERE tournament_id = %s", (tournament_id,))
            for team_name in sorted(participating):
                conference = team_conference.get(team_name) or next(
                    (lg for tm, lg in team_conference.items() if cache.current_team(tm) == team_name), None
                )
                if conference is None:
                    counts["unmapped_multi_league_teams"] += 1
                    continue
                cur.execute(
                    "INSERT INTO tournament_team_league (tournament_id, team_id, league_id) VALUES (%s,%s,%s)",
                    (tournament_id, team_id(team_name), load.league(conference, None)),
                )
                counts["team_league_rows"] += 1
    conn.commit()
    return dict(counts)


def backfill_all(
    conn: psycopg.Connection,
    lp: Leaguepedia,
    tournaments: list[dict[str, Any]],
    resolver: LeagueResolver,
    log: Log,
    force: bool = False,
    pause_sec: float = 1.0,
) -> dict[str, int]:
    """Run every tournament in order, continuing past failures. Re-running resumes."""
    cache = ResolveCache()
    summary: dict[str, int] = defaultdict(int)
    failures: list[tuple[str, str]] = []
    started = time.monotonic()
    for i, t in enumerate(tournaments, start=1):
        page, label = t["OverviewPage"], f"[{i}/{len(tournaments)}] {t['Name']}"
        t0 = time.monotonic()
        try:
            counts = backfill_tournament(conn, lp, t, cache, resolver, force=force)
        except OutOfScope as exc:
            summary["out_of_scope"] += 1
            log(f"{label}: out of scope ({exc})")
            continue
        except Exception as exc:  # keep going; the failure is recorded in sync_state and retried next run
            summary["failed"] += 1
            failures.append((page, str(exc)[:200]))
            log(f"{label}: FAILED ({type(exc).__name__}: {str(exc)[:200]})")
            continue
        if not counts:
            summary["already_done"] += 1
            continue
        summary["synced"] += 1
        for key in ("games", "player_games", "pick_bans"):
            summary[key] += counts.get(key, 0)
        extras = {k: v for k, v in counts.items() if k.startswith(("skipped", "games_without", "games_draft", "unmapped"))}
        log(
            f"{label}: {counts.get('games', 0)} games in {time.monotonic() - t0:.0f}s"
            + (f"  {extras}" if extras else "")
        )
        time.sleep(pause_sec)
    summary["elapsed_min"] = round((time.monotonic() - started) / 60)
    for page, err in failures:
        log(f"  failed: {page}: {err}")
    return dict(summary)
