"""The nightly update: load only what is new, refresh match dates, and keep champion icon keys current.

Finished tournaments are marked `done` in sync_state and never fetched again; tournaments that are running (or
failed last time) are reloaded in full, which is idempotent. Team logos and player photos are not part of it:
they are files, and a scheduled runner has no permanent disk to keep them on (see `python main.py images`).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import psycopg

from .backfill import Log, backfill_all, list_scope_tournaments, refresh_schedule
from .client import Leaguepedia
from .images import sync_champion_icons
from .normalize import LeagueResolver
from .results import refresh_results

RESULTS_DAYS = 45  # placements appear when an event ends; events older than this are only checked if they have none
RESCHEDULE_DAYS = 14  # match times can move until the day; older ones are settled


def pending_tournaments(conn: psycopg.Connection, tournaments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The in-scope tournaments that are not finished loading (never seen, running, or failed last time)."""
    done = {name for (name,) in conn.execute("SELECT tournament_name FROM sync_state WHERE status = 'done'")}
    return [t for t in tournaments if t["OverviewPage"] not in done]


def nightly(
    connect: Callable[[], psycopg.Connection], lp: Leaguepedia, resolver: LeagueResolver, log: Log = print
) -> dict[str, int]:
    """Returns the backfill summary plus `schedules` (series dates changed). `failed` > 0 means a rerun is needed."""
    tournaments = list_scope_tournaments(lp, resolver)
    with connect() as conn:
        todo = pending_tournaments(conn, tournaments)
    log(f"{len(tournaments)} in-scope tournaments, {len(todo)} to load or finish")
    summary = backfill_all(connect, lp, todo, resolver, log)
    with connect() as conn:
        since = (datetime.now(timezone.utc) - timedelta(days=RESCHEDULE_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
        summary["schedules"] = refresh_schedule(conn, lp, log, since=since)
        refresh_results(conn, lp, log, recent_days=RESULTS_DAYS)
        sync_champion_icons(conn, log)
    return summary
