-- When a series is (or was) scheduled to start, from Leaguepedia's MatchSchedule. NULL when unknown.
ALTER TABLE series ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
CREATE INDEX IF NOT EXISTS series_scheduled_at ON series (scheduled_at);
