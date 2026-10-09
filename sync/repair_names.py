"""Merge duplicate players and teams that differ only by spelling/case (idempotent).

Earlier loads could keep the scoreboard's spelling of a name ("aphromoo", "Dplus KIA") next to
Leaguepedia's canonical one ("Aphromoo", "Dplus Kia"), splitting one entity's stats in two. This
resolves every name in the database the same way a fresh sync now does and merges the duplicates.

  python repair_names.py            # dry run: print what would be merged
  python repair_names.py --apply    # perform the merges in one transaction
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from lolsync.client import Leaguepedia
from lolsync.resolve import ResolveCache, resolve_players, resolve_team_names

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# (table, column) pairs that point at team.id / player.id.
TEAM_REFS = [("team_game", "team_id"), ("player_game", "team_id"), ("pick_ban", "team_id"),
             ("series", "team1_id"), ("series", "team2_id"), ("series", "winner_id")]


conflicts: list[str] = []  # groups plan_players refused to merge; printed by main()


def plan_players(conn, lp) -> tuple[list[tuple[int, int, str]], list[tuple[int, str, str]]]:
    """Returns (merges, renames).

    merges:  (source id, target id, why) for each duplicate to fold into its target.
    renames: (player id, canonical page, why) for a surviving player stored under a non-canonical spelling.
    """
    rows = conn.execute(
        "SELECT p.id, p.name, (SELECT COUNT(*) FROM player_game x WHERE x.player_id = p.id) FROM player p"
    ).fetchall()
    names = {pid: name for pid, name, _ in rows}
    games_of = {pid: games for pid, _, games in rows}
    cache = ResolveCache()
    resolve_players(lp, list(names.values()), cache)

    # Group by the resolved identity. Spellings Leaguepedia knows resolve to its canonical page;
    # for the rest, spellings that differ only by case are treated as one player (Cargo does the same).
    groups: dict[str, list[int]] = defaultdict(list)
    confirmed: dict[int, str | None] = {}  # id -> Leaguepedia's spelling, when it has a page
    for pid, name in names.items():
        page, info = cache.player(name)
        confirmed[pid] = page if info else None
        groups[page.casefold()].append(pid)

    merges: list[tuple[int, int, str]] = []
    renames: list[tuple[int, str, str]] = []
    for members in groups.values():
        pages = {confirmed[m] for m in members if confirmed[m]}
        if len(pages) > 1:
            # Leaguepedia itself has several pages differing only by case: possibly different people.
            # Never merge those automatically.
            conflicts.append(", ".join(sorted(pages)))
            continue
        busiest = max(members, key=lambda m: games_of[m])
        canonical = min(pages) if pages else names[busiest]  # no page: keep the spelling most games use
        target = next((m for m in members if names[m] == canonical), busiest)
        for m in members:
            if m != target:
                merges.append((m, target, f"{names[m]!r} ({games_of[m]} games) -> {names[target]!r}"))
        if names[target] != canonical:
            renames.append((target, canonical, f"{names[target]!r} -> {canonical!r}"))
    return merges, renames


def plan_teams(conn, lp) -> list[tuple[int, int, str]]:
    rows = conn.execute("SELECT id, name FROM team").fetchall()
    cache = ResolveCache()
    resolve_team_names(lp, [n for _, n in rows], cache)
    by_name = {name: pid for pid, name in rows}
    merges = []
    for pid, name in rows:
        current = cache.current_team(name)
        if current != name and current in by_name:
            merges.append((pid, by_name[current], f"{name!r} -> {current!r}"))
    return merges


def merge_players(cur, src: int, dst: int) -> None:
    # A player cannot appear twice in one game; if both do, keep the target's row.
    cur.execute(
        """DELETE FROM player_game s USING player_game d
           WHERE s.player_id = %s AND d.player_id = %s AND d.game_id = s.game_id""",
        (src, dst),
    )
    cur.execute("UPDATE player_game SET player_id = %s WHERE player_id = %s", (dst, src))
    cur.execute("UPDATE player_alias SET player_id = %s WHERE player_id = %s", (dst, src))
    cur.execute("SELECT name, display_name, nationality FROM player WHERE id = %s", (src,))
    name, display, nationality = cur.fetchone()
    cur.execute("DELETE FROM player WHERE id = %s", (src,))
    cur.execute(
        "UPDATE player SET display_name = COALESCE(display_name, %s), nationality = COALESCE(nationality, %s) WHERE id = %s",
        (display, nationality, dst),
    )
    cur.execute(
        "INSERT INTO player_alias (old_name, player_id) VALUES (%s, %s) ON CONFLICT (old_name) DO NOTHING",
        (name, dst),
    )


def merge_teams(cur, src: int, dst: int) -> None:
    for table, col in TEAM_REFS:
        cur.execute(f"UPDATE {table} SET {col} = %s WHERE {col} = %s" if table != "team_game"
                    else "UPDATE team_game SET team_id = %s WHERE team_id = %s", (dst, src))
    cur.execute(
        "DELETE FROM tournament_team_league s USING tournament_team_league d "
        "WHERE s.team_id = %s AND d.team_id = %s AND d.tournament_id = s.tournament_id", (src, dst))
    cur.execute("UPDATE tournament_team_league SET team_id = %s WHERE team_id = %s", (dst, src))
    cur.execute("UPDATE team_alias SET team_id = %s WHERE team_id = %s", (dst, src))
    cur.execute("SELECT name FROM team WHERE id = %s", (src,))
    (name,) = cur.fetchone()
    cur.execute("DELETE FROM team WHERE id = %s", (src,))
    cur.execute("INSERT INTO team_alias (old_name, team_id) VALUES (%s, %s) ON CONFLICT (old_name) DO NOTHING", (name, dst))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="perform the merges (default is a dry run)")
    args = parser.parse_args()

    lp = Leaguepedia()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        player_merges, player_renames = plan_players(conn, lp)
        team_merges = plan_teams(conn, lp)
        print(f"players to merge: {len(player_merges)}")
        for _, _, why in player_merges[:40]:
            print(f"   {why}")
        if len(player_merges) > 40:
            print(f"   ... and {len(player_merges) - 40} more")
        print(f"players to rename to Leaguepedia's spelling: {len(player_renames)}")
        for _, _, why in player_renames[:15]:
            print(f"   {why}")
        if len(player_renames) > 15:
            print(f"   ... and {len(player_renames) - 15} more")
        print(f"left alone (Leaguepedia has several pages differing only by case): {len(conflicts)}")
        for group in conflicts:
            print(f"   {group}")
        print(f"teams to merge: {len(team_merges)}")
        for _, _, why in team_merges:
            print(f"   {why}")
        if not args.apply:
            print("\ndry run: nothing changed (use --apply)")
            return 0
        with conn.cursor() as cur:
            for src, dst, _ in player_merges:
                merge_players(cur, src, dst)
            for pid, page, _ in player_renames:
                cur.execute(
                    "UPDATE player SET name = %s WHERE id = %s AND NOT EXISTS (SELECT 1 FROM player WHERE name = %s)",
                    (page, pid, page),
                )
            for src, dst, _ in team_merges:
                merge_teams(cur, src, dst)
        conn.commit()
        print("\napplied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
