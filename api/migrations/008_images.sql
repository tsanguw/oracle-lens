-- Image manifests. Files are cached locally by the sync (python main.py images); NULL means no image is known.
-- logo_file / photo_file are file names inside the images folder; the sha1 is Leaguepedia's, so unchanged files are skipped.
ALTER TABLE team ADD COLUMN IF NOT EXISTS logo_file text;
ALTER TABLE team ADD COLUMN IF NOT EXISTS logo_sha1 text;
ALTER TABLE player ADD COLUMN IF NOT EXISTS photo_file text;
ALTER TABLE player ADD COLUMN IF NOT EXISTS photo_sha1 text;
-- Riot Data Dragon's key for the champion's icon, e.g. 'MonkeyKing' for Wukong.
ALTER TABLE champion ADD COLUMN IF NOT EXISTS icon_key text;
