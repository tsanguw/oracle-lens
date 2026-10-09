"""Alias resolution against Leaguepedia, with a cache shared across tournaments in one run.

Cargo compares names case-insensitively (a lookup for "AN" returns the row for "An", and GROUP BY
merges variants), and Leaguepedia holds one canonical page per player or team. So the requested
spelling and the row that comes back can differ only by case; every match here is by casefold, and
the canonical spelling always comes from Leaguepedia's own row.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .client import Leaguepedia
from .normalize import cargo_quote

LOOKUP_CHUNK = 80


def title(name: str) -> str:
    """MediaWiki treats underscores in page titles as spaces ("Leo_(Han_Gyeo-re)" is "Leo (Han Gyeo-re)")."""
    return name.replace("_", " ").strip()


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
    team_renamed: dict[str, str] = field(default_factory=dict)  # old/variant name -> current name
    team_region: dict[str, str] = field(default_factory=dict)
    player_canonical: dict[str, str] = field(default_factory=dict)  # Link -> canonical page
    player_info: dict[str, dict] = field(default_factory=dict)  # exact page -> {page, id, nationality}
    player_fold: dict[str, list[str]] = field(default_factory=dict)  # casefolded page -> exact pages
    player_checked: set[str] = field(default_factory=set)
    conference_teams: dict[tuple[str, int], dict[str, str]] = field(default_factory=dict)

    def current_team(self, name: str) -> str:
        """Follow renames (and case variants) to the team's current name (cycle-safe)."""
        seen = {name}
        while name in self.team_renamed and self.team_renamed[name] not in seen:
            name = self.team_renamed[name]
            seen.add(name)
        return name

    def player(self, link: str) -> tuple[str, dict]:
        """(canonical page, info) for a scoreboard Link; the page uses Leaguepedia's own spelling."""
        page = self.player_canonical.get(link, title(link))
        info = self.player_info.get(page)
        if info is None:
            # No page with exactly this spelling: use the one page that differs only by case, if unique.
            candidates = self.player_fold.get(page.casefold(), [])
            if len(candidates) == 1:
                info = self.player_info[candidates[0]]
        return (info["page"] if info else page), (info or {})


def resolve_team_names(lp: Leaguepedia, names: Iterable[str], cache: ResolveCache) -> None:
    """Populate the cache for any team names not seen before, following rename chains."""
    frontier = {n for n in names if n and n not in cache.team_checked}
    for _ in range(6):  # chains are short; cap defensively
        if not frontier:
            return
        nxt: set[str] = set()
        rows = list(lookup(lp, "Teams", "Name,Region,RenamedTo", "Name", frontier))
        for row in rows:
            cache.team_region[row["Name"]] = row["Region"]
            if row["RenamedTo"]:
                cache.team_renamed[row["Name"]] = row["RenamedTo"]
                nxt.add(row["RenamedTo"])
        exact = {row["Name"] for row in rows}
        for requested in frontier:
            if requested in exact:
                continue  # Leaguepedia has this exact spelling, so it is its own team
            # Otherwise a spelling that differs only by case is the same team ("Dplus KIA" is "Dplus
            # Kia"), but only when there is exactly one candidate. Distinct teams can differ only by
            # case ("paiN Gaming" in Brazil, "Pain Gaming" in Europe); never guess between those.
            variants = {row["Name"] for row in rows if row["Name"].casefold() == requested.casefold()}
            if len(variants) == 1:
                cache.team_renamed.setdefault(requested, next(iter(variants)))
        cache.team_checked |= frontier
        frontier = {n for n in nxt if n not in cache.team_checked}


def resolve_players(lp: Leaguepedia, links: Iterable[str], cache: ResolveCache) -> None:
    """Map each scoreboard Link to its canonical page and load ID/nationality for new pages."""
    new_links = {l for l in links if l and l not in cache.player_canonical}
    rows = [
        r
        for r in lookup(lp, "PlayerRedirects", "AllName,OverviewPage", "AllName", {title(l) for l in new_links})
        if r["OverviewPage"]
    ]
    exact = {r["AllName"]: r["OverviewPage"] for r in rows}
    for link in new_links:
        wanted = title(link)
        if wanted in exact:
            cache.player_canonical[link] = exact[wanted]  # Leaguepedia has this exact spelling
            continue
        # Otherwise a spelling that differs only by case, but only if every such redirect agrees.
        pages = {r["OverviewPage"] for r in rows if r["AllName"].casefold() == wanted.casefold()}
        cache.player_canonical[link] = next(iter(pages)) if len(pages) == 1 else wanted
    pages = {cache.player_canonical[l] for l in new_links}
    to_fetch = {p for p in pages if p not in cache.player_info and p not in cache.player_checked}
    for row in lookup(lp, "Players", "OverviewPage,ID,Country,NationalityPrimary", "OverviewPage", to_fetch):
        # NationalityPrimary is often blank; Country is the reliably filled field.
        page = row["OverviewPage"]
        cache.player_info[page] = {
            "page": page,
            "id": row["ID"],
            "nationality": row["NationalityPrimary"] or row["Country"] or None,
        }
        cache.player_fold.setdefault(page.casefold(), [])
        if page not in cache.player_fold[page.casefold()]:
            cache.player_fold[page.casefold()].append(page)
    cache.player_checked |= to_fetch


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
