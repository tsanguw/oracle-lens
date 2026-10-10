-- How a team logo's artwork sits on our dark panels, measured by the sync:
--   'dark'    mostly dark artwork (black logos): shown on a light plate so it can be seen
--   'light'   mostly light artwork: fine on the dark panel as it is
--   'neutral' anything else, including logos that come with their own backdrop
ALTER TABLE team ADD COLUMN logo_tone TEXT CHECK (logo_tone IN ('dark', 'light', 'neutral'));
