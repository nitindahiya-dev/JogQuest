BEGIN;

CREATE TABLE IF NOT EXISTS competition_participation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(16) NOT NULL
    CHECK (event_type IN ('JOINED', 'WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_participation_events_competition
  ON competition_participation_events (competition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_participation_events_user
  ON competition_participation_events (user_id, created_at DESC);

COMMIT;
