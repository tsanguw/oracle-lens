"""Backfill tournaments from Leaguepedia into Postgres (idempotent, resumable via sync_state)."""

from __future__ import annotations

import time
from collections import Counter, defaultdict
from datetime import date
from typing import Any, Callable

import psycopg

from .client import Leaguepedia
from .normalize import (
    LeagueResolver,
    cargo_quote,
    display_name,
    is_placeholder,
    length_sec,
    real_names,
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
MATCH_FIELDS = "MatchId,Team1,Team2,Winner,Team1Score,Team2Score,BestOf,IsNullified,DateTime_UTC,Tab,N_TabInPage,N_MatchInTab"
TOURNAMENT_FIELDS = "Name,OverviewPage,DateStart,Date,League,Region,Split,Year,IsPlayoffs,IsQualifier"

Log = Callable[[str], None]


def stage_of(row: dict[str, Any]) -> tuple[str | None, int | None, int | None]:
    """(round name, that round's order in the event, the series' order in the round) from a MatchSchedule row."""
    tab = (row.get("Tab") or "").strip()
    return (tab or None, to_int(row.get("N_TabInPage")), to_int(row.get("N_MatchInTab"))) if tab else (None, None, None)


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
        try:
            resolver.resolve(r["League"], year, r["Region"])
        except KeyError:
            continue  # e.g. second-tier PCS/VCS/LJL from 2025, or regional finals outside our leagues
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
        # Players Leaguepedia has no page for (qualifier-only appearances) can reach us under several
        # capitalisations. Leaguepedia disambiguates namesakes with a "(Real Name)" suffix, so a spelling
        # that differs only by case is the same player: reuse the one already stored.
        key = ("player", page)
        if key not in self._ids:
            self.cur.execute("SELECT id FROM player WHERE lower(name) = lower(%s) ORDER BY id LIMIT 1", (page,))
            existing = self.cur.fetchone()
            if existing:
                self._ids[key] = existing[0]
        return self._upsert("player", page, {"display_name": display_name, "nationality": nationality})

    def champion(self, name: str) -> int:
        return self._upsert("champion", name)


Draft = dict[tuple[int, str], list[tuple[str, "int | None"]]]


def build_draft(
    pb: dict[str, Any] | None,
    team_rows: list[dict[str, Any]],
    team_id: Callable[[str], int],
) -> tuple[Draft, bool]:
    """A game's draft as {(team id, 'ban'|'pick'): [(champion, slot), ...]}, plus whether any of it
    came from the ScoreboardTeams fallback.

    PicksAndBansS7 is preferred because its picks are in draft order. Wherever it has nothing for a
    team and action (no row at all, or a row with empty fields) the ScoreboardTeams lists are used:
    bans keep their slot order, but picks are listed by role, so their real draft order is unknown
    and the slot is None (stored as NULL, never guessed).
    """
    draft: Draft = {}
    if pb is not None and not is_placeholder(pb["Team1"]) and not is_placeholder(pb["Team2"]):
        for side_no, team_name in ((1, pb["Team1"]), (2, pb["Team2"])):
            tid = team_id(team_name)
            for action, label in (("ban", "Ban"), ("pick", "Pick")):
                slots = [
                    (pb[f"Team{side_no}{label}{n}"], n)
                    for n in range(1, 6)
                    if not is_placeholder(pb[f"Team{side_no}{label}{n}"])
                ]
                if slots:
                    draft[(tid, action)] = slots
    used_scoreboard = False
    for r in team_rows:
        tid = team_id(r["Team"])
        for action, raw in (("ban", r["Bans"]), ("pick", r["Picks"])):
            listed = real_names(split_list(raw))
            have = draft.get((tid, action), [])
            # Use the scoreboard list when PicksAndBansS7 has nothing, or has fewer entries (a partial
            # row). Keep PicksAndBansS7's slot for any champion it did record; a ban otherwise takes
            # its position in the list, and a pick has no known draft order.
            if len(listed) > len(have):
                known = {champ: slot for champ, slot in have}
                draft[(tid, action)] = [
                    (champ, known.get(champ, i if action == "ban" else None))
                    for i, champ in enumerate(listed, start=1)
                ]
                used_scoreboard = True
    return draft, used_scoreboard


# The roles player_game.role may hold; the database enforces the same list (migration 017). A player row with any other
# role is skipped and counted (skipped_player_rows_unknown_role) instead of failing the tournament's load.
ROLES = frozenset({"Top", "Jungle", "Mid", "Bot", "Support"})


def pick_orders(draft: Draft, champion_id: Callable[[str], int]) -> dict[tuple[int, int], int]:
    """Where each pick fell in its team's draft: {(team id, champion id): place 1-5}.

    Only picks with a known place count (a pick taken from the scoreboard lists has none), and a champion a team picked
    twice is left out, since the two picks cannot be told apart.
    """
    seen: dict[tuple[int, int], list[int | None]] = {}
    for (tid, action), entries in draft.items():
        if action != "pick":
            continue
        for champ, slot in entries:
            seen.setdefault((tid, champion_id(champ)), []).append(slot)
    return {key: slots[0] for key, slots in seen.items() if len(slots) == 1 and slots[0] is not None}


def fits_team_row(team_facts: dict[int, tuple[str, bool]], team: int, side: str, win: bool) -> bool:
    """Whether a player's row agrees with the game's team rows: the team played the game, on that side, with that result.

    The database enforces this (player_game's foreign key over game, team, side and win), so a row that fails it is
    skipped and counted here instead of aborting the whole tournament's load.
    """
    return team_facts.get(team) == (side, win)


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
        # The draft table spells teams independently; unresolved, they became ghost teams with draft rows.
        | {r["Team1"] for r in pickbans} | {r["Team2"] for r in pickbans}
    )
    resolve_team_names(lp, {n for n in all_team_names if not is_placeholder(n)}, cache)
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
                page, display_name(t["Name"], page), league_id, year, t["Split"] or None, stage,
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
            canon, info = cache.player(link)
            pid = load.player(canon, info.get("id") or name, info.get("nationality"))
            for old in {link, name} - {canon}:
                cur.execute(
                    "INSERT INTO player_alias (old_name, player_id) VALUES (%s,%s) ON CONFLICT (old_name) DO NOTHING",
                    (old, pid),
                )
            return pid

        series_ids: dict[str, int] = {}

        def upsert_series(match_id: str, t1: str, t2: str, winner: str, s1, s2, best_of, scheduled_at=None, stage=(None, None, None)) -> int:
            if match_id in series_ids:
                return series_ids[match_id]
            t1_id, t2_id = team_id(t1), team_id(t2)
            win_id = {"1": t1_id, "2": t2_id}.get(str(winner))
            score = f"{s1}-{s2}" if s1 not in (None, "") and s2 not in (None, "") else None
            cur.execute(
                """INSERT INTO series (leaguepedia_id, tournament_id, team1_id, team2_id, winner_id, score, best_of, scheduled_at,
                                       stage_tab, stage_order, stage_match)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (leaguepedia_id) DO UPDATE SET
                     tournament_id = EXCLUDED.tournament_id,
                     team1_id = EXCLUDED.team1_id, team2_id = EXCLUDED.team2_id,
                     winner_id = EXCLUDED.winner_id, score = EXCLUDED.score, best_of = EXCLUDED.best_of,
                     scheduled_at = COALESCE(EXCLUDED.scheduled_at, series.scheduled_at),
                     stage_tab = COALESCE(EXCLUDED.stage_tab, series.stage_tab),
                     stage_order = COALESCE(EXCLUDED.stage_order, series.stage_order),
                     stage_match = COALESCE(EXCLUDED.stage_match, series.stage_match)
                   RETURNING id""",
                (match_id, tournament_id, t1_id, t2_id, win_id, score, to_int(best_of), scheduled_at, *stage),
            )
            series_ids[match_id] = cur.fetchone()[0]
            counts["series"] += 1
            return series_ids[match_id]

        for m in matches:
            # A bracket slot whose teams are not decided yet ("TBD") is not a series.
            if m["MatchId"] and not is_placeholder(m["Team1"]) and not is_placeholder(m["Team2"]):
                upsert_series(m["MatchId"], m["Team1"], m["Team2"], m["Winner"], m["Team1Score"], m["Team2Score"], m["BestOf"],
                              parse_utc(m["DateTime_UTC"]), stage_of(m))

        participating: set[str] = set()
        for g in games:
            gid = g["GameId"]
            trs, prs = teams_by_game.get(gid, []), players_by_game.get(gid, [])
            if len(trs) != 2 or any(team_side(r["Side"]) is None for r in trs):
                counts["skipped_games_bad_team_rows"] += 1
                continue
            series_id = (
                upsert_series(g["MatchId"], g["Team1"], g["Team2"], g["Winner"], None, None, None)
                if g["MatchId"] and not is_placeholder(g["Team1"]) and not is_placeholder(g["Team2"]) else None
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
            for table in ("team_game", "player_game", "game_ban"):
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

            draft, used_scoreboard = build_draft(pb_by_game.get(gid), trs, team_id)
            order_of = pick_orders(draft, load.champion)

            team_facts = {row[1]: (row[2], row[3]) for row in team_rows}
            player_rows = []
            for r in prs:
                if not r["Link"] or not r["Champion"] or not r["Role"] or player_side(r["Side"]) is None:
                    counts["skipped_player_rows"] += 1
                    continue
                if r["Role"] not in ROLES:
                    counts["skipped_player_rows_unknown_role"] += 1
                    continue
                if not fits_team_row(team_facts, team_id(r["Team"]), player_side(r["Side"]), bool(to_bool(r["PlayerWin"]))):
                    counts["skipped_player_rows_team_mismatch"] += 1
                    continue
                player_rows.append((
                    game_id, player_id(r["Link"], r["Name"]), team_id(r["Team"]), load.champion(r["Champion"]),
                    r["Role"], player_side(r["Side"]), bool(to_bool(r["PlayerWin"])),
                    to_int(r["Kills"]), to_int(r["Deaths"]), to_int(r["Assists"]), to_int(r["CS"]),
                    to_int(r["Gold"]), to_int(r["DamageToChampions"]), to_int(r["VisionScore"]),
                ))
            # A pick's place in the draft goes on the one player who played it; if two of a team's players are listed
            # on the same champion (a source error) the place cannot be told apart, so it stays NULL.
            played = Counter((row[2], row[3]) for row in player_rows)
            player_rows = [row + (order_of.get((row[2], row[3])) if played[(row[2], row[3])] == 1 else None,) for row in player_rows]
            cur.executemany(
                """INSERT INTO player_game
                     (game_id, player_id, team_id, champion_id, role, side, win,
                      kills, deaths, assists, cs, gold, damage, vision, pick_order, first_blood)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL)
                   ON CONFLICT (game_id, player_id) DO NOTHING""",
                player_rows,
            )
            counts["player_games"] += len(player_rows)

            ban_rows = [
                (game_id, tid, load.champion(champ), slot)
                for (tid, action), entries in draft.items()
                if action == "ban"
                for champ, slot in entries
            ]
            if not any(draft.values()):
                counts["games_without_draft"] += 1
            elif used_scoreboard:
                counts["games_draft_from_scoreboard"] += 1
            cur.executemany(
                "INSERT INTO game_ban (game_id, team_id, champion_id, draft_order) VALUES (%s,%s,%s,%s)",
                ban_rows,
            )
            counts["bans"] += len(ban_rows)
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


def assign_splits(conn: psycopg.Connection) -> int:
    """Give split-less domestic events (playoffs, Regional Finals, LTA playoffs) the split they belong
    to. The sync re-upserts Leaguepedia's raw (empty) value, so this runs after every sync."""
    changed = conn.execute("SELECT assign_missing_splits()").fetchone()[0]
    conn.commit()
    return changed


def _reconnect(connect: Callable[[], psycopg.Connection], log: Log) -> psycopg.Connection:
    """Open a fresh connection, waiting for the database to come back (e.g. after the machine slept)."""
    for attempt in range(1, 11):
        try:
            return connect()
        except psycopg.Error as exc:
            log(f"  database unavailable (attempt {attempt}/10): {str(exc)[:120]}")
            time.sleep(min(15 * attempt, 120))
    raise RuntimeError("could not reconnect to the database")


def backfill_all(
    connect: Callable[[], psycopg.Connection],
    lp: Leaguepedia,
    tournaments: list[dict[str, Any]],
    resolver: LeagueResolver,
    log: Log,
    force: bool = False,
    pause_sec: float = 1.0,
) -> dict[str, int]:
    """Run every tournament in order, continuing past failures. Re-running resumes.

    `connect` opens a database connection. If the connection drops mid-run (the machine slept, Docker
    restarted), the run reconnects and retries the tournament instead of hanging or failing the rest.
    """
    conn = connect()
    cache = ResolveCache()
    summary: dict[str, int] = defaultdict(int)
    failures: list[tuple[str, str]] = []
    started = time.monotonic()
    for i, t in enumerate(tournaments, start=1):
        page, label = t["OverviewPage"], f"[{i}/{len(tournaments)}] {t['Name']}"
        t0 = time.monotonic()
        try:
            try:
                counts = backfill_tournament(conn, lp, t, cache, resolver, force=force)
            except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
                log(f"{label}: database connection lost ({type(exc).__name__}); reconnecting and retrying")
                summary["reconnects"] += 1
                try:
                    conn.close()
                except psycopg.Error:
                    pass
                conn = _reconnect(connect, log)
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
        for key in ("games", "player_games", "bans"):
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
    try:
        summary["splits_assigned"] = assign_splits(conn)
    except psycopg.Error as exc:  # e.g. the connection dropped on the last tournament; rerun fixes it
        log(f"  could not assign splits: {str(exc)[:120]}")
    try:
        conn.close()
    except psycopg.Error:
        pass
    return dict(summary)


SCHEDULE_CHUNK = 2000


def fetch_schedule(lp: Leaguepedia, log: Log = print, since: str | None = None, pages: list[str] | None = None) -> list[dict]:
    """Every MatchSchedule row (id, date, round) for the events asked for. Reads Leaguepedia only; touches no database."""
    where = "DateTime_UTC IS NOT NULL" + (f" AND DateTime_UTC >= '{since}'" if since else "")
    if pages:
        where += " AND OverviewPage IN (" + ",".join(cargo_quote(p) for p in pages) + ")"
    fetched: list[dict] = []
    for r in lp.cargo("MatchSchedule", "MatchId,DateTime_UTC,Tab,N_TabInPage,N_MatchInTab", where=where):
        if r["MatchId"]:
            fetched.append(r)
            if len(fetched) % 5000 == 0:
                log(f"  {len(fetched)} matches fetched so far...")
    return fetched


def apply_schedule(conn: psycopg.Connection, fetched: list[dict], log: Log = print) -> int:
    """Write dates and rounds onto the series we hold, 2000 at a time with a commit after each chunk, so a dropped
    connection loses at most one chunk and a rerun picks up where it stopped. Returns how many series changed."""
    rows = []
    for r in fetched:
        tab, order, match = stage_of(r)
        rows.append((r["MatchId"], parse_utc(r["DateTime_UTC"]) if r.get("DateTime_UTC") else None, tab, order, match))
    log(f"{len(rows)} scheduled matches fetched, {sum(1 for r in rows if r[2])} with a round")
    updated = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), SCHEDULE_CHUNK):
            part = rows[i : i + SCHEDULE_CHUNK]
            cur.execute(
                """UPDATE series s SET scheduled_at = COALESCE(v.at, s.scheduled_at), stage_tab = COALESCE(v.tab, s.stage_tab),
                          stage_order = COALESCE(v.ord, s.stage_order), stage_match = COALESCE(v.n, s.stage_match)
                   FROM unnest(%s::text[], %s::timestamptz[], %s::text[], %s::int[], %s::int[]) AS v(id, at, tab, ord, n)
                   WHERE s.leaguepedia_id = v.id
                     AND (s.scheduled_at, s.stage_tab, s.stage_order, s.stage_match) IS DISTINCT FROM
                         (COALESCE(v.at, s.scheduled_at), COALESCE(v.tab, s.stage_tab), COALESCE(v.ord, s.stage_order), COALESCE(v.n, s.stage_match))""",
                [[r[k] for r in part] for k in range(5)],
            )
            updated += cur.rowcount
            conn.commit()
            if (i // SCHEDULE_CHUNK) % 10 == 9:
                log(f"  {i + len(part)} of {len(rows)} written")
    return updated


def refresh_schedule(
    conn: psycopg.Connection, lp: Leaguepedia, log: Log = print, since: str | None = None, pages: list[str] | None = None
) -> int:
    """Fill series.scheduled_at and the stage columns (round, order) from MatchSchedule for every series we hold.

    No games are reloaded. `since` ("YYYY-MM-DD HH:MM:SS", UTC) only looks at matches from then on; the full table is
    170k rows and takes about ten minutes to fetch, while dates and rounds of matches long past never change. `pages`
    (OverviewPages) limits it to those events.
    """
    return apply_schedule(conn, fetch_schedule(lp, log, since, pages), log)
