-- Phase 7: track actual notification delivery attempts and organizer-managed
-- reward status. Creating this file does not apply the migration.

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider VARCHAR(60) NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'FAILED') OR
    (status = 'SENT' AND error_message IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_failed
  ON notification_delivery_attempts (status, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_notification
  ON notification_delivery_attempts (notification_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS competition_reward_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'FULFILLED', 'CANCELLED')),
  notes TEXT,
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competition_id, participant_id, reward_name)
);

CREATE INDEX IF NOT EXISTS idx_competition_reward_status
  ON competition_reward_status (competition_id, status, updated_at DESC);
