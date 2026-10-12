"""Final placements ("1st", "3rd-4th", ...) for every event we hold, from Leaguepedia's TournamentResults."""

from __future__ import annotations

import re
from typing import Any, Callable

import psycopg

from .client import Leaguepedia
from .normalize import cargo_quote

Log = Callable[[str], None]
CHUNK = 25  # event pages per Cargo request


def normalize_place(place: str | None) -> tuple[str, int | None] | None:
    """("3-4") -> ("3-4", 3); ("1") -> ("1", 1); ("NQ") -> ("NQ", None). Blank means no placement."""
    text = (place or "").strip()
    if not text:
        return None
    match = re.match(r"\d+", text)
    return text, int(match.group()) if match else None


def result_pages(pages: list[tuple[int, str | None]]) -> dict[str, int]:
    """Leaguepedia page -> our tournament id, for the pages TournamentResults may be filed under. Worlds and MSI keep
    their results on the parent page ("2024 Season World Championship"), not on ".../Main Event" or ".../Play-In", so
    the parent counts as the Main Event; it also lists the play-in teams, which only that row can hold."""
    out = {page: tid for tid, page in pages if page}
    for tid, page in pages:
        parent = page.removesuffix("/Main Event") if page and page.endswith("/Main Event") else None
        if parent:
            out.setdefault(parent, tid)
    return out


def team_lookup(conn: psycopg.Connection) -> dict[str, int]:
    """Team name (any case, current or former) -> team id."""
    lookup: dict[str, int] = {}
    for old_name, team_id in conn.execute("SELECT old_name, team_id FROM team_alias"):
        lookup[old_name.casefold()] = team_id
    for team_id, name in conn.execute("SELECT id, name FROM team"):
        lookup[name.casefold()] = team_id  # current names win over aliases
    return lookup


def parse_rows(rows: list[dict[str, Any]], tournaments: dict[str, int], teams: dict[str, int]) -> tuple[list[tuple], int]:
    """Rows ready to upsert, plus how many were skipped because the team is not one we hold."""
    out: dict[tuple[int, int], tuple] = {}
    unmatched = 0
    for r in rows:
        tournament_id = tournaments.get(r["OverviewPage"])
        place = normalize_place(r.get("Place"))
        if tournament_id is None or place is None:
            continue
        team_id = teams.get((r.get("Team") or "").casefold())
        if team_id is None:
            unmatched += 1
            continue
        out[(tournament_id, team_id)] = (tournament_id, team_id, place[0], place[1], (r.get("GroupName") or "").strip() or None)
    return list(out.values()), unmatched


def refresh_results(conn: psycopg.Connection, lp: Leaguepedia, log: Log = print, recent_days: int | None = None) -> dict[str, int]:
    """Fetch placements for our events. With `recent_days`, only events that ended recently or have none yet."""
    where = ""
    if recent_days is not None:
        where = f"""WHERE t.end_date >= CURRENT_DATE - {int(recent_days)}
                       OR NOT EXISTS (SELECT 1 FROM tournament_result r WHERE r.tournament_id = t.id)"""
    tournaments = result_pages(list(conn.execute(f"SELECT t.id, t.leaguepedia_name FROM tournament t {where}")))
    teams = team_lookup(conn)
    pages = sorted(tournaments)
    rows: list[dict[str, Any]] = []
    for i in range(0, len(pages), CHUNK):
        quoted = ",".join(cargo_quote(p) for p in pages[i : i + CHUNK])
        rows += list(lp.cargo("TournamentResults", "OverviewPage,Team,Place,GroupName", where=f"OverviewPage IN ({quoted})"))
    values, unmatched = parse_rows(rows, tournaments, teams)
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO tournament_result (tournament_id, team_id, place, place_number, group_name)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (tournament_id, team_id) DO UPDATE
               SET place = EXCLUDED.place, place_number = EXCLUDED.place_number, group_name = EXCLUDED.group_name""",
            values,
        )
    conn.commit()
    log(f"placements: {len(values)} stored for {len(pages)} events ({unmatched} rows skipped: team not in our data)")
    return {"stored": len(values), "events": len(pages), "unmatched_teams": unmatched}
