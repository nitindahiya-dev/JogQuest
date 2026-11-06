BEGIN;

CREATE TABLE user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  reason VARCHAR(40) NOT NULL CHECK (
    reason IN (
      'HARASSMENT',
      'SPAM',
      'INAPPROPRIATE_CONTENT',
      'THREATS',
      'IMPERSONATION',
      'OTHER'
    )
  ),
  details VARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')
  ),
  moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moderator_notes VARCHAR(2000),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_reports_not_self CHECK (reporter_id <> reported_user_id)
);

CREATE UNIQUE INDEX user_reports_unique_message_report
  ON user_reports (reporter_id, reported_user_id, message_id, reason)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX user_reports_unique_user_report
  ON user_reports (reporter_id, reported_user_id, reason)
  WHERE message_id IS NULL;

CREATE INDEX user_reports_reporter_created_idx
  ON user_reports (reporter_id, created_at DESC);

CREATE INDEX user_reports_status_created_idx
  ON user_reports (status, created_at DESC);

COMMIT;
