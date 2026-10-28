CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  city VARCHAR(100),
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

  media_url TEXT,
  media_type VARCHAR(16)
    CHECK (media_type IS NULL OR media_type IN ('image', 'video')),

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
-- CLUB JOIN REQUESTS
-- ==================================================

CREATE TABLE IF NOT EXISTS club_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_join_requests_owner_review
ON club_join_requests (club_id, status, created_at DESC);

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

  status VARCHAR(24) NOT NULL DEFAULT 'REGISTRATION_OPEN'
    CHECK (status IN (
      'DRAFT', 'REGISTRATION_OPEN', 'ACTIVE',
      'UNDER_REVIEW', 'COMPLETED', 'CANCELLED'
    )),

  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  max_participants INTEGER CHECK (
    max_participants IS NULL OR max_participants > 0
  ),

  is_public BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_competitions_start_end
ON competitions (start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_competitions_status_schedule
ON competitions (status, start_at, end_at);


-- Official, immutable challenge results snapshot.
CREATE TABLE IF NOT EXISTS competition_results (
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL CHECK (rank_position > 0),
  score NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (score >= 0),
  metric VARCHAR(20) NOT NULL
    CHECK (metric IN ('DISTANCE', 'ACTIVITIES', 'TERRITORY')),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_id, user_id),
  UNIQUE (competition_id, rank_position)
);

CREATE INDEX IF NOT EXISTS idx_competition_results_rank
  ON competition_results (competition_id, rank_position);

CREATE INDEX IF NOT EXISTS idx_competitions_creator
ON competitions (creator_id);

CREATE INDEX IF NOT EXISTS idx_competitions_created
ON competitions (created_at DESC);



