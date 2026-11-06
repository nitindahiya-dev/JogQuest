-- Add database-backed idempotency for message submissions.
-- Legacy messages retain NULL keys and remain unaffected.

BEGIN;

ALTER TABLE messages
  ADD COLUMN idempotency_key UUID;

CREATE UNIQUE INDEX idx_messages_idempotency
  ON messages (conversation_id, sender_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
