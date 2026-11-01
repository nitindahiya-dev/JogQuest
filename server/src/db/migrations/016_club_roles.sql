BEGIN;

ALTER TABLE club_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(16)
  NOT NULL DEFAULT 'member';

ALTER TABLE club_members
  DROP CONSTRAINT IF EXISTS club_members_role_check;

ALTER TABLE club_members
  ADD CONSTRAINT club_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

-- The club creator is always the effective owner.
UPDATE club_members cm
SET role = 'owner'
FROM clubs c
WHERE cm.club_id = c.id
  AND cm.user_id = c.creator_id;

-- Repair any legacy clubs whose creator membership row is missing.
INSERT INTO club_members (club_id, user_id, role)
SELECT id, creator_id, 'owner'
FROM clubs
ON CONFLICT (club_id, user_id)
DO UPDATE SET role = 'owner';

CREATE INDEX IF NOT EXISTS idx_club_members_role
  ON club_members (club_id, role);

COMMIT;
