import pytest

from lolsync.normalize import (
    LeagueResolver,
    cargo_quote,
    clean_row,
    length_sec,
    parse_utc,
    player_side,
    team_side,
    to_bool,
    to_int,
)


def test_clean_row_restores_underscores_and_drops_precision():
    row = {"DateTime UTC": "2026-09-13 08:19:00", "DateTime UTC__precision": "0", "Role Number": "2"}
    assert clean_row(row) == {"DateTime_UTC": "2026-09-13 08:19:00", "Role_Number": "2"}


def test_missing_values_are_none_not_zero():
    assert to_int("") is None
    assert to_int(None) is None
    assert to_int("0") == 0
    assert to_bool("") is None
    assert to_bool("Yes") is True and to_bool("No") is False


def test_length_is_minutes_to_seconds():
    assert length_sec("28.016666666667") == 1681
    assert length_sec("") is None


def test_sides():
    assert team_side("Blue") == "blue" and team_side("Red") == "red"
    assert player_side("1") == "blue" and player_side(2) == "red"


def test_parse_utc():
    assert parse_utc("2026-09-13 08:19:00").isoformat() == "2026-09-13T08:19:00+00:00"
    assert parse_utc("") is None


def test_cargo_quote_escapes():
    assert cargo_quote("Faker's \\ page") == "'Faker\\'s \\\\ page'"


def test_league_resolver():
    r = LeagueResolver()
    assert r.resolve("LoL Champions Korea", 2026) == ("LCK", False, None)
    assert r.resolve("World Championship", 2026) == (None, True, None)
    assert r.resolve("Pacific Championship Series", 2024) == ("LCP", False, "PCS")
    with pytest.raises(KeyError):
        r.resolve("Some Unknown League", 2020)
