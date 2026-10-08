-- Initial schema. Stat columns are nullable: NULL means "not tracked", never 0.

CREATE TABLE league (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE,
  region TEXT
);

CREATE TABLE league_alias (
  id         SERIAL PRIMARY KEY,
  old_name   TEXT NOT NULL,
  league_id  INT NOT NULL REFERENCES league(id),
  year_start INT,
  year_end   INT,
  sub_region TEXT
);

CREATE TABLE tournament (
  id               SERIAL PRIMARY KEY,
  leaguepedia_name TEXT NOT NULL UNIQUE,
  league_id        INT REFERENCES league(id),  -- NULL for internationals
  year             INT NOT NULL,
  split            TEXT,
  stage            TEXT,
  is_international BOOLEAN NOT NULL DEFAULT FALSE,
  sub_region       TEXT,
  start_date       DATE,
  end_date         DATE
);
CREATE INDEX tournament_league_year_split ON tournament (league_id, year, split);

CREATE TABLE team (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE,
  region TEXT
);
CREATE TABLE team_alias (
  id       SERIAL PRIMARY KEY,
  old_name TEXT NOT NULL UNIQUE,
  team_id  INT NOT NULL REFERENCES team(id)
);

CREATE TABLE player (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  nationality TEXT
);
CREATE TABLE player_alias (
  id        SERIAL PRIMARY KEY,
  old_name  TEXT NOT NULL UNIQUE,
  player_id INT NOT NULL REFERENCES player(id)
);

CREATE TABLE champion (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE series (
  id            SERIAL PRIMARY KEY,
  tournament_id INT NOT NULL REFERENCES tournament(id),
  team1_id      INT REFERENCES team(id),
  team2_id      INT REFERENCES team(id),
  winner_id     INT REFERENCES team(id),
  score         TEXT
);

CREATE TABLE game (
  id               SERIAL PRIMARY KEY,
  leaguepedia_id   TEXT NOT NULL UNIQUE,  -- ScoreboardGames.GameId
  series_id        INT REFERENCES series(id),
  tournament_id    INT NOT NULL REFERENCES tournament(id),
  patch            TEXT,
  played_at        TIMESTAMPTZ,
  length_sec       INT
);
CREATE INDEX game_played_at ON game (played_at);

CREATE TABLE team_game (
  game_id  INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  team_id  INT NOT NULL REFERENCES team(id),
  side     TEXT NOT NULL CHECK (side IN ('blue', 'red')),
  win      BOOLEAN NOT NULL,
  kills    INT,
  gold     INT,
  dragons  INT,
  barons   INT,
  heralds  INT,  -- heralds/grubs depending on era
  towers   INT,
  PRIMARY KEY (game_id, team_id)
);

CREATE TABLE player_game (
  game_id     INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  player_id   INT NOT NULL REFERENCES player(id),
  team_id     INT NOT NULL REFERENCES team(id),
  champion_id INT NOT NULL REFERENCES champion(id),
  role        TEXT NOT NULL,
  side        TEXT NOT NULL CHECK (side IN ('blue', 'red')),
  win         BOOLEAN NOT NULL,
  kills       INT,
  deaths      INT,
  assists     INT,
  cs          INT,
  gold        INT,
  damage      INT,
  vision      INT,
  first_blood BOOLEAN,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX player_game_player ON player_game (player_id, game_id);
CREATE INDEX player_game_champion ON player_game (champion_id);

CREATE TABLE pick_ban (
  id          SERIAL PRIMARY KEY,
  game_id     INT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  team_id     INT NOT NULL REFERENCES team(id),
  champion_id INT NOT NULL REFERENCES champion(id),
  action      TEXT NOT NULL CHECK (action IN ('pick', 'ban')),
  draft_order INT
);
CREATE INDEX pick_ban_game ON pick_ban (game_id);

CREATE TABLE sync_state (
  tournament_name TEXT PRIMARY KEY,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
  last_synced_at  TIMESTAMPTZ,
  error           TEXT
);

-- Key/value for things like the last successful sync shown in the footer.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
