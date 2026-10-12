"""Team history from Leaguepedia's RosterChanges: its join/leave rows, turned into one stint per run with a team.

RosterChanges is a log, not a list of spells. A role swap, a contract extension, a team rename or a switch to
inactive are all written as a Leave plus a Join for the same team on the same day, so a stint is only really over
when the player leaves and does not come straight back. See FIELDS.md for what each Status and Preload value means.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Callable

import psycopg

from .client import Leaguepedia
from .normalize import cargo_quote, is_placeholder
from .resolve import ResolveCache, resolve_team_names, title
from .results import team_lookup

Log = Callable[[str], None]
CHUNK = 25  # player pages per Cargo request
COMMIT_EVERY = 500  # players per transaction
FIELDS = "Date_Sort,Player,Direction,Team,RolesIngame,RoleModifier,Status,Tags,RosterChangeId"
ORDER_BY = "Player,Date_Sort,Direction,Team,RosterChangeId"  # a total order, so paging by offset neither skips nor repeats rows
GAP_DAYS = 45  # back with the same team this soon after leaving (an expired contract renewed late) counts as never leaving
STALE_DAYS = 3 * 365  # a running stint needs some roster row (an extension, a role swap) within this long to count as current

# Rows that are not a spell with a team: tryouts, open-to-offers notices, announced moves that have not happened (the move
# itself is its own row), amateur pickup squads, one-off stand-ins, and the home team's note that a player is out on loan.
SKIP_STATUSES = {"pickup", "opportunities", "trial", "draft_pick", "set_to_join", "set_to_leave", "temp_sub", "loaned_out"}


@dataclass
class Stint:
    team: str
    role: str | None
    modifier: str | None  # "Sub" or "Trainee"
    start: date
    end: date | None = None  # None: still running (unless end_unknown)
    inactive: bool = False  # inactive when the stint ended (or is now)
    loan: bool = False
    end_unknown: bool = False  # a Join with no Leave and no later roster row of any kind for years: not known to be running


def day_of(value: Any) -> date | None:
    """Cargo datetimes look like "2014-06-03 00:00:00"; only the day matters."""
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def build_stints(rows: list[dict[str, Any]], today: date | None = None) -> list[Stint]:
    """One player's RosterChanges rows (Team already resolved to the current team name) as stints, oldest first.

    Staff rows (no in-game role) and the SKIP_STATUSES rows are ignored, as is anything dated after `today`. A Leave
    closes the player's stint with that team; a Join straight back (same day, or within GAP_DAYS) reopens it, so role
    swaps and renewals do not split a stint. A full-time Join elsewhere closes any stint that never got a Leave row."""
    today = today or date.today()
    changes: list[tuple[date, bool, str, dict[str, Any]]] = []
    seen: set[Any] = set()
    for r in rows:
        team, day = (r.get("Team") or "").strip(), day_of(r.get("Date_Sort"))
        if not team or is_placeholder(team) or day is None or day > today:
            continue
        if not (r.get("RolesIngame") or "").strip() or (r.get("Status") or "") in SKIP_STATUSES:
            continue
        if r.get("Direction") not in ("Join", "Leave"):
            continue
        # The same row can arrive twice: Cargo matches names case-insensitively, so a player queried under two spellings
        # (their page and an alias) gets every row back from both. A repeated Leave would then open a one-day stint.
        key = r.get("RosterChangeId") or (day, r["Direction"], team, r.get("RolesIngame"), r.get("Status"), r.get("RoleModifier"))
        if key in seen:
            continue
        seen.add(key)
        changes.append((day, r["Direction"] == "Join", team, r))
    changes.sort(key=lambda c: (c[0], c[1]))  # Leaves before Joins on the same day

    stints: list[Stint] = []
    running: dict[str, Stint] = {}
    last_closed: dict[str, Stint] = {}
    unmatched_leaves: set[tuple[str, date]] = set()
    renamed: dict[date, Stint] = {}  # a team renamed on this day: the stint carries on under the new name
    for day, joining, team, r in changes:
        status = r.get("Status") or ""
        role = (r.get("RolesIngame") or "").split(";")[0].strip() or None
        modifier = (r.get("RoleModifier") or "").strip() or None
        rename = "TeamRename" in (r.get("Tags") or "").split(",")
        if not joining:
            stint = running.pop(team, None)
            if stint is None:
                unmatched_leaves.add((team, day))  # no Join before it; a Join the same day makes a one-day stint
                continue
            if rename:
                renamed[day] = stint
                continue
            stint.end = day
            stint.inactive = stint.inactive or status == "inactive"
            last_closed[team] = stint
            continue
        if rename and day in renamed:
            stint = renamed.pop(day)
            stint.team, stint.role, stint.modifier = team, role or stint.role, modifier or stint.modifier
            running[team] = stint
            continue
        loan = status == "on_loan"
        back = last_closed.get(team)
        if back is not None and back.end is not None and (day - back.end).days <= GAP_DAYS and back.loan == loan:
            back.end, back.role, back.modifier, back.inactive = None, role or back.role, modifier, status == "inactive"
            running[team] = back
            del last_closed[team]
            continue
        if (team, day) in unmatched_leaves:
            stints.append(Stint(team, role, modifier, day, day, status == "inactive", loan))
            continue
        if team in running:
            continue  # a repeated Join
        if not loan and modifier != "Sub":
            for other, stint in list(running.items()):
                if not stint.loan and stint.modifier != "Sub":
                    stint.end, last_closed[other] = day, stint
                    del running[other]
        stint = Stint(team, role, modifier, day, inactive=status == "inactive", loan=loan)
        stints.append(stint)
        running[team] = stint
    for day, stint in renamed.items():
        stint.end = day  # a rename Leave with no matching Join: the stint just ended
    if changes and (today - changes[-1][0]).days > STALE_DAYS:
        for stint in stints:
            stint.end_unknown = stint.end is None  # nothing has been written about this player for years: not known to be running
    return sorted((s for s in stints if s.end is None or s.end >= s.start), key=lambda s: (s.start, s.team))


def player_lookup(conn: psycopg.Connection) -> tuple[dict[str, int], dict[str, int | None]]:
    """Leaguepedia page spelling (our player names and their aliases) -> player id, plus the casefolded version.
    Cargo matches names case-insensitively and two real players can differ only by case, so a casefolded name that
    belongs to more than one player maps to None and is never guessed."""
    exact: dict[str, int] = {}
    for name, player_id in conn.execute("SELECT name, id FROM player"):
        exact[name] = player_id
    for old_name, player_id in conn.execute("SELECT old_name, player_id FROM player_alias"):
        exact.setdefault(old_name, player_id)
    fold: dict[str, int | None] = {}
    for name, player_id in exact.items():
        key = name.casefold()
        fold[key] = None if key in fold and fold[key] != player_id else player_id
    return exact, fold


def match_player(name: str, exact: dict[str, int], fold: dict[str, int | None]) -> int | None:
    page = title(name)
    return exact[page] if page in exact else fold.get(page.casefold())


def one_per_name(names: list[str]) -> list[str]:
    """Cargo matches names case-insensitively and returns every case variant, so asking for both "Kai (Lee Min)" and
    "KAI (Lee Min)" (or an alias that only differs by case) would read the same rows twice."""
    kept: dict[str, str] = {}
    for name in sorted(names):
        kept.setdefault(name.casefold(), name)
    return sorted(kept.values())


def fetch_rosters(lp: Leaguepedia, names: list[str], exact: dict[str, int], fold: dict[str, int | None], log: Log) -> tuple[dict[int, list[dict[str, Any]]], int]:
    """RosterChanges rows grouped by our player id, plus how many rows could not be tied to one player."""
    by_player: dict[int, list[dict[str, Any]]] = {}
    unmatched = 0
    for i in range(0, len(names), CHUNK):
        quoted = ",".join(cargo_quote(n) for n in names[i : i + CHUNK])
        for r in lp.cargo("RosterChanges", FIELDS, where=f"Player IN ({quoted})", order_by=ORDER_BY):
            player_id = match_player(r["Player"], exact, fold)
            if player_id is None:
                unmatched += 1
            else:
                by_player.setdefault(player_id, []).append(r)
        if (i // CHUNK) % 40 == 39:
            log(f"  roster changes: {i + CHUNK} of {len(names)} players read")
    return by_player, unmatched


def apply_stints(conn: psycopg.Connection, by_player: dict[int, list[Stint]], teams: dict[str, int], regions: dict[str, str], clear: set[int]) -> int:
    """Replace every listed player's stints (a player's whole history is rebuilt, so Leaguepedia corrections carry over)."""
    ids = sorted(set(by_player) | clear)
    stored = 0
    for i in range(0, len(ids), COMMIT_EVERY):
        chunk = ids[i : i + COMMIT_EVERY]
        values = [
            (pid, s.team, teams.get(s.team.casefold()), regions.get(s.team) or None, s.role, s.modifier, s.start, s.end, s.end_unknown, s.inactive, s.loan)
            for pid in chunk
            for s in by_player.get(pid, [])
        ]
        with conn.cursor() as cur:
            cur.execute("DELETE FROM player_team_stint WHERE player_id = ANY(%s)", (chunk,))
            cur.executemany(
                """INSERT INTO player_team_stint (player_id, team_name, team_id, region, role, role_modifier, start_date, end_date, end_unknown, inactive, loan)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                values,
            )
        conn.commit()
        stored += len(values)
    return stored


