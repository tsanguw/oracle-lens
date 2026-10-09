import pytest

from lolsync import resolve
from lolsync.resolve import ResolveCache, resolve_players, resolve_team_names

# A stand-in for Leaguepedia's Cargo tables. Like the real thing, matching is case-insensitive:
# asking for "AN" returns the row stored as "An".
TABLES = {
    "Teams": [
        # Two different teams whose names differ only by case (a Brazilian org and a disbanded EU team).
        {"Name": "paiN Gaming", "Region": "Brazil", "RenamedTo": ""},
        {"Name": "Pain Gaming", "Region": "Europe", "RenamedTo": ""},
        {"Name": "Dplus Kia", "Region": "Korea", "RenamedTo": ""},
        {"Name": "SK Telecom T1", "Region": "Korea", "RenamedTo": "T1"},
        {"Name": "T1", "Region": "Korea", "RenamedTo": ""},
    ],
    "PlayerRedirects": [
        # Two different players whose page names differ only by case.
        {"AllName": "Kai (Lee Min)", "OverviewPage": "Kai (Lee Min)"},
        {"AllName": "KAI (Lee Min)", "OverviewPage": "KAI (Lee Min)"},
        {"AllName": "Aphromoo", "OverviewPage": "Aphromoo"},
        {"AllName": "An", "OverviewPage": "An"},
        {"AllName": "Faker Herself", "OverviewPage": "Vanni"},
    ],
    "Players": [
        {"OverviewPage": "Kai (Lee Min)", "ID": "Kai", "Country": "South Korea", "NationalityPrimary": ""},
        {"OverviewPage": "KAI (Lee Min)", "ID": "KAI", "Country": "Vietnam", "NationalityPrimary": ""},
        {"OverviewPage": "Aphromoo", "ID": "aphromoo", "Country": "United States", "NationalityPrimary": ""},
        {"OverviewPage": "An", "ID": "An", "Country": "Taiwan", "NationalityPrimary": ""},
        {"OverviewPage": "Vanni", "ID": "Vanni", "Country": "", "NationalityPrimary": "Korea"},
    ],
}


@pytest.fixture(autouse=True)
def fake_cargo(monkeypatch):
    def fake_lookup(lp, table, fields, key, keys):
        wanted = {k.casefold() for k in keys if k}
        return [r for r in TABLES[table] if r[key].casefold() in wanted]

    monkeypatch.setattr(resolve, "lookup", fake_lookup)


def test_team_spelled_with_different_case_resolves_to_the_canonical_team():
    cache = ResolveCache()
    resolve_team_names(None, ["Dplus KIA", "Dplus Kia"], cache)
    assert cache.current_team("Dplus KIA") == "Dplus Kia"
    assert cache.current_team("Dplus Kia") == "Dplus Kia"
    assert cache.team_region["Dplus Kia"] == "Korea"


def test_two_real_teams_that_differ_only_by_case_stay_separate():
    # Cargo returns both rows for either spelling; each exact spelling must keep its own identity.
    cache = ResolveCache()
    resolve_team_names(None, ["paiN Gaming", "Pain Gaming"], cache)
    assert cache.current_team("paiN Gaming") == "paiN Gaming"
    assert cache.current_team("Pain Gaming") == "Pain Gaming"
    assert cache.team_region["paiN Gaming"] == "Brazil"
    assert cache.team_region["Pain Gaming"] == "Europe"


def test_paiN_gaming_alone_is_not_pulled_onto_the_other_team():
    # Regression: asking only for "paiN Gaming" returns both rows, and the old matching chose the wrong one.
    cache = ResolveCache()
    resolve_team_names(None, ["paiN Gaming"], cache)
    assert cache.current_team("paiN Gaming") == "paiN Gaming"


def test_an_ambiguous_case_variant_is_left_alone_not_guessed():
    cache = ResolveCache()
    resolve_team_names(None, ["PAIN GAMING"], cache)  # matches two different teams, neither exactly
    assert cache.current_team("PAIN GAMING") == "PAIN GAMING"


