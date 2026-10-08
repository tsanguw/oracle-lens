"""Backfill one tournament from Leaguepedia into Postgres (idempotent, resumable via sync_state)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Iterable

import psycopg

from .client import Leaguepedia
from .normalize import (
    LeagueResolver,
    cargo_quote,
    length_sec,
    parse_utc,
    player_side,
    team_side,
    to_bool,
    to_int,
)

LOOKUP_CHUNK = 80

GAME_FIELDS = (
    "GameId,MatchId,Team1,Team2,DateTime_UTC,Gamelength_Number,Patch,Winner"
)
TEAM_FIELDS = (
    "GameId,Team,Side,IsWinner,Kills,Gold,Dragons,Barons,Towers,RiftHeralds,VoidGrubs"
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


def _lookup(lp: Leaguepedia, table: str, fields: str, key: str, keys: Iterable[str]):
    keys = sorted(set(k for k in keys if k))
    for i in range(0, len(keys), LOOKUP_CHUNK):
        chunk = keys[i : i + LOOKUP_CHUNK]
        where = f"{key} IN ({','.join(cargo_quote(k) for k in chunk)})"
        yield from lp.cargo(table, fields, where=where)


def resolve_team_names(lp: Leaguepedia, names: Iterable[str]) -> tuple[dict[str, str], dict[str, str]]:
    """Follow Teams.RenamedTo chains. Returns (name -> current name, current name -> region)."""
    current = {n: n for n in names if n}
    region: dict[str, str] = {}
    pending = set(current)
    for _ in range(6):  # chains are short; cap defensively
        if not pending:
            break
        nxt: set[str] = set()
        for row in _lookup(lp, "Teams", "Name,Region,RenamedTo", "Name", pending):
            region[row["Name"]] = row["Region"]
            if row["RenamedTo"]:
                for orig, cur in current.items():
                    if cur == row["Name"]:
                        current[orig] = row["RenamedTo"]
                nxt.add(row["RenamedTo"])
        pending = nxt - set(region)
    return current, region


def resolve_players(lp: Leaguepedia, links: Iterable[str]) -> tuple[dict[str, str], dict[str, dict]]:
    """Map Link -> canonical page via PlayerRedirects, then load ID/nationality for the pages."""
    links = sorted(set(l for l in links if l))
    canonical = {l: l for l in links}
    for row in _lookup(lp, "PlayerRedirects", "AllName,OverviewPage", "AllName", links):
        if row["OverviewPage"]:
            canonical[row["AllName"]] = row["OverviewPage"]
    info: dict[str, dict] = {}
    for row in _lookup(lp, "Players", "OverviewPage,ID,Country,NationalityPrimary", "OverviewPage", canonical.values()):
        # NationalityPrimary is often blank; Country is the reliably filled field.
        nationality = row["NationalityPrimary"] or row["Country"] or None
        info[row["OverviewPage"]] = {"id": row["ID"], "nationality": nationality}
    return canonical, info


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
           VALUES (%s, %s, CASE WHEN %s = 'done' THEN now() END, %s)
           ON CONFLICT (tournament_name) DO UPDATE
           SET status = EXCLUDED.status, error = EXCLUDED.error,
               last_synced_at = COALESCE(EXCLUDED.last_synced_at, sync_state.last_synced_at)""",
        (page, status, status, error),
    )
    conn.commit()


def backfill_tournament(
    conn: psycopg.Connection, lp: Leaguepedia, page: str, force: bool = False
) -> dict[str, int]:
    state = conn.execute("SELECT status FROM sync_state WHERE tournament_name = %s", (page,)).fetchone()
    if state and state[0] == "done" and not force:
        print(f"{page}: already synced, skipping (use --force to redo)")
        return {}

    _set_state(conn, page, "in_progress")
    try:
        counts = _load(conn, lp, page)
    except Exception as exc:
        conn.rollback()
        _set_state(conn, page, "failed", str(exc)[:500])
        raise
    conn.execute(
        """INSERT INTO meta (key, value) VALUES ('last_synced_at', now()::text)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"""
    )
    conn.commit()
    _set_state(conn, page, "done")
    return counts


