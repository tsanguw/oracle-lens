"""Alias resolution against Leaguepedia, with a cache shared across tournaments in one run."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .client import Leaguepedia
from .normalize import cargo_quote

LOOKUP_CHUNK = 80


def lookup(lp: Leaguepedia, table: str, fields: str, key: str, keys: Iterable[str]):
    """Yield rows whose `key` is in `keys`, querying in chunks."""
    keys = sorted(set(k for k in keys if k))
    for i in range(0, len(keys), LOOKUP_CHUNK):
        chunk = keys[i : i + LOOKUP_CHUNK]
        where = f"{key} IN ({','.join(cargo_quote(k) for k in chunk)})"
        yield from lp.cargo(table, fields, where=where)


@dataclass
class ResolveCache:
    """Everything looked up once per process so later tournaments reuse earlier answers."""

    team_checked: set[str] = field(default_factory=set)
    team_renamed: dict[str, str] = field(default_factory=dict)  # old name -> RenamedTo
    team_region: dict[str, str] = field(default_factory=dict)
    player_canonical: dict[str, str] = field(default_factory=dict)  # Link -> canonical page
    player_info: dict[str, dict] = field(default_factory=dict)  # canonical page -> {id, nationality}
    player_checked: set[str] = field(default_factory=set)
    conference_teams: dict[tuple[str, int], dict[str, str]] = field(default_factory=dict)

    def current_team(self, name: str) -> str:
        """Follow Teams.RenamedTo to the team's current name (cycle-safe)."""
        seen = {name}
        while name in self.team_renamed and self.team_renamed[name] not in seen:
            name = self.team_renamed[name]
            seen.add(name)
        return name


def resolve_team_names(lp: Leaguepedia, names: Iterable[str], cache: ResolveCache) -> None:
    """Populate the cache for any team names not seen before, following rename chains."""
    frontier = {n for n in names if n and n not in cache.team_checked}
    for _ in range(6):  # chains are short; cap defensively
        if not frontier:
            return
        nxt: set[str] = set()
        for row in lookup(lp, "Teams", "Name,Region,RenamedTo", "Name", frontier):
            cache.team_region[row["Name"]] = row["Region"]
            if row["RenamedTo"]:
                cache.team_renamed[row["Name"]] = row["RenamedTo"]
                nxt.add(row["RenamedTo"])
        cache.team_checked |= frontier
        frontier = {n for n in nxt if n not in cache.team_checked}


def resolve_players(lp: Leaguepedia, links: Iterable[str], cache: ResolveCache) -> None:
    """Map Link -> canonical page via PlayerRedirects, then load ID/nationality for new pages."""
    new_links = {l for l in links if l and l not in cache.player_canonical}
    for l in new_links:
        cache.player_canonical[l] = l
    for row in lookup(lp, "PlayerRedirects", "AllName,OverviewPage", "AllName", new_links):
        if row["OverviewPage"]:
            cache.player_canonical[row["AllName"]] = row["OverviewPage"]
    pages = {cache.player_canonical[l] for l in new_links} - cache.player_checked
    for row in lookup(lp, "Players", "OverviewPage,ID,Country,NationalityPrimary", "OverviewPage", pages):
        # NationalityPrimary is often blank; Country is the reliably filled field.
        cache.player_info[row["OverviewPage"]] = {
            "id": row["ID"],
            "nationality": row["NationalityPrimary"] or row["Country"] or None,
        }
    cache.player_checked |= pages


def conference_team_leagues(
    lp: Leaguepedia,
    cache: ResolveCache,
    conference_leagues: dict[str, str],
    year: int,
) -> dict[str, str]:
    """Team name -> league short name, from who played in each conference's own tournaments that year."""
    key = (",".join(sorted(conference_leagues)), year)
    if key in cache.conference_teams:
        return cache.conference_teams[key]
    mapping: dict[str, str] = {}
    for long_name, league in conference_leagues.items():
        pages = [
            r["OverviewPage"]
            for r in lp.cargo(
                "Tournaments",
                "OverviewPage",
                where=f"League={cargo_quote(long_name)} AND IsOfficial='1' AND Year={cargo_quote(str(year))}",
            )
        ]
        for team in {r["Team"] for r in lookup(lp, "ScoreboardTeams", "Team", "OverviewPage", pages)}:
            mapping[team] = league
    cache.conference_teams[key] = mapping
    return mapping
