CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(10) NOT NULL CHECK (activity_type IN ('Run', 'Walk', 'Cycle')),
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  pace VARCHAR(20) NOT NULL DEFAULT '0:00 /km',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_points (
  id BIGSERIAL PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_points_location
ON activity_points USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_activity_points_activity
ON activity_points (activity_id);

CREATE TABLE IF NOT EXISTS territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  activity_type VARCHAR(10) NOT NULL CHECK (activity_type IN ('Run', 'Walk', 'Cycle')),
  area_m2 DOUBLE PRECISION NOT NULL,
  area_km2 DOUBLE PRECISION NOT NULL,
  polygon GEOGRAPHY(POLYGON, 4326) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territories_polygon
ON territories USING GIST (polygon);

CREATE INDEX IF NOT EXISTS idx_territories_user
ON territories (user_id);

CREATE TABLE IF NOT EXISTS territory_history (
  id BIGSERIAL PRIMARY KEY,
  territory_id UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  previous_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  new_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS territory_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  territory_id UUID NOT NULL
    REFERENCES territories(id)
    ON DELETE CASCADE,

  activity_id UUID NOT NULL
    REFERENCES activities(id)
    ON DELETE CASCADE,

  challenger_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  overlap_area_m2 DOUBLE PRECISION NOT NULL,

  overlap_ratio DOUBLE PRECISION NOT NULL,

  status VARCHAR(20) NOT NULL
    DEFAULT 'PENDING'
    CHECK (
      status IN (
        'PENDING',
        'ACCEPTED',
        'REJECTED'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  resolved_at TIMESTAMPTZ,

  UNIQUE (territory_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_territory_challenges_territory
ON territory_challenges (territory_id);

CREATE INDEX IF NOT EXISTS idx_territory_challenges_challenger
ON territory_challenges (challenger_id);

CREATE INDEX IF NOT EXISTS idx_territory_challenges_status
ON territory_challenges (status);

-- ==================================================
-- NOTIFICATIONS
-- ==================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL,

  title VARCHAR(160) NOT NULL,

  message TEXT NOT NULL,

  territory_id UUID
    REFERENCES territories(id)
    ON DELETE SET NULL,

  challenge_id UUID
    REFERENCES territory_challenges(id)
    ON DELETE SET NULL,

  activity_id UUID
    REFERENCES activities(id)
    ON DELETE SET NULL,

  competition_id UUID
    REFERENCES competitions(id)
    ON DELETE SET NULL,

  dedupe_key TEXT UNIQUE NOT NULL,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications (user_id, read_at)
WHERE read_at IS NULL;


-- ==================================================
-- NEW CHALLENGE NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_challenge_created()
RETURNS TRIGGER AS $$
DECLARE
  owner_id UUID;
  challenger_name TEXT;
BEGIN
  SELECT
    t.user_id
  INTO owner_id
  FROM territories t
  WHERE t.id = NEW.territory_id;

  IF owner_id IS NULL OR owner_id = NEW.challenger_id THEN
    RETURN NEW;
  END IF;

  SELECT
    u.display_name
  INTO challenger_name
  FROM users u
  WHERE u.id = NEW.challenger_id;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    territory_id,
    challenge_id,
    activity_id,
    dedupe_key
  )
  VALUES (
    owner_id,
    'CHALLENGE_CREATED',
    'Territory Challenged',
    COALESCE(challenger_name, 'A runner')
      || ' challenged your territory.',
    NEW.territory_id,
    NEW.id,
    NEW.activity_id,
    'challenge-created:' || NEW.id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_notify_challenge_created
ON territory_challenges;

CREATE TRIGGER trg_notify_challenge_created
AFTER INSERT ON territory_challenges
FOR EACH ROW
EXECUTE FUNCTION jq_notify_challenge_created();


-- ==================================================
-- CHALLENGE ACCEPTED / REJECTED NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_challenge_status()
RETURNS TRIGGER AS $$
DECLARE
  territory_name TEXT;
BEGIN
  IF
    NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('ACCEPTED', 'REJECTED')
  THEN

    SELECT
      'Territory ' || LEFT(t.id::text, 8)
    INTO territory_name
    FROM territories t
    WHERE t.id = NEW.territory_id;

    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      territory_id,
      challenge_id,
      activity_id,
      dedupe_key
    )
    VALUES (
      NEW.challenger_id,

      CASE
        WHEN NEW.status = 'ACCEPTED'
          THEN 'CHALLENGE_ACCEPTED'
        ELSE 'CHALLENGE_REJECTED'
      END,

      CASE
        WHEN NEW.status = 'ACCEPTED'
          THEN 'Challenge Accepted'
        ELSE 'Challenge Rejected'
      END,

      CASE
        WHEN NEW.status = 'ACCEPTED'
          THEN COALESCE(territory_name, 'Your territory challenge')
               || ' was accepted.'
        ELSE COALESCE(territory_name, 'Your territory challenge')
               || ' was rejected.'
      END,

      NEW.territory_id,
      NEW.id,
      NEW.activity_id,

      'challenge-status:'
        || NEW.id::text
        || ':'
        || NEW.status
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_notify_challenge_status
ON territory_challenges;

CREATE TRIGGER trg_notify_challenge_status
AFTER UPDATE OF status ON territory_challenges
FOR EACH ROW
EXECUTE FUNCTION jq_notify_challenge_status();


-- ==================================================
-- TERRITORY TRANSFER NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_territory_transfer()
RETURNS TRIGGER AS $$
BEGIN

  IF
    NEW.action = 'TRANSFERRED'
    AND NEW.previous_owner_id IS NOT NULL
    AND NEW.new_owner_id IS NOT NULL
    AND NEW.previous_owner_id <> NEW.new_owner_id
  THEN

    -- New owner
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      territory_id,
      dedupe_key
    )
    VALUES (
      NEW.new_owner_id,
      'TERRITORY_TRANSFERRED',
      'Territory Acquired',
      'You are now the owner of this territory.',
      NEW.territory_id,
      'territory-transfer:new-owner:' || NEW.id::text
    )
    ON CONFLICT (dedupe_key) DO NOTHING;


    -- Previous owner
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      territory_id,
      dedupe_key
    )
    VALUES (
      NEW.previous_owner_id,
      'TERRITORY_LOST',
      'Territory Transferred',
      'Your territory was transferred to another player.',
      NEW.territory_id,
      'territory-transfer:previous-owner:' || NEW.id::text
    )
    ON CONFLICT (dedupe_key) DO NOTHING;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_notify_territory_transfer
ON territory_history;

CREATE TRIGGER trg_notify_territory_transfer
AFTER INSERT ON territory_history
FOR EACH ROW
WHEN (NEW.action = 'TRANSFERRED')
EXECUTE FUNCTION jq_notify_territory_transfer();


-- ==================================================
-- BACKFILL EXISTING CHALLENGES
-- ==================================================

INSERT INTO notifications (
  user_id,
  type,
  title,
  message,
  territory_id,
  challenge_id,
  activity_id,
  dedupe_key
)
SELECT
  t.user_id,
  'CHALLENGE_CREATED',
  'Territory Challenged',
  COALESCE(u.display_name, 'A runner')
    || ' challenged your territory.',
  tc.territory_id,
  tc.id,
  tc.activity_id,
  'challenge-created:' || tc.id::text
FROM territory_challenges tc
JOIN territories t
  ON t.id = tc.territory_id
JOIN users u
  ON u.id = tc.challenger_id
WHERE t.user_id <> tc.challenger_id
ON CONFLICT (dedupe_key) DO NOTHING;


-- ==================================================
-- BACKFILL EXISTING CHALLENGE RESULTS
-- ==================================================

INSERT INTO notifications (
  user_id,
  type,
  title,
  message,
  territory_id,
  challenge_id,
  activity_id,
  dedupe_key
)
SELECT
  tc.challenger_id,

  CASE
    WHEN tc.status = 'ACCEPTED'
      THEN 'CHALLENGE_ACCEPTED'
    ELSE 'CHALLENGE_REJECTED'
  END,

  CASE
    WHEN tc.status = 'ACCEPTED'
      THEN 'Challenge Accepted'
    ELSE 'Challenge Rejected'
  END,

  CASE
    WHEN tc.status = 'ACCEPTED'
      THEN 'Your territory challenge was accepted.'
    ELSE 'Your territory challenge was rejected.'
  END,

  tc.territory_id,
  tc.id,
  tc.activity_id,

  'challenge-status:'
    || tc.id::text
    || ':'
    || tc.status

FROM territory_challenges tc

WHERE tc.status IN ('ACCEPTED', 'REJECTED')

ON CONFLICT (dedupe_key) DO NOTHING;


-- ==================================================
-- BACKFILL EXISTING TRANSFERS
-- ==================================================

INSERT INTO notifications (
  user_id,
  type,
  title,
  message,
  territory_id,
  dedupe_key
)
SELECT
  th.new_owner_id,
  'TERRITORY_TRANSFERRED',
  'Territory Acquired',
  'You are now the owner of this territory.',
  th.territory_id,
  'territory-transfer:new-owner:' || th.id::text
FROM territory_history th
WHERE th.action = 'TRANSFERRED'
  AND th.new_owner_id IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;


INSERT INTO notifications (
  user_id,
  type,
  title,
  message,
  territory_id,
  dedupe_key
)
SELECT
  th.previous_owner_id,
  'TERRITORY_LOST',
  'Territory Transferred',
  'Your territory was transferred to another player.',
  th.territory_id,
  'territory-transfer:previous-owner:' || th.id::text
FROM territory_history th
WHERE th.action = 'TRANSFERRED'
  AND th.previous_owner_id IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;

-- ==================================================
-- SOCIAL
-- ==================================================

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  following_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  PRIMARY KEY (follower_id, following_id),

  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower
ON follows (follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_following
ON follows (following_id);


-- ==================================================
-- POSTS
-- ==================================================

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  activity_id UUID
    REFERENCES activities(id)
    ON DELETE SET NULL,

  content VARCHAR(500) NOT NULL
    DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_created
ON posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_created
ON posts (created_at DESC);


-- ==================================================
-- POST LIKES
-- ==================================================

CREATE TABLE IF NOT EXISTS post_likes (
  post_id UUID NOT NULL
    REFERENCES posts(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post
ON post_likes (post_id);

CREATE INDEX IF NOT EXISTS idx_post_likes_user
ON post_likes (user_id);


-- ==================================================
-- POST COMMENTS
-- ==================================================

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  post_id UUID NOT NULL
    REFERENCES posts(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  comment VARCHAR(500) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post
ON post_comments (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_post_comments_user
ON post_comments (user_id);


-- ==================================================
-- FOLLOW NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_follow_created()
RETURNS TRIGGER AS $$
DECLARE
  follower_name TEXT;
BEGIN
  SELECT display_name
  INTO follower_name
  FROM users
  WHERE id = NEW.follower_id;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    dedupe_key
  )
  VALUES (
    NEW.following_id,
    'NEW_FOLLOWER',
    'New Follower',
    COALESCE(follower_name, 'A runner')
      || ' started following you.',
    'follow:' || NEW.follower_id::text
      || ':' || NEW.following_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_follow_created
ON follows;

CREATE TRIGGER trg_notify_follow_created
AFTER INSERT ON follows
FOR EACH ROW
EXECUTE FUNCTION jq_notify_follow_created();


-- ==================================================
-- LIKE NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_post_like()
RETURNS TRIGGER AS $$
DECLARE
  post_owner UUID;
  liker_name TEXT;
BEGIN
  SELECT user_id
  INTO post_owner
  FROM posts
  WHERE id = NEW.post_id;

  IF post_owner IS NULL
     OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name
  INTO liker_name
  FROM users
  WHERE id = NEW.user_id;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    dedupe_key
  )
  VALUES (
    post_owner,
    'POST_LIKED',
    'Post Liked',
    COALESCE(liker_name, 'A runner')
      || ' liked your post.',
    'post-like:' || NEW.post_id::text
      || ':' || NEW.user_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_post_like
ON post_likes;

CREATE TRIGGER trg_notify_post_like
AFTER INSERT ON post_likes
FOR EACH ROW
EXECUTE FUNCTION jq_notify_post_like();


-- ==================================================
-- COMMENT NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_post_comment()
RETURNS TRIGGER AS $$
DECLARE
  post_owner UUID;
  commenter_name TEXT;
BEGIN
  SELECT user_id
  INTO post_owner
  FROM posts
  WHERE id = NEW.post_id;

  IF post_owner IS NULL
     OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name
  INTO commenter_name
  FROM users
  WHERE id = NEW.user_id;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    dedupe_key
  )
  VALUES (
    post_owner,
    'POST_COMMENTED',
    'New Comment',
    COALESCE(commenter_name, 'A runner')
      || ' commented on your post.',
    'post-comment:' || NEW.id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_post_comment
ON post_comments;

CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON post_comments
FOR EACH ROW
EXECUTE FUNCTION jq_notify_post_comment();

-- ==================================================
-- CLUBS
-- ==================================================

CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(100) NOT NULL,

  description VARCHAR(500) NOT NULL DEFAULT '',

  creator_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  is_public BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_clubs_creator
ON clubs (creator_id);

CREATE INDEX IF NOT EXISTS idx_clubs_created
ON clubs (created_at DESC);


-- ==================================================
-- CLUB MEMBERS
-- ==================================================

CREATE TABLE IF NOT EXISTS club_members (
  club_id UUID NOT NULL
    REFERENCES clubs(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_club
ON club_members (club_id);

CREATE INDEX IF NOT EXISTS idx_club_members_user
ON club_members (user_id);


-- ==================================================
-- COMPETITIONS
-- ==================================================

CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(120) NOT NULL,

  description VARCHAR(500) NOT NULL DEFAULT '',

  creator_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  metric VARCHAR(20) NOT NULL
    CHECK (
      metric IN (
        'DISTANCE',
        'TERRITORY',
        'ACTIVITIES'
      )
    ),

  start_at TIMESTAMPTZ NOT NULL,

  end_at TIMESTAMPTZ NOT NULL,

  is_public BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_competitions_start_end
ON competitions (start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_competitions_creator
ON competitions (creator_id);

CREATE INDEX IF NOT EXISTS idx_competitions_created
ON competitions (created_at DESC);


-- ==================================================
-- COMPETITION PARTICIPANTS
-- ==================================================

CREATE TABLE IF NOT EXISTS competition_participants (
  competition_id UUID NOT NULL
    REFERENCES competitions(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  joined_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  PRIMARY KEY (
    competition_id,
    user_id
  )
);

CREATE INDEX IF NOT EXISTS idx_competition_participants_competition
ON competition_participants (competition_id);

CREATE INDEX IF NOT EXISTS idx_competition_participants_user
ON competition_participants (user_id);

-- ==================================================
-- COMPETITION JOIN NOTIFICATION
-- ==================================================

CREATE OR REPLACE FUNCTION jq_notify_competition_join()
RETURNS TRIGGER AS $$
DECLARE
  competition_creator UUID;
  participant_name TEXT;
  competition_name TEXT;
BEGIN

  SELECT
    c.creator_id,
    c.name
  INTO
    competition_creator,
    competition_name
  FROM competitions c
  WHERE c.id = NEW.competition_id;

  IF
    competition_creator IS NULL
    OR competition_creator = NEW.user_id
  THEN
    RETURN NEW;
  END IF;

  SELECT
    display_name
  INTO participant_name
  FROM users
  WHERE id = NEW.user_id;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    competition_id,
    dedupe_key
  )
  VALUES (
    competition_creator,
    'COMPETITION_JOINED',
    'New Competition Participant',
    COALESCE(
      participant_name,
      'A runner'
    )
    || ' joined '
    || COALESCE(
      competition_name,
      'your competition'
    )
    || '.',
    NEW.competition_id,
    'competition-joined:'
      || NEW.competition_id::text
      || ':'
      || NEW.user_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;

END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS
trg_notify_competition_join
ON competition_participants;

CREATE TRIGGER
trg_notify_competition_join
AFTER INSERT ON competition_participants
FOR EACH ROW
EXECUTE FUNCTION
jq_notify_competition_join();