def _load(conn: psycopg.Connection, lp: Leaguepedia, page: str) -> dict[str, int]:
    resolver = LeagueResolver()

    trows = list(
        lp.cargo(
            "Tournaments",
            "Name,OverviewPage,DateStart,Date,League,Split,Year,IsPlayoffs",
            where=f"OverviewPage={cargo_quote(page)}",
        )
    )
    if not trows:
        raise RuntimeError(f"Tournament page not found: {page}")
    t = trows[0]
    year = int(t["Year"])
    league_short, is_intl, sub_region = resolver.resolve(t["League"], year)

    games = list(lp.cargo("ScoreboardGames", GAME_FIELDS, where=f"OverviewPage={cargo_quote(page)}"))
    teams = list(lp.cargo("ScoreboardTeams", TEAM_FIELDS, where=f"OverviewPage={cargo_quote(page)}"))
    players = list(lp.cargo("ScoreboardPlayers", PLAYER_FIELDS, where=f"OverviewPage={cargo_quote(page)}"))
    pickbans = list(lp.cargo("PicksAndBansS7", PICKBAN_FIELDS, where=f"OverviewPage={cargo_quote(page)}"))
    matches = list(lp.cargo("MatchSchedule", MATCH_FIELDS, where=f"OverviewPage={cargo_quote(page)}"))

    all_team_names = (
        {g["Team1"] for g in games} | {g["Team2"] for g in games}
        | {r["Team"] for r in teams} | {r["Team"] for r in players}
        | {m["Team1"] for m in matches} | {m["Team2"] for m in matches}
    )
    team_current, team_region = resolve_team_names(lp, all_team_names)
    player_canonical, player_info = resolve_players(lp, (p["Link"] for p in players))

    teams_by_game: dict[str, list[dict]] = defaultdict(list)
    for r in teams:
        teams_by_game[r["GameId"]].append(r)
    players_by_game: dict[str, list[dict]] = defaultdict(list)
    for r in players:
        players_by_game[r["GameId"]].append(r)
    pb_by_game = {r["GameId"]: r for r in pickbans}

    counts = defaultdict(int)
    with conn.cursor() as cur:
        load = Loader(cur)

        for short, v in resolver.leagues.items():
            load.league(short, v["region"])
        league_id = load.league(league_short, None) if league_short else None

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
                page, t["Name"], league_id, year, t["Split"] or None,
                "Playoffs" if t["IsPlayoffs"] == "1" else "Regular season",
                is_intl, sub_region, t["DateStart"] or None, t["Date"] or None,
            ),
        )
        tournament_id = cur.fetchone()[0]

        def team_id(name: str) -> int:
            cur_name = team_current.get(name, name)
            tid = load.team(cur_name, team_region.get(cur_name))
            if cur_name != name:
                cur.execute(
                    "INSERT INTO team_alias (old_name, team_id) VALUES (%s,%s) ON CONFLICT (old_name) DO NOTHING",
                    (name, tid),
                )
            return tid

        def player_id(link: str, name: str) -> int:
            canon = player_canonical.get(link, link)
            info = player_info.get(canon, {})
            pid = load.player(canon, info.get("id") or name, info.get("nationality"))
            for old in {link, name} - {canon}:
                cur.execute(
                    "INSERT INTO player_alias (old_name, player_id) VALUES (%s,%s) ON CONFLICT (old_name) DO NOTHING",
                    (old, pid),
                )
            return pid

        # Series (MatchSchedule); series missing from the schedule are created from their games below.
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

        for g in games:
            gid = g["GameId"]
            trs, prs = teams_by_game.get(gid, []), players_by_game.get(gid, [])
            if len(trs) != 2:
                counts["skipped_games_no_team_rows"] += 1
                continue
            series_id = (
                upsert_series(g["MatchId"], g["Team1"], g["Team2"], g["Winner"], None, None, None)
                if g["MatchId"] else None
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

            for r in trs:
                cur.execute(
                    """INSERT INTO team_game (game_id, team_id, side, win, kills, gold, dragons, barons, heralds, void_grubs, towers)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        game_id, team_id(r["Team"]), team_side(r["Side"]), bool(to_bool(r["IsWinner"])),
                        to_int(r["Kills"]), to_int(r["Gold"]), to_int(r["Dragons"]), to_int(r["Barons"]),
                        to_int(r["RiftHeralds"]), to_int(r["VoidGrubs"]), to_int(r["Towers"]),
                    ),
                )
                counts["team_games"] += 1

            for r in prs:
                if not r["Link"] or not r["Champion"]:
                    counts["skipped_player_rows"] += 1
                    continue
                cur.execute(
                    """INSERT INTO player_game
                         (game_id, player_id, team_id, champion_id, role, side, win,
                          kills, deaths, assists, cs, gold, damage, vision, first_blood)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL)
                       ON CONFLICT (game_id, player_id) DO NOTHING""",
                    (
                        game_id, player_id(r["Link"], r["Name"]), team_id(r["Team"]), load.champion(r["Champion"]),
                        r["Role"], player_side(r["Side"]), bool(to_bool(r["PlayerWin"])),
                        to_int(r["Kills"]), to_int(r["Deaths"]), to_int(r["Assists"]), to_int(r["CS"]),
                        to_int(r["Gold"]), to_int(r["DamageToChampions"]), to_int(r["VisionScore"]),
                    ),
                )
                counts["player_games"] += 1

            pb = pb_by_game.get(gid)
            if pb is None:
                counts["games_without_pickban"] += 1
            else:
                for side_no, team_name in ((1, pb["Team1"]), (2, pb["Team2"])):
                    tid = team_id(team_name)
                    for action, label in (("ban", "Ban"), ("pick", "Pick")):
                        for slot in range(1, 6):
                            champ = pb[f"Team{side_no}{label}{slot}"]
                            if champ:
                                cur.execute(
                                    "INSERT INTO pick_ban (game_id, team_id, champion_id, action, draft_order) VALUES (%s,%s,%s,%s,%s)",
                                    (game_id, tid, load.champion(champ), action, slot),
                                )
                                counts["pick_bans"] += 1
            counts["games"] += 1
    conn.commit()
    return dict(counts)
