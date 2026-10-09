-- Looking up a series' games (results, recent tournaments) scanned the whole game table.
CREATE INDEX IF NOT EXISTS game_series_id ON game (series_id);
