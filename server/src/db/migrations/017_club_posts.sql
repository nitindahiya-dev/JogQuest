BEGIN;

ALTER TABLE posts
  ADD COLUMN club_id UUID
  REFERENCES clubs(id)
  ON DELETE CASCADE;

CREATE INDEX idx_posts_club_created
  ON posts (club_id, created_at DESC)
  WHERE club_id IS NOT NULL;

COMMIT;
