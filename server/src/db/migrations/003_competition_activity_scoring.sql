-- JogQuest Challenge Module — Phase 3 activity scoring

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

  -- An activity may have been deleted or invalidated.
  DELETE FROM competition_activity_scores
  WHERE activity_id = target_activity_id;

  IF NOT activity_found THEN
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
      WHEN flag_reason IS NOT NULL THEN 0
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
    CASE WHEN flag_reason IS NOT NULL THEN 'REVIEW' ELSE 'SCORED' END,
    jsonb_build_object(
      'activityType', a.activity_type,
      'startedAt', a.started_at,
      'finishedAt', a.finished_at,
      'distanceKm', a.distance_km,
      'elapsedSeconds', a.elapsed_seconds,
      'calculatedSpeedKmh', ROUND(speed_kmh::numeric, 3),
      'metric', c.metric,
      'ruleVersion', 1,
      'scoreSource', 'server',
      'reviewReason', flag_reason
    ),
    NOW()
  FROM competitions c
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

