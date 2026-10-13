from lolsync.backfill import pick_orders

IDS = {"Azir": 1, "Vi": 2, "Jinx": 3, "Rakan": 4, "Gnar": 5}


def champion_id(name: str) -> int:
    return IDS[name]


def test_each_pick_gets_its_place_in_its_teams_draft():
    draft = {(10, "pick"): [("Gnar", 1), ("Vi", 2), ("Azir", 3)], (20, "pick"): [("Jinx", 1)]}
    assert pick_orders(draft, champion_id) == {(10, 5): 1, (10, 2): 2, (10, 1): 3, (20, 3): 1}


def test_bans_are_not_picks():
    draft = {(10, "ban"): [("Azir", 1)], (10, "pick"): [("Vi", 1)]}
    assert pick_orders(draft, champion_id) == {(10, 2): 1}


def test_a_pick_with_no_known_place_is_left_out_never_guessed():
    draft = {(10, "pick"): [("Gnar", None), ("Vi", 2)]}
    assert pick_orders(draft, champion_id) == {(10, 2): 2}


def test_a_champion_one_team_picked_twice_is_left_out_because_the_picks_cannot_be_told_apart():
    draft = {(10, "pick"): [("Azir", 1), ("Azir", 2), ("Vi", 3)]}
    assert pick_orders(draft, champion_id) == {(10, 2): 3}


def test_the_same_champion_on_two_teams_is_two_entries():
    draft = {(10, "pick"): [("Azir", 1)], (20, "pick"): [("Azir", 4)]}
    assert pick_orders(draft, champion_id) == {(10, 1): 1, (20, 1): 4}


def test_no_draft_gives_nothing():
    assert pick_orders({}, champion_id) == {}
