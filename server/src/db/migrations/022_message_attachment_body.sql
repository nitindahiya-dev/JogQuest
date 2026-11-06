BEGIN;

ALTER TABLE messages
  ADD COLUMN has_attachment BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_body_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_body_or_attachment_check
  CHECK (
    (
      has_attachment = TRUE
      AND length(trim(body)) BETWEEN 0 AND 2000
    )
    OR
    (
      has_attachment = FALSE
      AND length(trim(body)) BETWEEN 1 AND 2000
    )
  );

COMMIT;
