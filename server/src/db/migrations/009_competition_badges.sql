BEGIN;

CREATE TABLE IF NOT EXISTS competition_badge_definitions (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO competition_badge_definitions
  (code, name, description, icon)
VALUES
  ('CHALLENGE_PARTICIPANT', 'Challenge Participant',
   'Officially participated in a completed challenge.', '🎯'),
  ('CHALLENGE_FINISHER', 'Challenge Finisher',
   'Recorded a qualifying score in a completed challenge.', '🏁'),
  ('CHALLENGE_GOLD', 'Gold Medal',
   'Finished a challenge in first place.', '🥇'),
  ('CHALLENGE_SILVER', 'Silver Medal',
   'Finished a challenge in second place.', '🥈'),
  ('CHALLENGE_BRONZE', 'Bronze Medal',
   'Finished a challenge in third place.', '🥉'),
  ('CHALLENGE_PERSONAL_BEST', 'Personal Best',
   'Achieved a new official personal best for a challenge metric.', '⭐')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon;

CREATE TABLE IF NOT EXISTS user_competition_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code VARCHAR(40) NOT NULL
    REFERENCES competition_badge_definitions(code),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_code, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_user_competition_badges_user
  ON user_competition_badges (user_id, awarded_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_competition_badges_competition
  ON user_competition_badges (competition_id);

COMMIT;