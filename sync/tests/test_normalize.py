import pytest

from lolsync.normalize import (
    LeagueResolution,
    LeagueResolver,
    cargo_quote,
    clean_row,
    display_name,
    length_sec,
    parse_utc,
    player_side,
    split_list,
    team_side,
    to_bool,
    to_int,
)
from lolsync.resolve import ResolveCache


def test_a_competitions_main_event_is_just_the_competition():
    page = "2025 Season World Championship/Main Event"
    assert display_name("Worlds 2025 Main Event", page) == "Worlds 2025"
    assert display_name("MSI 2017 Main Event", "2017 Mid-Season Invitational/Main Event") == "MSI 2017"


def test_other_names_are_left_alone():
    # the play-in keeps its name, and so does anything whose page is not a main event
    assert display_name("Worlds 2025 Play-In", "2025 Season World Championship/Play-In") == "Worlds 2025 Play-In"
    assert display_name("LCK 2026 Season Playoffs", "LCK/2026 Season/Season Playoffs") == "LCK 2026 Season Playoffs"
    assert display_name("Worlds 2016", "2016 Season World Championship") == "Worlds 2016"
    # a name that merely ends in the words, on a page that is not a main event, is not touched
    assert display_name("Rift Rivals Main Event", "Rift Rivals 2019") == "Rift Rivals Main Event"


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


def test_sides_map_known_values_and_reject_unknown():
    assert team_side("Blue") == "blue" and team_side("Red") == "red"
    assert player_side("1") == "blue" and player_side(2) == "red"
    # Unknown or blank values are rejected (the row is skipped), never guessed.
    assert team_side("") is None and player_side("") is None and player_side("3") is None


def test_parse_utc():
    assert parse_utc("2026-09-13 08:19:00").isoformat() == "2026-09-13T08:19:00+00:00"
    assert parse_utc("") is None


def test_split_list():
    assert split_list("Camille,Jayce, Yone ,") == ["Camille", "Jayce", "Yone"]
    assert split_list("") == [] and split_list(None) == []


def test_placeholder_names_are_recognised():
    from lolsync.normalize import is_placeholder, real_names

    assert all(is_placeholder(n) for n in ["", "None", "none", " NONE ", "Missing Data", "TBD", "tba", None])
    assert not any(is_placeholder(n) for n in ["Azir", "MISSING", "Nonesuch", "Tbd Gaming"])  # MISSING is a real player
    assert real_names(["Sion", "None", "Zoe", "Missing Data", ""]) == ["Sion", "Zoe"]


def test_cargo_quote_escapes():
    assert cargo_quote("Faker's \\ page") == "'Faker\\'s \\\\ page'"


class TestLeagueResolver:
    r = LeagueResolver()

    def test_current_league_names(self):
        assert self.r.resolve("LoL Champions Korea", 2026) == LeagueResolution("LCK", False, None)
        assert self.r.resolve("LoL EMEA Championship", 2023) == LeagueResolution("LEC", False, None)

    def test_renamed_leagues_roll_up_under_current_name(self):
        # EU LCS -> LEC, NA LCS -> LCS
        assert self.r.resolve("Europe League Championship Series", 2016).league == "LEC"
        assert self.r.resolve("North America League Championship Series", 2016).league == "LCS"

    def test_ogn_champions_roll_up_into_lck(self):
        # LCK's predecessor, so LCK shows its full history from 2012.
        for year in (2012, 2013, 2014, 2015):
            assert self.r.resolve("LoL The Champions", year, "Korea") == LeagueResolution("LCK", False, None)

    def test_2025_lta_conferences_map_to_lcs_and_cblol(self):
        assert self.r.resolve("League of Legends Championship of The Americas North", 2025).league == "LCS"
        assert self.r.resolve("League of Legends Championship of The Americas South", 2025).league == "CBLOL"

    def test_lta_combined_event_is_multi_league(self):
        res = self.r.resolve("League of Legends Championship of The Americas", 2025)
        assert res == LeagueResolution(None, False, None, multi_league=True)
        assert self.r.conference_leagues("League of Legends Championship of The Americas") == {
            "League of Legends Championship of The Americas North": "LCS",
            "League of Legends Championship of The Americas South": "CBLOL",
        }

    def test_lcp_predecessors_keep_sub_region_before_2025(self):
        assert self.r.resolve("Pacific Championship Series", 2024) == LeagueResolution("LCP", False, "PCS")
        assert self.r.resolve("Vietnam Championship Series", 2023).sub_region == "VCS"
        assert self.r.resolve("LoL Japan League", 2024).sub_region == "LJL"
        assert self.r.resolve("League of Legends Championship Pacific", 2025) == LeagueResolution("LCP", False, None)

    def test_pcs_vcs_ljl_from_2025_are_second_tier_and_out_of_scope(self):
        # They kept running as tier-2 leagues after LCP launched; they must not count as LCP history.
        for name in ("Pacific Championship Series", "Vietnam Championship Series", "LoL Japan League"):
            with pytest.raises(KeyError):
                self.r.resolve(name, 2025)
            with pytest.raises(KeyError):
                self.r.resolve(name, 2026)

    def test_internationals_are_identified_by_region(self):
        assert self.r.resolve("World Championship", 2026, "International") == LeagueResolution(None, True, None)
        assert self.r.resolve("Mid-Season Invitational", 2025, "International").is_international

    def test_worlds_regional_finals_belong_to_the_domestic_league(self):
        # Tagged League="World Championship" but Region = the domestic region.
        assert self.r.resolve("World Championship", 2026, "China") == LeagueResolution("LPL", False, None)
        assert self.r.resolve("World Championship", 2019, "Korea").league == "LCK"
        assert self.r.resolve("World Championship", 2018, "Europe").league == "LEC"
        assert self.r.resolve("World Championship", 2018, "North America").league == "LCS"

    def test_out_of_scope_regional_finals_and_unknown_leagues_raise(self):
        with pytest.raises(KeyError):
            self.r.resolve("World Championship", 2018, "LMS")
        with pytest.raises(KeyError):
            self.r.resolve("Some Unknown League", 2020, "Mars")

    def test_scope_lists_every_domestic_name(self):
        names = self.r.domestic_long_names
        assert "Europe League Championship Series" in names
        assert "League of Legends Championship of The Americas" in names
        assert "World Championship" not in names  # handled by region, not by name


class TestResolveCache:
    def test_current_team_follows_rename_chains(self):
        c = ResolveCache()
        c.team_renamed = {"SK Telecom T1": "SKT", "SKT": "T1"}
        assert c.current_team("SK Telecom T1") == "T1"
        assert c.current_team("T1") == "T1"
        assert c.current_team("Unknown") == "Unknown"

    def test_current_team_survives_a_rename_cycle(self):
        c = ResolveCache()
        c.team_renamed = {"A": "B", "B": "A"}
        assert c.current_team("A") in {"A", "B"}  # terminates instead of looping forever