def refresh_rosters(connect: Callable[[], psycopg.Connection], lp: Leaguepedia, log: Log = print, since: str | None = None) -> dict[str, int]:
    """Rebuild team history for every player we hold. With `since` ("YYYY-MM-DD"), only players who have a roster
    change from that date on, each rebuilt from their whole history. The fetch is slow, so no connection is held open for it."""
    with connect() as conn:
        exact, fold = player_lookup(conn)
        teams = team_lookup(conn)
    names = one_per_name(list(exact))
    if since:
        changed = {r["Player"] for r in lp.cargo("RosterChanges", "Player", where=f"Date_Sort >= {cargo_quote(since)}")}
        names = one_per_name([n for n in changed if match_player(n, exact, fold) is not None])
        log(f"{len(names)} players with a roster change since {since}")
    rows, unmatched = fetch_rosters(lp, names, exact, fold, log)
    cache = ResolveCache()
    resolve_team_names(lp, {r["Team"] for rs in rows.values() for r in rs if r.get("Team")}, cache)
    by_player = {
        pid: build_stints([{**r, "Team": cache.current_team(r["Team"])} for r in rs if r.get("Team")])
        for pid, rs in rows.items()
    }
    clear = set() if since else {pid for pid in exact.values()}
    with connect() as conn:
        stored = apply_stints(conn, by_player, teams, cache.team_region, clear)
    log(f"team history: {stored} stints for {len(by_player)} players ({unmatched} rows skipped: player name not unique)")
    return {"players": len(by_player), "stints": stored, "unmatched_players": unmatched}
