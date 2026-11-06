BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS conversation_id UUID
    REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id UUID
    REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_conversation_message
  ON notifications (user_id, conversation_id, message_id)
  WHERE type = 'NEW_MESSAGE';

COMMIT;
