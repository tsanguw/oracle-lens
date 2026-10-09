from lolsync.backfill import Loader


class FakeCursor:
    """Just enough of a psycopg cursor to exercise Loader's player lookup."""

    def __init__(self):
        self.players: dict[str, int] = {}
        self.inserts: list[str] = []
        self._result = None

    def execute(self, sql, params=()):
        sql = " ".join(sql.split())
        if sql.startswith("SELECT id FROM player WHERE lower(name)"):
            wanted = params[0].lower()
            match = next(((pid, n) for n, pid in sorted(self.players.items(), key=lambda kv: kv[1]) if n.lower() == wanted), None)
            self._result = (match[0],) if match else None
        elif sql.startswith("INSERT INTO player"):
            name = params[0]
            self.inserts.append(name)
            self.players.setdefault(name, len(self.players) + 1)
            self._result = (self.players[name],)
        else:
            raise AssertionError(f"unexpected SQL: {sql}")

    def fetchone(self):
        return self._result


def test_a_player_seen_under_another_capitalisation_reuses_the_stored_player():
    cur = FakeCursor()
    load = Loader(cur)
    first = load.player("minde", "minde", None)
    second = load.player("Minde", "Minde", None)
    assert first == second
    assert cur.inserts == ["minde"]  # no second player was created


def test_different_players_are_not_merged():
    cur = FakeCursor()
    load = Loader(cur)
    assert load.player("Faker", "Faker", None) != load.player("Fakir", "Fakir", None)


def test_the_same_spelling_is_looked_up_once_per_run():
    cur = FakeCursor()
    load = Loader(cur)
    load.player("GeekGoneMad", None, None)
    before = len(cur.inserts)
    load.player("GeekGoneMad", None, None)
    assert len(cur.inserts) == before  # served from the in-run cache
