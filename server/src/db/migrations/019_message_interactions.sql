BEGIN;

ALTER TABLE messages
  ADD COLUMN reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_messages_reply_to_message
  ON messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

COMMIT;
