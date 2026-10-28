BEGIN;

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

ALTER TABLE competition_activity_score_overrides
  ADD COLUMN IF NOT EXISTS review_decision VARCHAR(20)
  CHECK (review_decision IN ('APPROVED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS idx_comp_score_overrides_user
  ON competition_activity_score_overrides (competition_id, user_id);


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

CREATE INDEX IF NOT EXISTS idx_competition_admin_audit_recent
  ON competition_admin_audit (competition_id, created_at DESC);

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

COMMIT;