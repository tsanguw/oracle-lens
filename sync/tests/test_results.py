from lolsync.results import normalize_place, parse_rows, result_pages


def test_main_event_also_answers_to_its_parent_page():
    pages = [(1, "2024 Season World Championship/Main Event"), (2, "2024 Season World Championship/Play-In"), (3, "LCK/2026 Season/Playoffs"), (4, None)]
    assert result_pages(pages) == {
        "2024 Season World Championship/Main Event": 1,
        "2024 Season World Championship/Play-In": 2,
        "2024 Season World Championship": 1,
        "LCK/2026 Season/Playoffs": 3,
    }
    # a parent page that is its own tournament is never taken over
    assert result_pages([(1, "X/Main Event"), (5, "X")])["X"] == 5


def test_places_keep_their_text_and_first_number():
    assert normalize_place("1") == ("1", 1)
    assert normalize_place(" 3-4 ") == ("3-4", 3)
    assert normalize_place("9-16") == ("9-16", 9)
    assert normalize_place("NQ") == ("NQ", None)
    assert normalize_place("") is None
    assert normalize_place(None) is None


def test_rows_map_to_our_ids_and_unknown_teams_are_counted_not_stored():
    rows = [
        {"OverviewPage": "LCK/2026 Season/Playoffs", "Team": "T1", "Place": "2", "GroupName": ""},
        {"OverviewPage": "LCK/2026 Season/Playoffs", "Team": "Gen.G", "Place": "1", "GroupName": ""},
        {"OverviewPage": "LCK/2026 Season/Rounds 3-4", "Team": "gen.g", "Place": "1", "GroupName": "Legend Group"},
        {"OverviewPage": "LCK/2026 Season/Playoffs", "Team": "Unknown FC", "Place": "3", "GroupName": ""},
        {"OverviewPage": "LCK/2026 Season/Playoffs", "Team": "T1", "Place": "", "GroupName": ""},  # no placement yet
        {"OverviewPage": "Not Ours", "Team": "T1", "Place": "1", "GroupName": ""},
    ]
    tournaments = {"LCK/2026 Season/Playoffs": 10, "LCK/2026 Season/Rounds 3-4": 11}
    teams = {"t1": 1, "gen.g": 2, "t1 esports (old name)": 1}
    values, unmatched = parse_rows(rows, tournaments, teams)
    assert sorted(values) == [(10, 1, "2", 2, None), (10, 2, "1", 1, None), (11, 2, "1", 1, "Legend Group")]
    assert unmatched == 1