def test_team_rename_chain_still_resolves():
    cache = ResolveCache()
    resolve_team_names(None, ["SK Telecom T1"], cache)
    assert cache.current_team("SK Telecom T1") == "T1"
    assert cache.team_region["T1"] == "Korea"  # the renamed-to team is looked up too


def test_unknown_team_is_left_alone():
    cache = ResolveCache()
    resolve_team_names(None, ["Some New Team"], cache)
    assert cache.current_team("Some New Team") == "Some New Team"


@pytest.mark.parametrize("link", ["aphromoo", "Aphromoo", "APHROMOO"])
def test_player_link_in_any_case_resolves_to_the_one_canonical_page(link):
    cache = ResolveCache()
    resolve_players(None, [link], cache)
    page, info = cache.player(link)
    assert page == "Aphromoo"  # Leaguepedia's own spelling, never the scoreboard's
    assert info["id"] == "aphromoo"
    assert info["nationality"] == "United States"


def test_two_spellings_of_the_same_player_share_one_identity():
    cache = ResolveCache()
    resolve_players(None, ["AN", "An"], cache)
    assert cache.player("AN")[0] == cache.player("An")[0] == "An"


def test_two_real_players_that_differ_only_by_case_stay_separate():
    cache = ResolveCache()
    resolve_players(None, ["Kai (Lee Min)", "KAI (Lee Min)"], cache)
    assert cache.player("Kai (Lee Min)")[0] == "Kai (Lee Min)"
    assert cache.player("KAI (Lee Min)")[0] == "KAI (Lee Min)"
    assert cache.player("Kai (Lee Min)")[1]["nationality"] == "South Korea"
    assert cache.player("KAI (Lee Min)")[1]["nationality"] == "Vietnam"


def test_an_ambiguous_player_spelling_is_left_alone_not_guessed():
    cache = ResolveCache()
    resolve_players(None, ["kai (lee min)"], cache)  # matches two different players, neither exactly
    page, info = cache.player("kai (lee min)")
    assert page == "kai (lee min)" and info == {}


def test_redirects_to_a_different_page_are_followed():
    cache = ResolveCache()
    resolve_players(None, ["Faker Herself"], cache)
    page, info = cache.player("Faker Herself")
    assert page == "Vanni" and info["nationality"] == "Korea"  # NationalityPrimary wins over Country


def test_underscores_in_a_link_mean_spaces_like_the_wiki():
    TABLES["PlayerRedirects"].append({"AllName": "Leo (Han Gyeo-re)", "OverviewPage": "Leo (Han Gyeo-re)"})
    TABLES["Players"].append({"OverviewPage": "Leo (Han Gyeo-re)", "ID": "Leo", "Country": "South Korea", "NationalityPrimary": ""})
    cache = ResolveCache()
    resolve_players(None, ["Leo_(Han_Gyeo-re)", "Leo (Han Gyeo-re)"], cache)
    assert cache.player("Leo_(Han_Gyeo-re)")[0] == cache.player("Leo (Han Gyeo-re)")[0] == "Leo (Han Gyeo-re)"
    assert cache.player("Leo_(Han_Gyeo-re)")[1]["nationality"] == "South Korea"


def test_player_without_a_page_keeps_their_link_and_has_no_info():
    cache = ResolveCache()
    resolve_players(None, ["Brand New Rookie"], cache)
    assert cache.player("Brand New Rookie") == ("Brand New Rookie", {})


def test_already_known_players_are_not_looked_up_again(monkeypatch):
    requested = []  # (table, keys) for every lookup that would hit the network
    original = resolve.lookup

    def spy(lp, table, fields, key, keys):
        keys = [k for k in keys if k]
        if keys:
            requested.append((table, sorted(keys)))
        return original(lp, table, fields, key, keys)

    monkeypatch.setattr(resolve, "lookup", spy)
    cache = ResolveCache()
    resolve_players(None, ["Aphromoo"], cache)
    requested.clear()

    resolve_players(None, ["Aphromoo"], cache)  # exact repeat: nothing to ask
    assert requested == []

    resolve_players(None, ["aphromoo"], cache)  # new spelling of a known player
    assert requested == [("PlayerRedirects", ["aphromoo"])]  # redirect only; the page info is reused
    assert cache.player("aphromoo")[0] == "Aphromoo"
