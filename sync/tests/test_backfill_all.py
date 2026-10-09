import psycopg
import pytest

from lolsync import backfill
from lolsync.backfill import OutOfScope, backfill_all


class FakeConn:
    def __init__(self, n):
        self.n = n
        self.closed = False
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append(sql)

        class Result:
            def fetchone(self):
                return (7,)  # assign_missing_splits() reports how many events it changed

        return Result()

    def commit(self):
        pass

    def close(self):
        self.closed = True


def tournaments(*names):
    return [{"OverviewPage": n, "Name": n} for n in names]


@pytest.fixture
def run(monkeypatch):
    """Run backfill_all with backfill_tournament replaced by a scripted behavior per page."""
    monkeypatch.setattr(backfill.time, "sleep", lambda s: None)

    def go(script, names):
        opened, logs = [], []

        def connect():
            opened.append(FakeConn(len(opened) + 1))
            return opened[-1]

        calls = []

        def fake(conn, lp, t, cache, resolver, force=False, today=None):
            calls.append((t["OverviewPage"], conn.n))
            return script[t["OverviewPage"]](conn)

        monkeypatch.setattr(backfill, "backfill_tournament", fake)
        summary = backfill_all(connect, None, tournaments(*names), None, logs.append)
        return summary, opened, calls, logs

    return go


def test_dropped_connection_reconnects_and_retries_the_same_tournament(run):
    seen = {"n": 0}

    def flaky(conn):
        seen["n"] += 1
        if seen["n"] == 1:
            raise psycopg.OperationalError("server closed the connection unexpectedly")
        return {"games": 5}

    summary, opened, calls, logs = run({"A": flaky, "B": lambda c: {"games": 2}}, ["A", "B"])
    assert summary["synced"] == 2 and summary["reconnects"] == 1 and "failed" not in summary
    assert calls == [("A", 1), ("A", 2), ("B", 2)]  # retried on a fresh connection, then kept using it
    assert opened[0].closed  # the dead connection was closed
    assert any("reconnecting" in line for line in logs)


def test_a_failing_tournament_does_not_stop_the_run(run):
    def boom(conn):
        raise ValueError("bad data")

    summary, _, calls, _ = run({"A": boom, "B": lambda c: {"games": 3}}, ["A", "B"])
    assert summary["failed"] == 1 and summary["synced"] == 1
    assert [c[0] for c in calls] == ["A", "B"]


def test_out_of_scope_and_already_done_are_counted_separately(run):
    def oos(conn):
        raise OutOfScope("not tracked")

    summary, _, _, _ = run({"A": oos, "B": lambda c: {}, "C": lambda c: {"games": 1}}, ["A", "B", "C"])
    assert summary["out_of_scope"] == 1 and summary["already_done"] == 1 and summary["synced"] == 1


def test_connection_is_closed_when_the_run_ends(run):
    _, opened, _, _ = run({"A": lambda c: {"games": 1}}, ["A"])
    assert opened[0].closed


def test_splits_are_assigned_after_the_run_and_reported(run):
    summary, opened, _, _ = run({"A": lambda c: {"games": 1}}, ["A"])
    assert summary["splits_assigned"] == 7
    assert any("assign_missing_splits" in s for s in opened[-1].statements)
