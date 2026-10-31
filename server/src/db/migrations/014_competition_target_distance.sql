ALTER TABLE competitions
ADD COLUMN IF NOT EXISTS target_distance_km NUMERIC(8, 2);

ALTER TABLE competitions
ADD CONSTRAINT competitions_target_distance_positive
CHECK (
  target_distance_km IS NULL
  OR target_distance_km > 0
);