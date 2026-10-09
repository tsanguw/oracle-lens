"""One-off: copy the local Docker database (schema and data) into the production Neon database.

  python copy_to_neon.py            # refuses if Neon already has tables
  python copy_to_neon.py --replace  # drops everything in Neon's public schema first

Reads PROD_DATABASE_URL from the repo-root .env and never prints it. Uses pg_dump and psql inside the local
Docker container, so no Postgres client has to be installed. Afterwards it compares row counts table by table.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = "lol-esports-stats-site-db-1"


def counts(url: str) -> dict[str, int]:
    with psycopg.connect(url, connect_timeout=20) as conn:
        tables = [r[0] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")]
        return {t: conn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0] for t in tables}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--replace", action="store_true", help="wipe Neon's public schema before copying")
    args = parser.parse_args()
    env = dotenv_values(ROOT / ".env")
    prod, local = env.get("PROD_DATABASE_URL"), env["DATABASE_URL"]
    if not prod:
        print("PROD_DATABASE_URL is empty in .env", file=sys.stderr)
        return 2
    host = re.sub(r"^.*@", "", prod).split("/")[0]
    print(f"Target: {host}")

    existing = counts(prod)
    if existing and not args.replace:
        print(f"Neon already has {len(existing)} tables; rerun with --replace to wipe and copy again.", file=sys.stderr)
        return 1
    if existing:
        with psycopg.connect(prod, autocommit=True) as conn:
            conn.execute("DROP SCHEMA public CASCADE")
            conn.execute("CREATE SCHEMA public")
        print("Neon public schema wiped.")

    print("Copying (a few minutes)...")
    dump = subprocess.Popen(
        ["docker", "exec", CONTAINER, "pg_dump", "-U", "lolstats", "-d", "lolstats", "--no-owner", "--no-acl"],
        stdout=subprocess.PIPE,
    )
    load = subprocess.run(
        ["docker", "exec", "-i", "-e", "TARGET", CONTAINER, "sh", "-c", 'psql "$TARGET" -v ON_ERROR_STOP=1 -q'],
        stdin=dump.stdout,
        env={**os.environ, "TARGET": prod},
    )
    dump.wait()
    if dump.returncode or load.returncode:
        print("Copy failed (see the messages above).", file=sys.stderr)
        return 1

    a, b = counts(local), counts(prod)
    bad = [t for t in a if a[t] != b.get(t)]
    for t in a:
        print(f"  {t:28s} local {a[t]:>9,}  neon {b.get(t, 0):>9,}{'  MISMATCH' if t in bad else ''}")
    print("Row counts match." if not bad else f"{len(bad)} tables differ.")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
