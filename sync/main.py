"""Sync CLI.

  python main.py backfill --all                      # every in-scope tournament not yet done (resumable)
  python main.py backfill --all --year-from 2024 --year-to 2024   # a slice, e.g. to test
  python main.py backfill --all --list               # show what would run, load nothing
  python main.py backfill --latest                   # most recent finished LCK regular-season split
  python main.py backfill --tournament "LCK/2026 Season/Rounds 3-4"
  python main.py nightly                             # only what is new: unfinished tournaments, match dates, champion icons, team history
  python main.py rosters                             # every player's team history (a few minutes)
  python main.py rosters --since 2026-09-01          # only players with a roster change from that date on
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
    apply_schedule,
    assign_splits,
    backfill_all,
    backfill_tournament,
    fetch_schedule,
    fetch_tournament,
    list_scope_tournaments,
    pick_latest_tournament,
)
from lolsync.client import Leaguepedia
from lolsync.images import sync_champion_icons, sync_player_photos, sync_team_logos
from lolsync.nightly import nightly
from lolsync.normalize import LeagueResolver
from lolsync.results import refresh_results
from lolsync.rosters import refresh_rosters
from lolsync.tones import classify_logos
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
    im = sub.add_parser("images", help="cache team logos and player photos locally, and record champion icon keys")
    im.add_argument("--only", choices=["teams", "players", "champions"], action="append", help="repeat to pick several; default is all")
    im.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "frontend" / "public" / "img"), help="folder for the cached images")
    im.add_argument("--r2", action="store_true", help="treat images already in the R2 bucket as present (for a runner with no local image folder)")
    im.add_argument("--limit", type=int, help="download at most this many new files per kind (for a quick trial)")
    ar = sub.add_parser("art", help="cache Legends of Runeterra card art as small WebP files (about 100 files; run once, then upload-images)")
    ar.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "frontend" / "public" / "img"), help="folder to save under (art/ is created inside it)")
    ar.add_argument("--limit", type=int, help="save at most this many new files (for a quick trial)")
    ar.add_argument("--redo", action="store_true", help="convert cards that are already saved again")
    up = sub.add_parser("upload-images", help="upload cached logos and photos to Cloudflare R2 (needs the R2_* settings)")
    up.add_argument("--from", dest="src", default=str(Path(__file__).resolve().parent.parent / "frontend" / "public" / "img"))
    lt = sub.add_parser("logo-tones", help="measure which team logos are too dark for the dark panels (needs the cached images or the R2 settings)")
    lt.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "frontend" / "public" / "img"), help="folder with the cached images")
    lt.add_argument("--redo", action="store_true", help="measure every logo again, not only the ones with no tone yet")
    sub.add_parser("results", help="fetch final placements for every event we hold (fast)")
    ro = sub.add_parser("rosters", help="rebuild each player's team history from Leaguepedia roster changes")
    ro.add_argument("--since", help="only players with a roster change from this date on (YYYY-MM-DD); default is every player")
    sc = sub.add_parser("schedule", help="refresh match dates and rounds for series already loaded (no games reloaded)")
    sc.add_argument("--since", help="only matches from this date on (YYYY-MM-DD); the full history takes about ten minutes")
    sc.add_argument("--tournament", action="append", help="only this OverviewPage (repeat for several); default is every event")
    sub.add_parser("nightly", help="load only new games and refresh match dates and champion icons (for a scheduled run)")
    args = parser.parse_args()

    log, log_path = make_logger()
    lp = Leaguepedia()
    if args.mode == "images":
        kinds = set(args.only or ["teams", "players", "champions"])
        out_dir = Path(args.out)
        remote = None
        if args.r2:
            from lolsync.r2 import client_from_env, existing_keys

            remote = existing_keys(client_from_env(), os.environ["R2_BUCKET"], ["teams/", "players/"])
            log(f"{len(remote)} images already in R2")
        with connect() as conn:
            if "champions" in kinds:
                sync_champion_icons(conn, log)
            if "teams" in kinds:
                sync_team_logos(conn, lp, out_dir, log, args.limit, remote)
            if "players" in kinds:
                sync_player_photos(conn, lp, out_dir, log, args.limit, remote)
        return 0
    if args.mode == "art":
        from lolsync.art import cache_art, card_list

        ts = Path(__file__).resolve().parent.parent / "frontend" / "src" / "lib" / "runeterra.ts"
        counts = cache_art(card_list(ts.read_text(encoding="utf-8")), Path(args.out), log, limit=args.limit, redo=args.redo)
        return 1 if counts["failed"] else 0
    if args.mode == "upload-images":
        from lolsync.r2 import client_from_env, upload_images

        upload_images(client_from_env(), os.environ["R2_BUCKET"], Path(args.src), log)
        return 0
    if args.mode == "nightly":
        log(f"Leaguepedia login: {'bot account' if lp.authenticated else 'anonymous (slow, rate-limited)'}")
        summary = nightly(connect, lp, LeagueResolver(), log)
        log(f"SUMMARY {summary}")
        return 1 if summary.get("failed") else 0
    if args.mode == "logo-tones":
        r2 = None
        if os.environ.get("R2_ACCOUNT_ID") and os.environ.get("R2_BUCKET"):
            from lolsync.r2 import client_from_env

            r2 = client_from_env()
        with connect() as conn:
            classify_logos(conn, Path(args.out), r2, os.environ.get("R2_BUCKET"), log, redo=args.redo)
        return 0
    if args.mode == "results":
        with connect() as conn:
            refresh_results(conn, lp, log)
        return 0
    if args.mode == "rosters":
        log(f"Leaguepedia login: {'bot account' if lp.authenticated else 'anonymous (slow, rate-limited)'}")
        refresh_rosters(connect, lp, log, since=args.since)  # opens its own short connections: the fetch is slow
        return 0
    if args.mode == "schedule":
        since = f"{args.since} 00:00:00" if args.since else None
        # fetch first, connect after: the fetch can take ten minutes, and a database connection left idle that long gets dropped
        fetched = fetch_schedule(lp, log, since, args.tournament)
        with connect() as conn:
            log(f"series updated: {apply_schedule(conn, fetched, log)}")
        return 0
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
