BEGIN;

-- Organizer/admin action history (Phase 7).
CREATE TABLE IF NOT EXISTS competition_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(60) NOT NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_id UUID,
  reason TEXT NOT NULL,
  before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_admin_audit_competition
  ON competition_admin_audit (competition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_admin_audit_actor
  ON competition_admin_audit (actor_user_id, created_at DESC);

-- Notification provider delivery attempts (Phase 7).
CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL
    REFERENCES notifications(id) ON DELETE CASCADE,
  provider VARCHAR(60) NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    status = 'FAILED'
    OR (status = 'SENT' AND error_message IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_failed
  ON notification_delivery_attempts (status, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_notification
  ON notification_delivery_attempts (notification_id, attempted_at DESC);

-- Organizer-managed reward fulfillment status (Phase 7).
CREATE TABLE IF NOT EXISTS competition_reward_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
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

COMMIT;
