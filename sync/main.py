"""Sync CLI.

  python main.py backfill --latest              # most recent finished LCK regular-season split
  python main.py backfill --tournament "LCK/2026 Season/Rounds 3-4"
  python main.py nightly                        # not implemented yet
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from lolsync.backfill import backfill_tournament, pick_latest_tournament
from lolsync.client import Leaguepedia

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    bf = sub.add_parser("backfill", help="load tournaments that are not yet synced")
    group = bf.add_mutually_exclusive_group(required=True)
    group.add_argument("--tournament", help="Leaguepedia OverviewPage of the tournament")
    group.add_argument("--latest", action="store_true", help="most recent finished LCK regular season")
    bf.add_argument("--force", action="store_true", help="re-sync even if sync_state says done")
    sub.add_parser("nightly", help="only new games (not implemented yet)")
    args = parser.parse_args()

    if args.mode == "nightly":
        print("nightly mode is not implemented yet (later milestone)", file=sys.stderr)
        return 2

    lp = Leaguepedia()
    print(f"Leaguepedia login: {'bot account' if lp.authenticated else 'anonymous (slow, rate-limited)'}")
    page = args.tournament or pick_latest_tournament(lp)
    print(f"Tournament: {page}")

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        counts = backfill_tournament(conn, lp, page, force=args.force)
    for key, value in counts.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
