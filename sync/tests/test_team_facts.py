from lolsync.backfill import fits_team_row

# Team 1 played blue and won; team 2 played red and lost.
FACTS = {1: ("blue", True), 2: ("red", False)}


def test_a_row_matching_its_team_fits():
    assert fits_team_row(FACTS, 1, "blue", True)
    assert fits_team_row(FACTS, 2, "red", False)


def test_a_team_that_did_not_play_the_game_does_not_fit():
    assert not fits_team_row(FACTS, 3, "blue", True)


def test_a_side_or_result_that_disagrees_with_the_team_row_does_not_fit():
    assert not fits_team_row(FACTS, 1, "red", True)
    assert not fits_team_row(FACTS, 1, "blue", False)
    assert not fits_team_row(FACTS, 2, "blue", False)
