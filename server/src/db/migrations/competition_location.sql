-- Optional coordinates for location-based competition discovery.
-- Safe for existing rows: both columns are nullable.
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Coordinates must be supplied together and remain within valid bounds.
ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_coordinates_valid;

ALTER TABLE competitions
  ADD CONSTRAINT competitions_coordinates_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (
      latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    )
  );
