"""Pure helpers that turn raw Cargo values into our column types."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

ALIASES_PATH = Path(__file__).resolve().parent.parent / "league_aliases.yaml"


def clean_row(row: dict[str, Any]) -> dict[str, Any]:
    """Cargo returns underscores as spaces and adds *__precision keys; undo both."""
    return {k.replace(" ", "_"): v for k, v in row.items() if not k.endswith("__precision")}


def to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def to_bool(value: Any) -> bool | None:
    if value in (None, ""):
        return None
    return str(value).strip().lower() in ("1", "yes", "true")


def length_sec(minutes: Any) -> int | None:
    """Gamelength_Number is minutes as a float."""
    if minutes in (None, ""):
        return None
    return round(float(minutes) * 60)


def team_side(value: str) -> str | None:
    return {"blue": "blue", "red": "red"}.get(str(value).strip().lower())


def player_side(value: Any) -> str | None:
    """ScoreboardPlayers.Side: 1 = blue, 2 = red."""
    return {"1": "blue", "2": "red"}.get(str(value).strip())


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def split_list(value: str | None) -> list[str]:
    """Cargo list fields arrive comma-joined."""
    return [v.strip() for v in (value or "").split(",") if v.strip()]


# Leaguepedia writes these where a value is absent (an unused ban slot is the text "None"). They are
# never real champions, teams or players and must not be stored as if they were.
PLACEHOLDER_NAMES = frozenset({"", "none", "null", "missing data", "tbd", "tba"})


def is_placeholder(name: str | None) -> bool:
    return (name or "").strip().casefold() in PLACEHOLDER_NAMES


def real_names(names: list[str]) -> list[str]:
    return [n for n in names if not is_placeholder(n)]


def cargo_quote(value: str) -> str:
    """Escape a string literal for a Cargo where clause."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


@dataclass(frozen=True)
class LeagueResolution:
    """Where a tournament's games belong."""

    league: str | None  # current league short name; None for internationals and multi-league events
    is_international: bool
    sub_region: str | None
    multi_league: bool = False  # each team's games land in its own conference league


class LeagueResolver:
    """Maps Leaguepedia tournaments to the current league identity (see league_aliases.yaml)."""

    def __init__(self, path: Path = ALIASES_PATH):
        cfg = yaml.safe_load(path.read_text(encoding="utf8"))
        self.leagues: dict[str, dict] = cfg["leagues"]
        self._by_long_name = {n: short for short, v in self.leagues.items() for n in v["names"]}
        self.predecessors: dict[str, str] = cfg["lcp_predecessors"]["leagues"]
        self.lcp_first_year: int = cfg["lcp_predecessors"]["first_lcp_year"]
        self.multi_league: dict[str, dict] = cfg["multi_league"]
        self.regional_finals_name: str = cfg["regional_finals"]["league_name"]
        self.regional_finals: dict[str, str] = cfg["regional_finals"]["region_to_league"]
        self.international_region: str = cfg["international_region"]

    @property
    def domestic_long_names(self) -> list[str]:
        return [*self._by_long_name, *self.predecessors, *self.multi_league]

    def conference_leagues(self, long_name: str) -> dict[str, str]:
        """For a multi-league event: conference long league name -> league short name."""
        return self.multi_league[long_name]["conference_leagues"]

    def resolve(self, long_name: str, year: int, region: str | None = None) -> LeagueResolution:
        if region == self.international_region:
            return LeagueResolution(None, True, None)
        if long_name == self.regional_finals_name:
            if region in self.regional_finals:
                return LeagueResolution(self.regional_finals[region], False, None)
            raise KeyError(f"Regional finals for region {region!r} are out of scope")
        if long_name in self.multi_league:
            return LeagueResolution(None, False, None, multi_league=True)
        if long_name in self._by_long_name:
            return LeagueResolution(self._by_long_name[long_name], False, None)
        if long_name in self.predecessors:
            # From 2025 PCS, VCS and LJL continue only as second-tier leagues, so only their
            # earlier tournaments (the tier-1 era) belong to LCP's history.
            if year >= self.lcp_first_year:
                raise KeyError(f"{long_name!r} in {year} is a second-tier league, out of scope")
            return LeagueResolution("LCP", False, self.predecessors[long_name])
        raise KeyError(f"League {long_name!r} is not in league_aliases.yaml")
