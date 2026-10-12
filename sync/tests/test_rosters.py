from datetime import date

from lolsync import rosters as mod
from lolsync.rosters import Stint, build_stints

TODAY = date(2026, 10, 1)


def row(day, direction, team, role="Mid", status="", modifier="", tags=""):
    return {"Date_Sort": f"{day} 00:00:00", "Direction": direction, "Team": team, "RolesIngame": role, "RoleModifier": modifier, "Status": status, "Tags": tags}


def stints(*rows):
    return [(s.team, str(s.start), str(s.end) if s.end else None) for s in build_stints(list(rows), TODAY)]


def test_a_join_and_a_leave_make_one_stint():
    assert stints(row("2020-11-20", "Join", "Cloud9"), row("2021-11-12", "Leave", "Cloud9")) == [("Cloud9", "2020-11-20", "2021-11-12")]


def test_a_stint_with_no_leave_is_still_running():
    assert stints(row("2023-12-05", "Join", "Team Heretics")) == [("Team Heretics", "2023-12-05", None)]


def test_a_role_swap_on_one_day_does_not_split_the_stint():
    out = build_stints(
        [
            row("2015-10-15", "Join", "G2 Esports", "Mid"),
            row("2018-11-29", "Join", "G2 Esports", "Bot"),
            row("2018-11-29", "Leave", "G2 Esports", "Mid"),
            row("2020-11-17", "Leave", "G2 Esports", "Bot"),
        ],
        TODAY,
    )
    assert [(s.team, str(s.start), str(s.end), s.role) for s in out] == [("G2 Esports", "2015-10-15", "2020-11-17", "Bot")]


def test_a_contract_that_lapses_for_a_day_does_not_split_the_stint():
    assert stints(
        row("2014-12-02", "Join", "T1"),
        row("2018-11-19", "Leave", "T1"),
        row("2018-11-20", "Join", "T1"),
    ) == [("T1", "2014-12-02", None)]


def test_coming_back_to_a_team_after_a_long_gap_is_a_second_stint():
    assert stints(
        row("2015-01-01", "Join", "Gamers2"),
        row("2015-02-17", "Leave", "Gamers2"),
        row("2015-02-19", "Join", "Millenium"),
        row("2015-05-22", "Leave", "Millenium"),
        row("2015-06-02", "Join", "Gamers2"),
        row("2015-10-15", "Leave", "Gamers2"),
    ) == [
        ("Gamers2", "2015-01-01", "2015-02-17"),
        ("Millenium", "2015-02-19", "2015-05-22"),
        ("Gamers2", "2015-06-02", "2015-10-15"),
    ]


def test_a_join_elsewhere_closes_a_stint_that_never_got_a_leave():
    assert stints(row("2018-01-10", "Join", "Fnatic"), row("2019-12-01", "Join", "Origen")) == [
        ("Fnatic", "2018-01-10", "2019-12-01"),
        ("Origen", "2019-12-01", None),
    ]


def test_going_inactive_keeps_one_stint_and_flags_it_when_they_leave_inactive():
    out = build_stints(
        [
            row("2023-12-05", "Join", "Team Heretics"),
            row("2024-03-05", "Leave", "Team Heretics"),
            row("2024-03-05", "Join", "Team Heretics", status="inactive"),
            row("2024-05-07", "Leave", "Team Heretics", status="inactive"),
        ],
        TODAY,
    )
    assert [(str(s.start), str(s.end), s.inactive) for s in out] == [("2023-12-05", "2024-05-07", True)]


def test_becoming_active_again_clears_the_inactive_flag():
    out = build_stints(
        [
            row("2013-02-12", "Join", "T1"),
            row("2023-07-05", "Leave", "T1"),
            row("2023-07-05", "Join", "T1", status="inactive"),
            row("2023-08-01", "Leave", "T1", status="inactive"),
            row("2023-08-01", "Join", "T1"),
        ],
        TODAY,
    )
    assert [(str(s.start), s.end, s.inactive) for s in out] == [("2013-02-12", None, False)]


def test_staff_rows_make_no_stint():
    # A player who becomes a coach on the same team: the player stint ends, nothing is added for the coaching job.
    out = build_stints(
        [
            row("2025-01-05", "Join", "G2 Esports", "Top"),
            row("2026-07-10", "Leave", "G2 Esports", "Top"),
            row("2026-07-10", "Join", "G2 Esports", role=""),
        ],
        TODAY,
    )
    assert [(str(s.start), str(s.end)) for s in out] == [("2025-01-05", "2026-07-10")]


def test_rows_that_are_not_a_spell_with_a_team_are_ignored():
    assert (
        stints(
            row("2018-02-26", "Join", "Team NaCl", status="pickup"),
            row("2020-01-01", "Join", "Some Team", status="trial"),
            row("2020-02-01", "Join", "Another Team", status="temp_sub"),
            row("2020-03-01", "Join", "Home Team", status="loaned_out"),
            row("2020-04-01", "Join", "Hypothetical", status="set_to_join"),
        )
        == []
    )


