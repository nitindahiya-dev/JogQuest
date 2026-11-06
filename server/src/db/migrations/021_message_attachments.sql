BEGIN;

CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE
    REFERENCES messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(64) NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes INTEGER NOT NULL
    CHECK (file_size_bytes BETWEEN 1 AND 10485760),
  original_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_created
  ON message_attachments (created_at DESC);

COMMIT;
