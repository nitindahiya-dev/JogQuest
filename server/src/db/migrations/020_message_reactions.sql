BEGIN;

CREATE TABLE message_reactions (
  message_id UUID NOT NULL
    REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL
    CHECK (emoji IN ('❤️', '😂', '👍', '😮', '😢', '🔥')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_message_reactions_message
  ON message_reactions(message_id);

COMMIT;
