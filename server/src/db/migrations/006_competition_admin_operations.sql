BEGIN;

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

COMMIT;
