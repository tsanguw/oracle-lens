"""Read-only health report on the loaded data. Run after a backfill: python verify.py"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

COVERAGE = """
SELECT t.year,
       COALESCE(l.name, CASE WHEN t.is_international THEN 'INTL' ELSE '(multi-league)' END) AS league,
       COUNT(DISTINCT g.id) AS games
FROM game g
JOIN tournament t ON t.id = g.tournament_id
LEFT JOIN league l ON l.id = t.league_id
GROUP BY 1, 2
ORDER BY 1, 2
"""

# Each check returns the number of offending games; 0 means the data is consistent.
CHECKS = {
    "games without exactly 2 team rows": """
        SELECT COUNT(*) FROM game g WHERE (SELECT COUNT(*) FROM team_game x WHERE x.game_id = g.id) <> 2""",
    "games without exactly 10 player rows": """
        SELECT COUNT(*) FROM game g WHERE (SELECT COUNT(*) FROM player_game x WHERE x.game_id = g.id) <> 10""",
    "games without exactly one winning team": """
        SELECT COUNT(*) FROM (SELECT game_id FROM team_game GROUP BY game_id HAVING SUM(win::int) <> 1) s""",
    "games with no draft rows at all": """
        SELECT COUNT(*) FROM game g WHERE NOT EXISTS (SELECT 1 FROM pick_ban x WHERE x.game_id = g.id)""",
    "player rows whose team is not in the game": """
        SELECT COUNT(*) FROM player_game p
        WHERE NOT EXISTS (SELECT 1 FROM team_game t WHERE t.game_id = p.game_id AND t.team_id = p.team_id)""",
    "tournaments with no games": """
        SELECT COUNT(*) FROM tournament t WHERE NOT EXISTS (SELECT 1 FROM game g WHERE g.tournament_id = t.id)""",
    "games with NULL played_at": "SELECT COUNT(*) FROM game WHERE played_at IS NULL",
    "players with an unusual role": """
        SELECT COUNT(*) FROM player_game WHERE role NOT IN ('Top','Jungle','Mid','Bot','Support')""",
}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    bad = 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        print("== sync_state ==")
        for status, n in conn.execute("SELECT status, COUNT(*) FROM sync_state GROUP BY 1 ORDER BY 1"):
            print(f"  {status:12s} {n}")
        for page, err in conn.execute("SELECT tournament_name, error FROM sync_state WHERE status = 'failed'"):
            print(f"  FAILED {page}: {err}")

        print("\n== totals ==")
        for label, sql in [
            ("tournaments", "SELECT COUNT(*) FROM tournament"), ("series", "SELECT COUNT(*) FROM series"),
            ("games", "SELECT COUNT(*) FROM game"), ("player rows", "SELECT COUNT(*) FROM player_game"),
            ("pick/ban rows", "SELECT COUNT(*) FROM pick_ban"), ("players", "SELECT COUNT(*) FROM player"),
            ("teams", "SELECT COUNT(*) FROM team"), ("champions", "SELECT COUNT(*) FROM champion"),
            ("player aliases", "SELECT COUNT(*) FROM player_alias"), ("team aliases", "SELECT COUNT(*) FROM team_alias"),
            ("multi-league team rows", "SELECT COUNT(*) FROM tournament_team_league"),
        ]:
            print(f"  {label:24s} {conn.execute(sql).fetchone()[0]:>9,}")

        print("\n== consistency checks (0 = clean) ==")
        for label, sql in CHECKS.items():
            n = conn.execute(sql).fetchone()[0]
            bad += n > 0
            print(f"  {'OK ' if n == 0 else '!! '} {label:46s} {n:,}")

        print("\n== games per year and league ==")
        by_year: dict[int, list[str]] = {}
        for year, league, games in conn.execute(COVERAGE):
            by_year.setdefault(year, []).append(f"{league}:{games}")
        for year, cells in by_year.items():
            print(f"  {year}  " + "  ".join(cells))

        print("\n== stats missing by era (share of player rows with NULL) ==")
        for year, vision, dmg, gold, cs in conn.execute(
            """SELECT t.year,
                      ROUND(100.0 * AVG((p.vision IS NULL)::int)),
                      ROUND(100.0 * AVG((p.damage IS NULL)::int)),
                      ROUND(100.0 * AVG((p.gold IS NULL)::int)),
                      ROUND(100.0 * AVG((p.cs IS NULL)::int))
               FROM player_game p JOIN game g ON g.id = p.game_id JOIN tournament t ON t.id = g.tournament_id
               GROUP BY 1 ORDER BY 1"""
        ):
            print(f"  {year}  vision {vision:>3}%  damage {dmg:>3}%  gold {gold:>3}%  cs {cs:>3}%")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
