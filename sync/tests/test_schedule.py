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
        self.batches = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def executemany(self, sql, params):
        self.batches.append((" ".join(sql.split()), list(params)))
        self.rowcount = len(self.batches[-1][1])


class FakeConn:
    def __init__(self):
        self.cur = FakeCursor()
        self.commits = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.commits += 1


def test_refresh_schedule_updates_series_dates_from_match_schedule():
    lp = FakeLeaguepedia([
        {"MatchId": "LCK/2026/M1", "DateTime_UTC": "2026-10-10 09:00:00"},
        {"MatchId": "LCK/2026/M2", "DateTime_UTC": "2026-10-11 11:30:00"},
    ])
    conn = FakeConn()
    updated = refresh_schedule(conn, lp, log=lambda _: None)

    assert updated == 2 and conn.commits == 1
    assert lp.calls[0][0] == "MatchSchedule"
    sql, params = conn.cur.batches[0]
    assert sql.startswith("UPDATE series SET scheduled_at")
    first = datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc)
    assert params[0] == (first, "LCK/2026/M1", first)


def test_refresh_schedule_ignores_rows_without_a_match_id_or_date():
    lp = FakeLeaguepedia([
        {"MatchId": "", "DateTime_UTC": "2026-10-10 09:00:00"},
        {"MatchId": "LCK/2026/M3", "DateTime_UTC": ""},
        {"MatchId": "LCK/2026/M4", "DateTime_UTC": "2026-10-12 08:00:00"},
    ])
    conn = FakeConn()
    refresh_schedule(conn, lp, log=lambda _: None)
    assert [p[1] for p in conn.cur.batches[0][1]] == ["LCK/2026/M4"]


def test_refresh_schedule_also_fills_the_round_and_order_of_each_series():
    lp = FakeLeaguepedia([
        {"MatchId": "W/M1", "DateTime_UTC": "2025-11-01 09:00:00", "Tab": "Quarterfinals", "N_TabInPage": "6", "N_MatchInTab": "2"},
        {"MatchId": "W/M2", "DateTime_UTC": "2025-11-02 09:00:00", "Tab": "", "N_TabInPage": "", "N_MatchInTab": ""},
    ])
    conn = FakeConn()
    refresh_schedule(conn, lp, log=lambda _: None)

    assert "Tab" in lp.calls[0][1] and "N_MatchInTab" in lp.calls[0][1]
    sql, params = conn.cur.batches[1]
    assert sql.startswith("UPDATE series SET stage_tab")
    assert params == [("Quarterfinals", 6, 2, "W/M1", "Quarterfinals", 6, 2)]


def test_stage_of_reads_the_tab_and_ignores_rows_without_one():
    from lolsync.backfill import stage_of

    assert stage_of({"Tab": " Finals ", "N_TabInPage": "5", "N_MatchInTab": "1"}) == ("Finals", 5, 1)
    assert stage_of({"Tab": "", "N_TabInPage": "5"}) == (None, None, None)
    assert stage_of({}) == (None, None, None)
