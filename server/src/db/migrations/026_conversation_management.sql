BEGIN;

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_inbox
  ON conversation_participants (user_id, archived_at, hidden_at);

COMMIT;
