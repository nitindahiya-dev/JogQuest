BEGIN;

CREATE TABLE message_attachment_cleanup (
  storage_path TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ
);

CREATE INDEX idx_message_attachment_cleanup_created
  ON message_attachment_cleanup (created_at ASC);

COMMIT;