def test_a_loan_runs_alongside_the_home_team():
    out = build_stints(
        [
            row("2019-01-01", "Join", "Home Team"),
            row("2020-01-01", "Join", "Loan Team", status="on_loan"),
            row("2020-06-01", "Leave", "Loan Team", status="on_loan"),
        ],
        TODAY,
    )
    assert [(s.team, str(s.end) if s.end else None, s.loan) for s in out] == [("Home Team", None, False), ("Loan Team", "2020-06-01", True)]


def test_a_sub_signing_does_not_end_the_main_team_stint():
    out = build_stints([row("2019-01-01", "Join", "Main Team"), row("2019-06-01", "Join", "Other Team", modifier="Sub")], TODAY)
    assert [(s.team, s.end, s.modifier) for s in out] == [("Main Team", None, None), ("Other Team", None, "Sub")]


def test_a_join_and_leave_on_the_same_day_is_a_one_day_stint():
    assert stints(row("2022-05-05", "Join", "Some Team"), row("2022-05-05", "Leave", "Some Team")) == [("Some Team", "2022-05-05", "2022-05-05")]


def test_a_leave_with_no_join_and_future_or_placeholder_rows_are_ignored():
    assert stints(row("2020-01-01", "Leave", "Ghost Team"), row("2027-01-01", "Join", "Future Team"), row("2020-02-01", "Join", "TBD")) == []


def test_stints_come_out_oldest_first():
    out = build_stints([row("2021-01-01", "Join", "B"), row("2021-06-01", "Leave", "B"), row("2019-01-01", "Join", "A"), row("2019-06-01", "Leave", "A")], TODAY)
    assert [s.team for s in out] == ["A", "B"]


def test_rows_that_arrive_twice_do_not_make_one_day_stints():
    # Cargo matches names case-insensitively, so a player queried under two spellings gets every row back twice.
    rows = [
        row("2015-06-02", "Join", "G2 Esports"),
        row("2018-11-29", "Join", "G2 Esports", "Bot"),
        row("2018-11-29", "Leave", "G2 Esports", "Mid"),
        row("2020-11-17", "Leave", "G2 Esports", "Bot"),
    ]
    once = [(s.team, str(s.start), str(s.end)) for s in build_stints(rows, TODAY)]
    twice = [(s.team, str(s.start), str(s.end)) for s in build_stints(rows + rows, TODAY)]
    assert once == twice == [("G2 Esports", "2015-06-02", "2020-11-17")]


def test_rows_with_the_same_roster_change_id_count_once():
    a = {**row("2020-01-01", "Join", "Cloud9"), "RosterChangeId": "x"}
    b = {**row("2020-01-01", "Join", "Cloud9", role="Bot"), "RosterChangeId": "x"}  # the same change read again
    assert len(build_stints([a, b], TODAY)) == 1


def test_a_team_renamed_on_the_same_page_stays_one_stint():
    # Faker 2013: "SK Telecom T1 2" is renamed "SK Telecom T1 K" (tagged TeamRename), then he moves to "SK Telecom T1".
    out = build_stints(
        [
            row("2013-02-12", "Join", "SK Telecom T1 2"),
            row("2013-11-12", "Join", "SK Telecom T1 K", tags="TeamRename"),
            row("2013-11-12", "Leave", "SK Telecom T1 2", tags="TeamRename"),
            row("2014-12-02", "Join", "SK Telecom T1"),
            row("2014-12-02", "Leave", "SK Telecom T1 K"),
        ],
        TODAY,
    )
    assert [(s.team, str(s.start), str(s.end) if s.end else None) for s in out] == [
        ("SK Telecom T1 K", "2013-02-12", "2014-12-02"),
        ("SK Telecom T1", "2014-12-02", None),
    ]


def test_the_same_team_name_with_a_tagged_rename_row_is_not_lost():
    # A rename Leave that no Join answers just ends the stint that day.
    out = build_stints([row("2013-02-12", "Join", "Old Name"), row("2013-06-01", "Leave", "Old Name", tags="TeamRename")], TODAY)
    assert [(s.team, str(s.end)) for s in out] == [("Old Name", "2013-06-01")]


def test_a_join_with_nothing_since_for_years_is_not_known_to_be_running():
    # Albis at Corsair in 2012: a Join, no Leave, and nothing else written about him since.
    out = build_stints([row("2012-05-04", "Join", "Corsair")], TODAY)
    assert [(s.team, s.end, s.end_unknown) for s in out] == [("Corsair", None, True)]


def test_a_long_stint_that_keeps_getting_rows_is_still_current():
    # Faker: the original Join is old, but extensions and role swaps keep arriving.
    out = build_stints([row("2014-12-02", "Join", "T1"), row("2025-07-27", "Join", "T1"), row("2025-07-27", "Leave", "T1")], TODAY)
    assert [(s.team, s.end, s.end_unknown) for s in out] == [("T1", None, False)]


