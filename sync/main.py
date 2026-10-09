"""Sync CLI.

  python main.py backfill --all                      # every in-scope tournament not yet done (resumable)
  python main.py backfill --all --year-from 2024 --year-to 2024   # a slice, e.g. to test
  python main.py backfill --all --list               # show what would run, load nothing
  python main.py backfill --latest                   # most recent finished LCK regular-season split
  python main.py backfill --tournament "LCK/2026 Season/Rounds 3-4"
  python main.py nightly                             # not implemented yet
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from lolsync.backfill import (
    assign_splits,
    backfill_all,
    backfill_tournament,
    fetch_tournament,
    list_scope_tournaments,
    pick_latest_tournament,
)
from lolsync.client import Leaguepedia
from lolsync.normalize import LeagueResolver
from lolsync.resolve import ResolveCache

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")


def connect() -> psycopg.Connection:
    """TCP keepalives and a connect timeout, so a connection that died while the machine slept
    raises an error instead of blocking forever."""
    return psycopg.connect(
        os.environ["DATABASE_URL"],
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=3,
    )


def make_logger() -> tuple:
    """Print and append to sync/logs/ (gitignored) so a long run leaves a record."""
    logs = ROOT / "logs"
    logs.mkdir(exist_ok=True)
    path = logs / f"backfill-{datetime.now():%Y%m%d-%H%M%S}.log"
    handle = path.open("a", encoding="utf-8")

    def log(message: str) -> None:
        line = f"{datetime.now():%H:%M:%S} {message}"
        print(line, flush=True)
        handle.write(line + "\n")
        handle.flush()

    return log, path


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    bf = sub.add_parser("backfill", help="load tournaments that are not yet synced")
    group = bf.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="every in-scope tournament")
    group.add_argument("--tournament", help="Leaguepedia OverviewPage of one tournament")
    group.add_argument("--latest", action="store_true", help="most recent finished LCK regular season")
    bf.add_argument("--force", action="store_true", help="re-sync even if sync_state says done")
    bf.add_argument("--list", action="store_true", help="with --all: list tournaments and exit")
    bf.add_argument("--year-from", type=int)
    bf.add_argument("--year-to", type=int)
    sub.add_parser("nightly", help="only new games (not implemented yet)")
    args = parser.parse_args()

    if args.mode == "nightly":
        print("nightly mode is not implemented yet (later milestone)", file=sys.stderr)
        return 2

    log, log_path = make_logger()
    lp = Leaguepedia()
    log(f"Leaguepedia login: {'bot account' if lp.authenticated else 'anonymous (slow, rate-limited)'}")
    resolver = LeagueResolver()

    if args.all:
        tournaments = list_scope_tournaments(lp, resolver, year_from=args.year_from, year_to=args.year_to)
        log(f"{len(tournaments)} in-scope tournaments (log: {log_path})")
        if args.list:
            for t in tournaments:
                log(f"  {t['DateStart'] or '?':10s} {t['Year']} {t['Region']:14s} {t['Name']}")
            return 0
        summary = backfill_all(connect, lp, tournaments, resolver, log, force=args.force)
        log(f"SUMMARY {summary}")
        return 1 if summary.get("failed") else 0

    page = args.tournament or pick_latest_tournament(lp)
    log(f"Tournament: {page}")
    with connect() as conn:
        counts = backfill_tournament(conn, lp, fetch_tournament(lp, page), ResolveCache(), resolver, force=args.force)
        assign_splits(conn)
    for key, value in counts.items():
        log(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
