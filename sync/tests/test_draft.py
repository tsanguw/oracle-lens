from lolsync.backfill import build_draft

IDS = {"Blue Team": 1, "Red Team": 2}
team_id = IDS.__getitem__

BLUE = {"Team": "Blue Team", "Bans": "Azir,Ahri,Zed,Lux,Vi", "Picks": "Jax,Lee Sin,Syndra,Jinx,Thresh"}
RED = {"Team": "Red Team", "Bans": "Ryze,Orianna", "Picks": "Gnar,Elise,Viktor,Ezreal,Nami"}


def pb_row(**fields):
    row = {"Team1": "Blue Team", "Team2": "Red Team"}
    for t in (1, 2):
        for kind in ("Ban", "Pick"):
            for n in range(1, 6):
                row[f"Team{t}{kind}{n}"] = ""
    row.update(fields)
    return row


def complete_pb():
    """A PicksAndBansS7 row as complete as the scoreboard rows above, but in true draft order."""
    return pb_row(
        Team1Ban1="Azir", Team1Ban2="Ahri", Team1Ban3="Zed", Team1Ban4="Lux", Team1Ban5="Vi",
        Team1Pick1="Syndra", Team1Pick2="Jax", Team1Pick3="Thresh", Team1Pick4="Jinx", Team1Pick5="Lee Sin",
        Team2Ban1="Ryze", Team2Ban2="Orianna",
        Team2Pick1="Gnar", Team2Pick2="Elise", Team2Pick3="Viktor", Team2Pick4="Ezreal", Team2Pick5="Nami",
    )


def test_picks_and_bans_row_is_used_with_draft_order_when_it_is_complete():
    draft, used_fallback = build_draft(complete_pb(), [BLUE, RED], team_id)
    assert not used_fallback
    # Draft order from PicksAndBansS7 (Syndra first), not the scoreboard's by-role listing (Jax first).
    assert draft[(1, "pick")] == [("Syndra", 1), ("Jax", 2), ("Thresh", 3), ("Jinx", 4), ("Lee Sin", 5)]
    assert draft[(1, "ban")][0] == ("Azir", 1)
    assert draft[(2, "pick")][0] == ("Gnar", 1)


def test_an_empty_picks_and_bans_row_falls_back_to_scoreboard_teams():
    # This is the real-world case that left 74 games without a draft: the row exists but is empty.
    draft, used_fallback = build_draft(pb_row(), [BLUE, RED], team_id)
    assert used_fallback
    assert draft[(1, "ban")] == [("Azir", 1), ("Ahri", 2), ("Zed", 3), ("Lux", 4), ("Vi", 5)]
    assert draft[(2, "ban")] == [("Ryze", 1), ("Orianna", 2)]
    assert [c for c, _ in draft[(1, "pick")]] == ["Jax", "Lee Sin", "Syndra", "Jinx", "Thresh"]


def test_fallback_picks_have_unknown_order_never_a_guess():
    draft, _ = build_draft(None, [BLUE, RED], team_id)
    assert all(slot is None for _, slot in draft[(1, "pick")] + draft[(2, "pick")])
    assert all(slot is not None for _, slot in draft[(1, "ban")])  # bans keep their slot order


def test_fallback_fills_only_what_the_primary_source_is_missing():
    # PicksAndBansS7 has complete picks (with order) but no bans: keep its picks, take bans from the scoreboard.
    pb = pb_row(
        Team1Pick1="Syndra", Team1Pick2="Jax", Team1Pick3="Thresh", Team1Pick4="Jinx", Team1Pick5="Lee Sin",
        Team2Pick1="Gnar", Team2Pick2="Elise", Team2Pick3="Viktor", Team2Pick4="Ezreal", Team2Pick5="Nami",
    )
    draft, used_fallback = build_draft(pb, [BLUE, RED], team_id)
    assert used_fallback
    assert draft[(1, "pick")][0] == ("Syndra", 1)  # PicksAndBansS7's draft order, not the scoreboard's role order
    assert draft[(1, "ban")][0] == ("Azir", 1)


def test_a_partial_primary_row_is_completed_from_the_scoreboard():
    # Real case (LPL 2018 Spring): PicksAndBansS7 held only 2 of 5 bans; ScoreboardTeams had all 5.
    scoreboard = {"Team": "Blue Team", "Bans": "Alistar,Tahm Kench,Karma,Thresh,Zac", "Picks": ""}
    pb = pb_row(Team1Ban4="Thresh", Team1Ban5="Zac")
    draft, used_fallback = build_draft(pb, [scoreboard, {"Team": "Red Team", "Bans": "", "Picks": ""}], team_id)
    assert used_fallback
    assert draft[(1, "ban")] == [("Alistar", 1), ("Tahm Kench", 2), ("Karma", 3), ("Thresh", 4), ("Zac", 5)]


def test_partial_picks_keep_the_slots_the_primary_source_knew():
    pb = pb_row(Team1Pick1="Jax", Team1Pick2="Syndra")
    draft, _ = build_draft(pb, [BLUE, RED], team_id)
    # Scoreboard lists 5 picks by role; Jax and Syndra keep their known draft slots, the rest are unknown.
    assert draft[(1, "pick")] == [("Jax", 1), ("Lee Sin", None), ("Syndra", 2), ("Jinx", None), ("Thresh", None)]


def test_placeholder_values_are_never_stored_as_champions():
    # The scoreboard writes the text "None" (or "Missing Data") for an unused ban slot.
    row = {"Team": "Blue Team", "Bans": "Sion,Zoe,Xayah,Taliyah,None", "Picks": "Jax,Missing Data"}
    draft, _ = build_draft(None, [row, {"Team": "Red Team", "Bans": "", "Picks": ""}], team_id)
    assert [c for c, _ in draft[(1, "ban")]] == ["Sion", "Zoe", "Xayah", "Taliyah"]
    assert [c for c, _ in draft[(1, "pick")]] == ["Jax"]
    everything = {c for entries in draft.values() for c, _ in entries}
    assert not {"None", "Missing Data"} & everything


def test_placeholders_in_the_primary_row_are_dropped_too():
    pb = pb_row(Team1Ban1="Azir", Team1Ban2="None", Team1Ban3="Missing Data", Team1Pick1="Jax")
    draft, _ = build_draft(pb, [{"Team": "Blue Team", "Bans": "", "Picks": ""}, {"Team": "Red Team", "Bans": "", "Picks": ""}], team_id)
    assert draft[(1, "ban")] == [("Azir", 1)]


def test_a_primary_row_with_no_team_names_is_ignored():
    pb = pb_row(Team1="", Team2="TBD", Team1Ban1="Azir", Team1Pick1="Jax")
    draft, used_fallback = build_draft(pb, [BLUE, RED], team_id)
    assert used_fallback
    assert [c for c, _ in draft[(1, "ban")]] == ["Azir", "Ahri", "Zed", "Lux", "Vi"]  # from the scoreboard


def test_complete_primary_source_does_not_report_fallback():
    _, used_fallback = build_draft(complete_pb(), [BLUE, RED], team_id)
    assert not used_fallback


def test_no_draft_anywhere_gives_an_empty_draft():
    empty = {"Team": "Blue Team", "Bans": "", "Picks": ""}
    draft, used_fallback = build_draft(None, [empty, {**empty, "Team": "Red Team"}], team_id)
    assert draft == {} and not used_fallback
