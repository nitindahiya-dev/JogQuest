BEGIN;

-- Add lifecycle and registration fields without removing existing data.
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS status VARCHAR(24)
    NOT NULL DEFAULT 'REGISTRATION_OPEN',
  ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_participants INTEGER;

-- Preserve existing competitions and derive their initial lifecycle state.
UPDATE competitions
SET status = CASE
  WHEN end_at <= NOW() THEN 'UNDER_REVIEW'
  WHEN start_at <= NOW() AND end_at > NOW() THEN 'ACTIVE'
  ELSE 'REGISTRATION_OPEN'
END
WHERE status = 'REGISTRATION_OPEN';

-- Backfill registration windows for existing records.
UPDATE competitions
SET registration_opens_at =
      LEAST(created_at, start_at - INTERVAL '1 second')
WHERE registration_opens_at IS NULL;

UPDATE competitions
SET registration_closes_at = start_at
WHERE registration_closes_at IS NULL;

-- Add constraints safely if they do not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'competitions_status_check'
      AND conrelid = 'competitions'::regclass
  ) THEN
    ALTER TABLE competitions
      ADD CONSTRAINT competitions_status_check
      CHECK (status IN (
        'DRAFT',
        'REGISTRATION_OPEN',
        'ACTIVE',
        'UNDER_REVIEW',
        'COMPLETED',
        'CANCELLED'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'competitions_max_participants_check'
      AND conrelid = 'competitions'::regclass
  ) THEN
    ALTER TABLE competitions
      ADD CONSTRAINT competitions_max_participants_check
      CHECK (max_participants IS NULL OR max_participants > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_competitions_status_schedule
  ON competitions (status, start_at, end_at);

COMMIT;
