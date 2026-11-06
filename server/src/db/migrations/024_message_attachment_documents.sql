BEGIN;

ALTER TABLE message_attachments
  DROP CONSTRAINT IF EXISTS message_attachments_mime_type_check;

ALTER TABLE message_attachments
  ADD CONSTRAINT message_attachments_mime_type_check
  CHECK (
    mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
  );

COMMIT;