-- Phase 7: append-only organizer/admin action history.
CREATE TABLE IF NOT EXISTS competition_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(60) NOT NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_id UUID,
  reason TEXT NOT NULL,
  before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_admin_audit_competition
  ON competition_admin_audit (competition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_admin_audit_actor
  ON competition_admin_audit (actor_user_id, created_at DESC);

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
-- COMPETITION PARTICIPATION AUDIT
-- ==================================================

CREATE TABLE IF NOT EXISTS competition_participation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(16) NOT NULL
    CHECK (event_type IN ('JOINED', 'WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_participation_events_competition
  ON competition_participation_events (competition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_participation_events_user
  ON competition_participation_events (user_id, created_at DESC);

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

-- ==================================================
-- DEVICE INTEGRATIONS
-- ==================================================

CREATE TABLE IF NOT EXISTS device_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  provider VARCHAR(30) NOT NULL,

  external_account_id VARCHAR(255),

  status VARCHAR(20) NOT NULL
    DEFAULT 'CONNECTED'
    CHECK (
      status IN (
        'CONNECTED',
        'DISCONNECTED',
        'ERROR'
      )
    ),

  connected_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  last_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_device_integrations_user
ON device_integrations (user_id);

CREATE INDEX IF NOT EXISTS idx_device_integrations_provider
ON device_integrations (provider);


-- ==================================================
-- EXTERNAL ACTIVITY SOURCE
-- ==================================================

ALTER TABLE activities
ADD COLUMN IF NOT EXISTS source_provider VARCHAR(30);

ALTER TABLE activities
ADD COLUMN IF NOT EXISTS external_activity_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external_source
ON activities (
  source_provider,
  external_activity_id
)
WHERE source_provider IS NOT NULL
  AND external_activity_id IS NOT NULL;

-- Community post media support (safe to run on existing databases).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(16);

-- Competition Phase 3: activity scoring

BEGIN;

-- One authoritative score record per activity per competition.
CREATE TABLE IF NOT EXISTS competition_activity_scores (
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  metric VARCHAR(20) NOT NULL
    CHECK (metric IN ('DISTANCE', 'ACTIVITIES', 'TERRITORY')),
  score NUMERIC(14, 4) NOT NULL DEFAULT 0
    CHECK (score >= 0),
  scoring_status VARCHAR(16) NOT NULL
    CHECK (scoring_status IN ('SCORED', 'REVIEW')),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_activity_scores_rank
ON competition_activity_scores (competition_id, scoring_status, score DESC);

CREATE INDEX IF NOT EXISTS idx_comp_activity_scores_user
ON competition_activity_scores (competition_id, user_id);

-- Suspicion is a review signal, not an automatic disqualification.
CREATE TABLE IF NOT EXISTS competition_activity_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  activity_id UUID NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(60) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  UNIQUE (competition_id, activity_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_comp_activity_flags_open
ON competition_activity_flags (created_at DESC)
WHERE resolved_at IS NULL;

-- Organizer score overrides are authoritative unless an activity
-- is flagged for review. Kept separately from automatic scoring provenance.
CREATE TABLE IF NOT EXISTS competition_activity_score_overrides (
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL
    REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  corrected_score NUMERIC(14, 4) NOT NULL
    CHECK (corrected_score >= 0),
  actor_user_id UUID
    REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  review_decision VARCHAR(20)
    CHECK (review_decision IN ('APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_score_overrides_user
  ON competition_activity_score_overrides (competition_id, user_id);

-- Rebuild one activity's score records from trusted database rows.
CREATE OR REPLACE FUNCTION jq_recalculate_competition_activity(
  target_activity_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  a RECORD;
  activity_found BOOLEAN := FALSE;
  speed_kmh DOUBLE PRECISION;
  flag_reason TEXT;
  flag_details JSONB;
BEGIN
  SELECT id, user_id, activity_type, distance_km, elapsed_seconds,
         started_at, finished_at
  INTO a
  FROM activities
  WHERE id = target_activity_id;

  activity_found := FOUND;

  -- Preserve existing score rows during recalculation so organizer
  -- overrides survive. Remove scores only when the source activity is gone.
  IF NOT activity_found THEN
    DELETE FROM competition_activity_scores
    WHERE activity_id = target_activity_id;
    RETURN;
  END IF;

  -- Missing/incomplete or contradictory timing cannot earn points.
  IF a.started_at IS NULL
     OR a.finished_at IS NULL
     OR a.finished_at <= a.started_at
     OR a.distance_km IS NULL
     OR a.distance_km <= 0
     OR a.elapsed_seconds IS NULL
     OR a.elapsed_seconds <= 0 THEN
    UPDATE competition_activity_flags
    SET resolved_at = NOW(),
        resolution_note =
          'Automatically resolved because activity is no longer eligible for scoring.'
    WHERE activity_id = target_activity_id
      AND resolved_at IS NULL;

    DELETE FROM competition_activity_scores
    WHERE activity_id = target_activity_id;

    RETURN;
  END IF;

  speed_kmh := a.distance_km * 3600.0 / a.elapsed_seconds;
  flag_reason := NULL;

  IF a.finished_at - a.started_at > INTERVAL '24 hours' THEN
    flag_reason := 'DURATION_IMPLAUSIBLE';
  ELSIF (a.activity_type = 'Walk' AND speed_kmh > 15)
     OR (a.activity_type = 'Run' AND speed_kmh > 35)
     OR (a.activity_type = 'Cycle' AND speed_kmh > 120) THEN
    flag_reason := 'SPEED_IMPLAUSIBLE';
  END IF;

  -- Record a review signal. Do not award points for flagged activities.
  IF flag_reason IS NOT NULL THEN
    INSERT INTO competition_activity_flags (
      competition_id, activity_id, user_id, reason, details
    )
    SELECT c.id, a.id, a.user_id, flag_reason,
      jsonb_build_object(
        'activityType', a.activity_type,
        'distanceKm', a.distance_km,
        'elapsedSeconds', a.elapsed_seconds,
        'calculatedSpeedKmh', ROUND(speed_kmh::numeric, 3),
        'rule', 'Flag for human review; not automatic disqualification'
      )
    FROM competitions c
    JOIN competition_participants cp
      ON cp.competition_id = c.id AND cp.user_id = a.user_id
    WHERE c.status NOT IN ('DRAFT', 'CANCELLED', 'COMPLETED')
      AND a.started_at >= c.start_at
      AND a.finished_at <= c.end_at
      AND NOT EXISTS (
        SELECT 1
        FROM competition_activity_score_overrides decision_override
        WHERE decision_override.competition_id = c.id
          AND decision_override.activity_id = a.id
          AND decision_override.review_decision IN ('APPROVED', 'REJECTED')
      )
    ON CONFLICT (competition_id, activity_id, reason) DO UPDATE
      SET details = EXCLUDED.details,
          created_at = NOW(),
          resolved_at = NULL,
          resolved_by = NULL,
          resolution_note = NULL;

    -- A changed suspicion reason supersedes the previous open flag.
    UPDATE competition_activity_flags
    SET resolved_at = NOW(),
        resolution_note =
          'Automatically superseded by a newer scoring review signal.'
    WHERE activity_id = a.id
      AND reason <> flag_reason
      AND resolved_at IS NULL;

  ELSE
    -- Preserve the audit record but close stale flags after correction.
    UPDATE competition_activity_flags
    SET resolved_at = NOW(),
        resolution_note =
          'Automatically resolved after activity passed scoring validation.'
    WHERE activity_id = a.id
      AND resolved_at IS NULL;
  END IF;

  INSERT INTO competition_activity_scores (
    competition_id, activity_id, user_id, metric,
    score, scoring_status, provenance, calculated_at
  )
  SELECT
    c.id,
    a.id,
    a.user_id,
    c.metric,
    CASE
      WHEN score_override.review_decision = 'REJECTED' THEN 0
      WHEN flag_reason IS NOT NULL
        AND score_override.review_decision IS DISTINCT FROM 'APPROVED'
        AND score_override.review_decision IS DISTINCT FROM 'REJECTED'
        THEN 0
      WHEN score_override.corrected_score IS NOT NULL
        THEN score_override.corrected_score
      WHEN c.metric = 'DISTANCE' THEN a.distance_km::numeric
      WHEN c.metric = 'ACTIVITIES' THEN 1::numeric
      WHEN c.metric = 'TERRITORY' THEN
        COALESCE((
          SELECT SUM(t.area_km2)::numeric
          FROM territories t
          WHERE t.activity_id = a.id
            AND t.user_id = a.user_id
        ), 0)
      ELSE 0
    END,
    CASE
      WHEN flag_reason IS NOT NULL
        AND score_override.review_decision IS DISTINCT FROM 'APPROVED'
        AND score_override.review_decision IS DISTINCT FROM 'REJECTED'
        THEN 'REVIEW'
      ELSE 'SCORED'
    END,
    jsonb_build_object(
      'activityType', a.activity_type,
      'startedAt', a.started_at,
      'finishedAt', a.finished_at,
      'distanceKm', a.distance_km,
      'elapsedSeconds', a.elapsed_seconds,
      'calculatedSpeedKmh', ROUND(speed_kmh::numeric, 3),
      'metric', c.metric,
      'ruleVersion', 1,
      'scoreSource', CASE
        WHEN score_override.review_decision = 'REJECTED' THEN 'organizer-rejected'
        WHEN score_override.review_decision = 'APPROVED' THEN 'organizer-approved'
        WHEN flag_reason IS NOT NULL THEN 'server-review'
        WHEN score_override.corrected_score IS NOT NULL THEN 'organizer-override'
        ELSE 'server'
      END,
      'reviewReason', CASE
        WHEN score_override.review_decision IS NOT NULL THEN NULL
        ELSE flag_reason
      END,
      'manualCorrection', CASE
        WHEN score_override.corrected_score IS NULL THEN NULL
        ELSE jsonb_build_object(
          'actorUserId', score_override.actor_user_id,
          'reason', score_override.reason,
          'correctedAt', score_override.updated_at,
          'correctedScore', score_override.corrected_score
        )
      END
    ),
    NOW()
  FROM competitions c
  LEFT JOIN competition_activity_score_overrides score_override
    ON score_override.competition_id = c.id
   AND score_override.activity_id = a.id
  JOIN competition_participants cp
    ON cp.competition_id = c.id AND cp.user_id = a.user_id
  WHERE c.metric IN ('DISTANCE', 'ACTIVITIES', 'TERRITORY')
    AND c.status NOT IN ('DRAFT', 'CANCELLED', 'COMPLETED')
    AND a.started_at >= c.start_at
    AND a.finished_at <= c.end_at
    AND (
      c.metric <> 'TERRITORY'
      OR EXISTS (
        SELECT 1 FROM territories t
        WHERE t.activity_id = a.id AND t.user_id = a.user_id
      )
    )
  ON CONFLICT (competition_id, activity_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    metric = EXCLUDED.metric,
    score = EXCLUDED.score,
    scoring_status = EXCLUDED.scoring_status,
    provenance = EXCLUDED.provenance,
    calculated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION jq_activity_score_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM competition_activity_scores WHERE activity_id = OLD.id;
    RETURN OLD;
  END IF;

  PERFORM jq_recalculate_competition_activity(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jq_activity_score ON activities;
CREATE TRIGGER trg_jq_activity_score
AFTER INSERT OR UPDATE OR DELETE ON activities
FOR EACH ROW EXECUTE FUNCTION jq_activity_score_trigger();

-- Territory creation/correction can change TERRITORY challenge scores.
CREATE OR REPLACE FUNCTION jq_territory_score_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.activity_id IS NOT NULL THEN
      PERFORM jq_recalculate_competition_activity(OLD.activity_id);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.activity_id IS NOT NULL THEN
      PERFORM jq_recalculate_competition_activity(OLD.activity_id);
    END IF;

    IF NEW.activity_id IS NOT NULL
       AND NEW.activity_id IS DISTINCT FROM OLD.activity_id THEN
      PERFORM jq_recalculate_competition_activity(NEW.activity_id);
    ELSIF NEW.activity_id IS NOT NULL THEN
      PERFORM jq_recalculate_competition_activity(NEW.activity_id);
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.activity_id IS NOT NULL THEN
    PERFORM jq_recalculate_competition_activity(NEW.activity_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jq_territory_score ON territories;
CREATE TRIGGER trg_jq_territory_score
AFTER INSERT OR UPDATE OR DELETE ON territories
FOR EACH ROW EXECUTE FUNCTION jq_territory_score_trigger();

COMMIT;


-- JOGQUEST COMPETITION STATUS NOTIFICATIONS
-- In-app notifications when a joined challenge changes lifecycle status.
CREATE OR REPLACE FUNCTION jq_notify_competition_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
  notification_type TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'ACTIVE' THEN
      notification_type := 'COMPETITION_STARTED';
      notification_title := 'Challenge Started';
      notification_message := 'The challenge "' || NEW.name || '" has started.';
    WHEN 'UNDER_REVIEW' THEN
      notification_type := 'COMPETITION_UNDER_REVIEW';
      notification_title := 'Challenge Under Review';
      notification_message := 'The challenge "' || NEW.name || '" is under review.';
    WHEN 'CANCELLED' THEN
      notification_type := 'COMPETITION_CANCELLED';
      notification_title := 'Challenge Cancelled';
      notification_message := 'The challenge "' || NEW.name || '" has been cancelled.';
    WHEN 'COMPLETED' THEN
      notification_type := 'COMPETITION_RESULTS_PUBLISHED';
      notification_title := 'Challenge Results Published';
      notification_message := 'Official results are available for "' || NEW.name || '".';
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    competition_id,
    dedupe_key
  )
  SELECT
    cp.user_id,
    notification_type,
    notification_title,
    notification_message,
    NEW.id,
    'competition-status:' || NEW.id::text || ':' || NEW.status
  FROM competition_participants cp
  WHERE cp.competition_id = NEW.id
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_competition_status_change
ON competitions;

CREATE TRIGGER trg_notify_competition_status_change
AFTER UPDATE OF status ON competitions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION jq_notify_competition_status_change();

