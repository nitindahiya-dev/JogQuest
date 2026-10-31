
BEGIN;

-- Trusted platform administrator allowlist.
-- Rows must be provisioned directly by a trusted operator.
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
);

-- Review lifecycle.
ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS review_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_taken_over_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_taken_over_by UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_takeover_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_competitions_review_deadline
  ON competitions (review_deadline_at)
  WHERE status = 'UNDER_REVIEW';

CREATE INDEX IF NOT EXISTS idx_platform_admins_user
  ON platform_admins (user_id);

COMMIT;
