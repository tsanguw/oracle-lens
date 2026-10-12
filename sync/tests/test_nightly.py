from lolsync import nightly as mod


class FakeConn:
    def __init__(self, done):
        self.done = done

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        assert "status = 'done'" in sql
        return [(name,) for name in self.done]


def tournaments(*pages):
    return [{"OverviewPage": p, "Name": p} for p in pages]


def test_only_unfinished_tournaments_are_loaded():
    todo = mod.pending_tournaments(FakeConn({"LCK/2025", "LEC/2025"}), tournaments("LCK/2025", "LCK/2026", "LEC/2025", "Worlds/2026"))
    assert [t["OverviewPage"] for t in todo] == ["LCK/2026", "Worlds/2026"]


def test_nightly_loads_pending_then_refreshes_dates_and_icons(monkeypatch):
    calls = []
    monkeypatch.setattr(mod, "list_scope_tournaments", lambda lp, resolver: tournaments("A", "B", "C"))
    monkeypatch.setattr(mod, "backfill_all", lambda connect, lp, todo, resolver, log: calls.append(("backfill", [t["OverviewPage"] for t in todo])) or {"synced": 1})
    monkeypatch.setattr(mod, "refresh_schedule", lambda conn, lp, log, since=None: calls.append(("schedule", bool(since))) or 7)
    monkeypatch.setattr(mod, "refresh_results", lambda conn, lp, log, recent_days=None: calls.append(("results", recent_days)) or {})
    monkeypatch.setattr(mod, "sync_champion_icons", lambda conn, log: calls.append(("icons",)))
    monkeypatch.setattr(mod, "refresh_rosters", lambda connect, lp, log, since=None: calls.append(("rosters", bool(since))) or {"stints": 3})
    summary = mod.nightly(lambda: FakeConn({"A"}), object(), object(), lambda m: None)
    assert calls == [("backfill", ["B", "C"]), ("schedule", True), ("results", mod.RESULTS_DAYS), ("icons",), ("rosters", True)]
    assert summary == {"synced": 1, "schedules": 7, "stints": 3}
