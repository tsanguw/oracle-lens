"""Pure helpers that turn raw Cargo values into our column types."""

from __future__ import annotations

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


def team_side(value: str) -> str:
    return {"blue": "blue", "red": "red"}[value.strip().lower()]


def player_side(value: Any) -> str:
    """ScoreboardPlayers.Side: 1 = blue, 2 = red."""
    return {"1": "blue", "2": "red"}[str(value).strip()]


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def cargo_quote(value: str) -> str:
    """Escape a string literal for a Cargo where clause."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


class LeagueResolver:
    """Maps Leaguepedia league long names to (current league, is_international, sub_region)."""

    def __init__(self, path: Path = ALIASES_PATH):
        cfg = yaml.safe_load(path.read_text(encoding="utf8"))
        self.leagues: dict[str, dict] = cfg["leagues"]
        self._by_long_name = {n: short for short, v in self.leagues.items() for n in v["names"]}
        self.predecessors: dict[str, str] = cfg["lcp_predecessors"]
        self.internationals: set[str] = set(cfg["internationals"])

    def resolve(self, long_name: str, year: int) -> tuple[str | None, bool, str | None]:
        if long_name in self.internationals:
            return None, True, None
        if long_name in self._by_long_name:
            return self._by_long_name[long_name], False, None
        if long_name in self.predecessors:
            sub_region = self.predecessors[long_name] if year < 2025 else None
            return "LCP", False, sub_region
        raise KeyError(f"League {long_name!r} is not in league_aliases.yaml")