def test_ended_stints_are_never_marked_unknown():
    out = build_stints([row("2012-05-04", "Join", "Corsair"), row("2013-01-01", "Leave", "Corsair")], TODAY)
    assert [(str(s.end), s.end_unknown) for s in out] == [("2013-01-01", False)]


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.conn.statements.append((" ".join(sql.split()), params))

    def executemany(self, sql, seq):
        self.conn.statements.append((" ".join(sql.split()), list(seq)))


class FakeConn:
    def __init__(self):
        self.statements = []
        self.commits = 0
        self.selects = {
            "SELECT name, id FROM player": [("Perkz", 1), ("Faker", 2), ("Kai (Lee Min)", 3), ("KAI (Lee Min)", 4)],
            "SELECT old_name, player_id FROM player_alias": [("Faker (Lee Sang-hyeok)", 2)],
            "SELECT old_name, team_id FROM team_alias": [("SK Telecom T1", 20)],
            "SELECT id, name FROM team": [(10, "G2 Esports"), (20, "T1")],
        }

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        return self.selects[" ".join(sql.split())]

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1


class FakeLeaguepedia:
    def __init__(self, rows, changed=("Perkz",)):
        self.rows, self.changed, self.calls = rows, changed, []

    def cargo(self, tables, fields, where=None, order_by=None, join_on=None):
        self.calls.append((tables, fields, where))
        if fields == "Player":
            yield from ({"Player": p} for p in self.changed)
        else:
            yield from self.rows


def roster_row(player, *args, **kwargs):
    return {"Player": player, **row(*args, **kwargs)}


def stub_team_resolution(monkeypatch):
    def fake(lp, names, cache):
        cache.team_region["G2 Esports"] = "EMEA"
        cache.team_renamed["SK Telecom T1"] = "T1"

    monkeypatch.setattr(mod, "resolve_team_names", fake)


def test_refresh_rebuilds_each_players_history_and_clears_players_with_none(monkeypatch):
    # An exact spelling is trusted even when another player differs only by case ("KAI (Lee Min)" is player 4, not 3).
    stub_team_resolution(monkeypatch)
    conn = FakeConn()
    lp = FakeLeaguepedia(
        [
            roster_row("Perkz", "2015-10-15", "Join", "G2 Esports"),
            roster_row("Perkz", "2020-11-17", "Leave", "G2 Esports"),
            roster_row("Faker (Lee Sang-hyeok)", "2025-02-12", "Join", "SK Telecom T1"),
            roster_row("KAI (Lee Min)", "2025-01-01", "Join", "G2 Esports"),
        ]
    )
    counts = mod.refresh_rosters(lambda: conn, lp, lambda m: None)
    deletes = [p for sql, p in conn.statements if sql.startswith("DELETE FROM player_team_stint")]
    inserts = [p for sql, p in conn.statements if sql.startswith("INSERT INTO player_team_stint")]
    assert deletes == [([1, 2, 3, 4],)]  # a full run rebuilds everyone, including players Leaguepedia has no rows for
    assert inserts == [
        [
            (1, "G2 Esports", 10, "EMEA", "Mid", None, date(2015, 10, 15), date(2020, 11, 17), False, False, False),
            (2, "T1", 20, None, "Mid", None, date(2025, 2, 12), None, False, False, False),  # an alias spelling, and a renamed team
            (4, "G2 Esports", 10, "EMEA", "Mid", None, date(2025, 1, 1), None, False, False, False),
        ]
    ]
    assert conn.commits == 1
    assert counts == {"players": 3, "stints": 3, "unmatched_players": 0}


def test_spellings_that_differ_only_by_case_are_asked_for_once():
    assert mod.one_per_name(["perkz", "Perkz", "Faker", "Kai (Lee Min)", "KAI (Lee Min)"]) == ["Faker", "KAI (Lee Min)", "Perkz"]


def test_a_name_that_could_be_two_players_is_not_guessed(monkeypatch):
    stub_team_resolution(monkeypatch)
    conn = FakeConn()
    lp = FakeLeaguepedia([roster_row("kai (lee min)", "2020-01-01", "Join", "G2 Esports")])
    counts = mod.refresh_rosters(lambda: conn, lp, lambda m: None)
    assert counts["unmatched_players"] == 1
    assert counts["stints"] == 0


def test_an_incremental_refresh_only_rebuilds_players_with_a_recent_change(monkeypatch):
    stub_team_resolution(monkeypatch)
    conn = FakeConn()
    lp = FakeLeaguepedia([roster_row("Perkz", "2015-10-15", "Join", "G2 Esports")], changed=("Perkz", "Someone We Do Not Hold"))
    mod.refresh_rosters(lambda: conn, lp, lambda m: None, since="2026-09-01")
    deletes = [p for sql, p in conn.statements if sql.startswith("DELETE FROM player_team_stint")]
    assert deletes == [([1],)]
    assert lp.calls[0][2] == "Date_Sort >= '2026-09-01'"
    assert "IN ('Perkz')" in lp.calls[1][2]
