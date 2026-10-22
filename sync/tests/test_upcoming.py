"""Events that have not started: the nightly stores them a little ahead, with their schedule (kanban #81)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from lolsync.backfill import _load, awaits_games, list_scope_tournaments
from lolsync.normalize import LeagueResolver
from lolsync.resolve import ResolveCache

TODAY = date(2026, 10, 22)


class FakeLeaguepedia:
    """Answers each Cargo table from a dict and remembers which tables were asked for."""

    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = tables
        self.asked: list[str] = []

    def cargo(self, tables, fields, where=None, **_):
        self.asked.append(tables)
        yield from self.tables.get(tables, [])


class FakeCursor:
    """Records every statement and hands out a new id for each INSERT ... RETURNING."""

    def __init__(self):
        self.statements: list[tuple[str, tuple]] = []
        self._next = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.statements.append((" ".join(sql.split()), tuple(params)))

    def executemany(self, sql, rows):
        for row in rows:
            self.execute(sql, row)

    def fetchone(self):
        self._next += 1
        return (self._next,)

    def inserts(self, table: str) -> list[tuple]:
        return [params for sql, params in self.statements if sql.startswith(f"INSERT INTO {table} ")]


class FakeConn:
    def __init__(self):
        self.cur = FakeCursor()
        self.commits = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.commits += 1


def tournament(page: str, start: str, end: str, league: str = "LoL Champions Korea", region: str = "Korea") -> dict:
    return {
        "Name": page, "OverviewPage": page, "DateStart": start, "Date": end, "League": league, "Region": region,
        "Split": "", "Year": start[:4] if start else "2026", "IsPlayoffs": "1", "IsQualifier": "0",
    }


def match(match_id: str, t1: str, t2: str, at: str | None, tab: str = "Semifinals", n: str = "1") -> dict:
    return {
        "MatchId": match_id, "Team1": t1, "Team2": t2, "Winner": "", "Team1Score": "", "Team2Score": "", "BestOf": "5",
        "IsNullified": "", "DateTime_UTC": at or "", "Tab": tab, "N_TabInPage": "1", "N_MatchInTab": n,
    }


TEAMS = [{"Name": n, "Region": "Korea", "RenamedTo": ""} for n in ("T1", "Gen.G", "KT Rolster", "Hanwha Life Esports")]


def test_the_nightly_window_keeps_events_starting_within_the_given_days_and_drops_later_ones():
    rows = [
        tournament("LCK/2026 Season/Started", "2026-10-01", "2026-10-30"),
        tournament("LCK/2026 Season/In 14 days", "2026-11-05", "2026-11-20"),
        tournament("LCK/2026 Season/In 15 days", "2026-11-06", "2026-11-20"),
    ]
    lp = FakeLeaguepedia({"Tournaments": rows})
    resolver = LeagueResolver()
    pages = lambda found: [t["OverviewPage"] for t in found]
    assert pages(list_scope_tournaments(lp, resolver, today=TODAY, upcoming_days=14)) == [
        "LCK/2026 Season/Started",
        "LCK/2026 Season/In 14 days",
    ]
    # a manual backfill keeps the old rule: nothing that has not started
    assert pages(list_scope_tournaments(lp, resolver, today=TODAY)) == ["LCK/2026 Season/Started"]


def test_an_event_awaits_games_until_its_last_day_and_never_without_an_end_date():
    assert awaits_games(tournament("A", "2026-11-01", "2026-11-10"), TODAY)
    assert awaits_games(tournament("A", "2026-10-01", "2026-10-22"), TODAY)  # ends today
    assert not awaits_games(tournament("A", "2026-10-01", "2026-10-21"), TODAY)  # ended yesterday
    assert not awaits_games(tournament("A", "2026-11-01", ""), TODAY)


def test_an_event_that_has_not_started_stores_its_row_and_scheduled_series_without_asking_for_games_data():
    lp = FakeLeaguepedia({
        "Teams": TEAMS,
        "MatchSchedule": [
            match("LCK/RF/1", "T1", "Gen.G", "2026-10-28 09:00:00"),
            match("LCK/RF/2", "KT Rolster", "Hanwha Life Esports", "2026-10-29 09:00:00", n="2"),
            match("LCK/RF/3", "TBD", "TBD", None, tab="Finals"),
        ],
    })
    conn = FakeConn()
    t = tournament("LCK/2026 Season/Regional Finals", "2026-10-27", "2026-11-11")
    counts = _load(conn, lp, t, ResolveCache(), LeagueResolver(), TODAY)

    assert counts.get("games", 0) == 0 and counts["series"] == 2 and counts["upcoming"] == 1
    assert not {"ScoreboardTeams", "ScoreboardPlayers", "PicksAndBansS7"} & set(lp.asked)
    [row] = conn.cur.inserts("tournament")
    assert row[0] == "LCK/2026 Season/Regional Finals" and row[-2:] == ("2026-10-27", "2026-11-11")
    series = conn.cur.inserts("series")
    assert [s[0] for s in series] == ["LCK/RF/1", "LCK/RF/2"]  # the TBD final is not a series yet
    assert series[0][7] == datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)
    assert series[0][4] is None  # no winner
    assert {p[0] for p in conn.cur.inserts("team")} >= {"T1", "Gen.G", "KT Rolster", "Hanwha Life Esports"}
    assert conn.cur.inserts("game") == []
    assert conn.commits == 1


def test_an_event_with_no_games_that_has_ended_or_has_no_end_date_stores_nothing():
    for end in ("2026-10-21", ""):
        lp = FakeLeaguepedia({"MatchSchedule": [match("X/1", "T1", "Gen.G", "2026-10-01 09:00:00")]})
        conn = FakeConn()
        counts = _load(conn, lp, tournament("LCK/2026 Season/Showmatch", "2026-10-01", end), ResolveCache(), LeagueResolver(), TODAY)
        assert counts == {"games": 0}
        assert lp.asked == ["ScoreboardGames"]  # one question, then nothing stored
        assert conn.cur.statements == [] and conn.commits == 0
