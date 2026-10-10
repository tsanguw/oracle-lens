from datetime import datetime, timezone

from lolsync.backfill import refresh_schedule


class FakeLeaguepedia:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def cargo(self, tables, fields, where=None, **_):
        self.calls.append((tables, fields, where))
        yield from self.rows


class FakeCursor:
    def __init__(self):
        self.calls = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params):
        self.calls.append((" ".join(sql.split()), params))
        self.rowcount = len(params[0])  # pretend every row changed


class FakeConn:
    def __init__(self):
        self.cur = FakeCursor()
        self.commits = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.commits += 1


def test_refresh_schedule_writes_dates_and_rounds_in_one_statement_per_chunk():
    lp = FakeLeaguepedia([
        {"MatchId": "LCK/2026/M1", "DateTime_UTC": "2026-10-10 09:00:00", "Tab": "Quarterfinals", "N_TabInPage": "6", "N_MatchInTab": "2"},
        {"MatchId": "LCK/2026/M2", "DateTime_UTC": "2026-10-11 11:30:00", "Tab": "", "N_TabInPage": "", "N_MatchInTab": ""},
    ])
    conn = FakeConn()
    updated = refresh_schedule(conn, lp, log=lambda _: None)

    assert updated == 2 and conn.commits == 1
    assert lp.calls[0][0] == "MatchSchedule" and "Tab" in lp.calls[0][1] and "N_MatchInTab" in lp.calls[0][1]
    sql, params = conn.cur.calls[0]
    assert sql.startswith("UPDATE series s SET scheduled_at = COALESCE")
    ids, dates, tabs, orders, matches = params
    first = datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc)
    assert ids == ["LCK/2026/M1", "LCK/2026/M2"]
    assert dates[0] == first
    assert (tabs, orders, matches) == (["Quarterfinals", None], [6, None], [2, None])


def test_refresh_schedule_ignores_rows_without_a_match_id_and_keeps_rows_without_a_date():
    lp = FakeLeaguepedia([
        {"MatchId": "", "DateTime_UTC": "2026-10-10 09:00:00"},
        {"MatchId": "LCK/2026/M3", "DateTime_UTC": "", "Tab": "Finals", "N_TabInPage": "5", "N_MatchInTab": "1"},
        {"MatchId": "LCK/2026/M4", "DateTime_UTC": "2026-10-12 08:00:00"},
    ])
    conn = FakeConn()
    refresh_schedule(conn, lp, log=lambda _: None)
    ids, dates, tabs, _, _ = conn.cur.calls[0][1]
    assert ids == ["LCK/2026/M3", "LCK/2026/M4"]
    assert dates[0] is None and dates[1] is not None
    assert tabs == ["Finals", None]


def test_refresh_schedule_commits_after_every_chunk_so_a_dropped_connection_loses_little():
    from lolsync import backfill

    rows = [{"MatchId": f"M{i}", "DateTime_UTC": "2026-10-10 09:00:00", "Tab": "", "N_TabInPage": "", "N_MatchInTab": ""} for i in range(backfill.SCHEDULE_CHUNK * 2 + 5)]
    conn = FakeConn()
    refresh_schedule(conn, FakeLeaguepedia(rows), log=lambda _: None)
    assert conn.commits == 3 and len(conn.cur.calls) == 3
    assert [len(c[1][0]) for c in conn.cur.calls] == [backfill.SCHEDULE_CHUNK, backfill.SCHEDULE_CHUNK, 5]


def test_stage_of_reads_the_tab_and_ignores_rows_without_one():
    from lolsync.backfill import stage_of

    assert stage_of({"Tab": " Finals ", "N_TabInPage": "5", "N_MatchInTab": "1"}) == ("Finals", 5, 1)
    assert stage_of({"Tab": "", "N_TabInPage": "5"}) == (None, None, None)
    assert stage_of({}) == (None, None, None)
